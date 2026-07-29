import { createHash } from "node:crypto";
import type { EntityId } from "../domain/world.js";
import type {
  ScheduledActivation,
  WorldSchedulerConfig,
} from "../domain/scheduler.js";
import type { AutonomousDecisionConfig } from "../engine/autonomyDecision.js";
import {
  ensureWorldScheduler,
  resolveWorldSchedulerConfig,
  SchedulerInvariantError,
  selectScheduledActivation,
  type SchedulerFailureCode,
} from "../engine/worldScheduler.js";
import { narrateFromPerception } from "../llm/narrateResult.js";
import {
  runAutonomousTurnFromSnapshot,
  type AutonomousSessionSnapshot,
  type AutonomousTurnDependencies,
  type AutonomousTurnResult,
} from "./autonomousTurn.js";
import type { ActionCommitPort } from "./actionCommit.js";

export interface WorldSchedulerBatchConfig extends WorldSchedulerConfig {
  seed: string;
  autonomy?: Omit<AutonomousDecisionConfig, "seed">;
}

export interface WorldSchedulerBatchDependencies {
  loadSession(sessionId: string): Promise<AutonomousSessionSnapshot | null>;
  commitPort: ActionCommitPort;
}

export interface CompletedScheduledActivation extends ScheduledActivation {
  eventId: string;
  selectedCandidateKey: string;
  worldVersion: number;
}

export type WorldSchedulerBatchResult =
  | {
      status: "COMPLETED";
      stopReason: "BUDGET_EXHAUSTED" | "NO_ACTIVE_ACTOR" | "FAIRNESS_BOUNDARY";
      spentBudget: number;
      remainingBudget: number;
      activations: CompletedScheduledActivation[];
      worldState: AutonomousSessionSnapshot["worldState"];
    }
  | { status: "NOT_FOUND"; code: "SESSION_NOT_FOUND" }
  | {
      status: "CONFLICT";
      code: "WORLD_VERSION_CONFLICT";
      spentBudget: number;
      activations: CompletedScheduledActivation[];
      attemptedActorId: EntityId;
    }
  | {
      status: "REFUSED";
      code:
        | SchedulerFailureCode
        | Extract<AutonomousTurnResult, { status: "REFUSED" }>["code"];
      reason: string;
      spentBudget: number;
      activations: CompletedScheduledActivation[];
    };

async function createDefaultDependencies(): Promise<WorldSchedulerBatchDependencies> {
  const [{ loadSession }, { postgresActionCommitPort }] = await Promise.all([
    import("../persistence/worldRepository.js"),
    import("./postgresActionCommit.js"),
  ]);
  return { loadSession, commitPort: postgresActionCommitPort };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function activationKey(
  schedulerSeed: string,
  activation: ScheduledActivation,
): string {
  return [
    schedulerSeed,
    activation.schedulerRevision,
    activation.actorId,
    activation.dueMinute,
    activation.lod,
  ].join("\u0000");
}

function deterministicId(key: string, kind: string): string {
  return `scheduler-${kind}-${digest(`${key}\u0000${kind}`).slice(0, 32)}`;
}

function deterministicUnit(key: string): number {
  return Number.parseInt(digest(key).slice(0, 8), 16) / 0x1_0000_0000;
}

function deterministicTimestamp(dueMinute: number): string {
  const milliseconds = Math.min(dueMinute * 60_000, 8_640_000_000_000_000);
  return new Date(milliseconds).toISOString();
}

function turnDependencies(
  sessionId: string,
  activation: ScheduledActivation,
  schedulerSeed: string,
  dependencies: WorldSchedulerBatchDependencies,
): AutonomousTurnDependencies {
  const replayKey = activationKey(schedulerSeed, activation);
  const persistenceKey = `${sessionId}\u0000${replayKey}`;
  return {
    loadSession: dependencies.loadSession,
    commitPort: dependencies.commitPort,
    createEventId: () => deterministicId(persistenceKey, "event"),
    createNarrativeEntryId: () => deterministicId(persistenceKey, "narrative"),
    createAutoSaveId: () => deterministicId(persistenceKey, "autosave"),
    nowIso: () => deterministicTimestamp(activation.dueMinute),
    narrate: (facts) =>
      narrateFromPerception(facts, () =>
        deterministicUnit(`${replayKey}\u0000narration`),
      ),
  };
}

export async function runWorldSchedulerBatch(
  sessionId: string,
  config: WorldSchedulerBatchConfig,
  dependencies?: WorldSchedulerBatchDependencies,
): Promise<WorldSchedulerBatchResult> {
  const effectiveDependencies =
    dependencies ?? (await createDefaultDependencies());
  let session = await effectiveDependencies.loadSession(sessionId);
  if (!session) return { status: "NOT_FOUND", code: "SESSION_NOT_FOUND" };

  let schedulerConfig;
  try {
    schedulerConfig = resolveWorldSchedulerConfig(config);
    session = {
      ...session,
      worldState: ensureWorldScheduler(session.worldState, config.seed),
    };
  } catch (error) {
    if (error instanceof SchedulerInvariantError) {
      return {
        status: "REFUSED",
        code: error.code,
        reason: error.message,
        spentBudget: 0,
        activations: [],
      };
    }
    throw error;
  }

  const completed: CompletedScheduledActivation[] = [];
  const visitedActorIds = new Set<EntityId>();
  let remainingBudget = schedulerConfig.budgetUnits;

  while (true) {
    const scheduler = session.worldState.scheduler;
    if (!scheduler) {
      throw new SchedulerInvariantError(
        "INVALID_SCHEDULER_STATE",
        "The scheduler disappeared during a batch.",
      );
    }
    const activation = selectScheduledActivation(scheduler, schedulerConfig);
    if (!activation) {
      return {
        status: "COMPLETED",
        stopReason: "NO_ACTIVE_ACTOR",
        spentBudget: schedulerConfig.budgetUnits - remainingBudget,
        remainingBudget,
        activations: completed,
        worldState: session.worldState,
      };
    }
    if (visitedActorIds.has(activation.actorId)) {
      return {
        status: "COMPLETED",
        stopReason: "FAIRNESS_BOUNDARY",
        spentBudget: schedulerConfig.budgetUnits - remainingBudget,
        remainingBudget,
        activations: completed,
        worldState: session.worldState,
      };
    }
    if (activation.budgetCost > remainingBudget) {
      return {
        status: "COMPLETED",
        stopReason: "BUDGET_EXHAUSTED",
        spentBudget: schedulerConfig.budgetUnits - remainingBudget,
        remainingBudget,
        activations: completed,
        worldState: session.worldState,
      };
    }

    const key = activationKey(scheduler.seed, activation);
    const turn = await runAutonomousTurnFromSnapshot(
      session,
      activation.actorId,
      { ...config.autonomy, seed: digest(key) },
      turnDependencies(
        sessionId,
        activation,
        scheduler.seed,
        effectiveDependencies,
      ),
      { activation, config: schedulerConfig },
    );
    if (turn.status === "CONFLICT") {
      return {
        status: "CONFLICT",
        code: turn.code,
        spentBudget: schedulerConfig.budgetUnits - remainingBudget,
        activations: completed,
        attemptedActorId: activation.actorId,
      };
    }
    if (turn.status === "REFUSED") {
      return {
        status: "REFUSED",
        code: turn.code,
        reason: turn.reason,
        spentBudget: schedulerConfig.budgetUnits - remainingBudget,
        activations: completed,
      };
    }
    if (turn.status === "NOT_FOUND") {
      return { status: "NOT_FOUND", code: turn.code };
    }

    remainingBudget -= activation.budgetCost;
    visitedActorIds.add(activation.actorId);
    completed.push({
      ...activation,
      eventId: turn.event.id,
      selectedCandidateKey: turn.decisionTrace.selectedCandidateKey ?? "",
      worldVersion: turn.worldState.worldVersion,
    });
    session = {
      ...session,
      worldVersion: turn.worldState.worldVersion,
      worldState: turn.worldState,
      narrativeHistory: turn.narrativeHistory,
    };
  }
}
