import { randomUUID } from "node:crypto";
import type { GameEvent } from "../domain/events.js";
import type { PerceptibleFacts } from "../domain/knowledge.js";
import type { EntityId, WorldState } from "../domain/world.js";
import type {
  ScheduledActivation,
  WorldSchedulerState,
} from "../domain/scheduler.js";
import {
  buildAutonomousDecisionInput,
  type AutonomousContextFailureCode,
} from "../engine/autonomyContext.js";
import {
  decideAutonomousAction,
  type AutonomousDecisionConfig,
  type AutonomousDecisionTrace,
} from "../engine/autonomyDecision.js";
import {
  resolveAction,
  type ResolvedAction,
} from "../engine/actionResolver.js";
import { buildPerceptibleFacts } from "../engine/perceptionEngine.js";
import {
  completeScheduledActivation,
  materializeScheduledActivation,
  SchedulerInvariantError,
  type ResolvedWorldSchedulerConfig,
  type SchedulerFailureCode,
} from "../engine/worldScheduler.js";
import { narrateFromPerception } from "../llm/narrateResult.js";
import type { NarrativeEntry } from "../persistence/types.js";
import {
  commitAction,
  WorldVersionConflictError,
  type ActionCommitPort,
} from "./actionCommit.js";

export interface AutonomousSessionSnapshot {
  id: string;
  controlledEntityId: EntityId;
  worldVersion: number;
  worldState: WorldState;
  narrativeHistory: NarrativeEntry[];
}

export interface AutonomousTurnDependencies {
  loadSession(sessionId: string): Promise<AutonomousSessionSnapshot | null>;
  commitPort: ActionCommitPort;
  createEventId(): string;
  createNarrativeEntryId(): string;
  createAutoSaveId(): string;
  nowIso(): string;
  narrate(facts: PerceptibleFacts): string;
}

export interface PreparedAutonomousTurn {
  decisionTrace: AutonomousDecisionTrace;
  resolution: ResolvedAction;
}

export interface ScheduledTurnContext {
  activation: ScheduledActivation;
  config: ResolvedWorldSchedulerConfig;
}

type AutonomousTurnFailureCode =
  | AutonomousContextFailureCode
  | SchedulerFailureCode
  | "NO_ELIGIBLE_ACTION"
  | "DUPLICATE_CANDIDATE_KEY"
  | "INVALID_AUTONOMY_IDENTITY"
  | "UNBOUND_TARGETED_CANDIDATE"
  | "SCHEDULED_ACTION_REJECTED";

export type PrepareAutonomousTurnResult =
  | { success: true; prepared: PreparedAutonomousTurn }
  | {
      success: false;
      code: AutonomousTurnFailureCode;
      reason: string;
      decisionTrace?: AutonomousDecisionTrace;
    };

export type AutonomousTurnResult =
  | {
      status: "COMMITTED";
      decisionTrace: AutonomousDecisionTrace;
      event: GameEvent;
      worldState: WorldState;
      narrativeHistory: NarrativeEntry[];
      observerFacts: PerceptibleFacts | null;
      observerNarration: string | null;
    }
  | {
      status: "CONFLICT";
      decisionTrace: AutonomousDecisionTrace;
      attemptedEventId: string;
      code: "WORLD_VERSION_CONFLICT";
    }
  | {
      status: "NOT_FOUND";
      code: "SESSION_NOT_FOUND";
    }
  | {
      status: "REFUSED";
      code: AutonomousTurnFailureCode | "SESSION_VERSION_MISMATCH";
      reason: string;
      decisionTrace?: AutonomousDecisionTrace;
    };

async function createDefaultDependencies(): Promise<AutonomousTurnDependencies> {
  const [{ loadSession }, { postgresActionCommitPort }] = await Promise.all([
    import("../persistence/worldRepository.js"),
    import("./postgresActionCommit.js"),
  ]);
  return {
    loadSession,
    commitPort: postgresActionCommitPort,
    createEventId: randomUUID,
    createNarrativeEntryId: randomUUID,
    createAutoSaveId: randomUUID,
    nowIso: () => new Date().toISOString(),
    narrate: narrateFromPerception,
  };
}

function bindEventToSession(event: GameEvent, sessionId: string): GameEvent {
  return { ...event, sessionId };
}

export function prepareAutonomousTurn(
  state: WorldState,
  actorId: EntityId,
  config: AutonomousDecisionConfig,
  createEventId: () => string,
  scheduled?: ScheduledTurnContext,
): PrepareAutonomousTurnResult {
  let decisionState = state;
  if (scheduled) {
    try {
      decisionState = materializeScheduledActivation(
        state as WorldState & { scheduler: WorldSchedulerState },
        scheduled.activation,
        scheduled.config,
      );
    } catch (error) {
      if (error instanceof SchedulerInvariantError) {
        return { success: false, code: error.code, reason: error.message };
      }
      throw error;
    }
  }
  const context = buildAutonomousDecisionInput(decisionState, actorId);
  if (!context.success) return context;
  const decision = decideAutonomousAction(context.input, config);
  if (!decision.success) {
    return {
      success: false,
      code: decision.code,
      reason: decision.trace.reason,
      decisionTrace: decision.trace,
    };
  }
  const resolution = resolveAction(decisionState, actorId, decision.action, {
    createEventId,
  });
  if (scheduled && !resolution.success) {
    return {
      success: false,
      code: "SCHEDULED_ACTION_REJECTED",
      reason: `The selected action was rejected with ${resolution.failureCode}.`,
      decisionTrace: decision.trace,
    };
  }
  const scheduledResolution =
    scheduled && resolution.success
      ? {
          ...resolution,
          newWorldState: completeScheduledActivation(
            resolution.newWorldState as WorldState & {
              scheduler: WorldSchedulerState;
            },
            scheduled.activation,
            scheduled.config,
          ),
        }
      : resolution;
  return {
    success: true,
    prepared: {
      decisionTrace: decision.trace,
      resolution: scheduledResolution,
    },
  };
}

export async function runAutonomousTurnFromSnapshot(
  session: AutonomousSessionSnapshot,
  actorId: EntityId,
  config: AutonomousDecisionConfig,
  dependencies: AutonomousTurnDependencies,
  scheduled?: ScheduledTurnContext,
): Promise<AutonomousTurnResult> {
  const sessionId = session.id;
  if (session.worldVersion !== session.worldState.worldVersion) {
    return {
      status: "REFUSED",
      code: "SESSION_VERSION_MISMATCH",
      reason:
        "The persisted session revision and serialized world revision differ.",
    };
  }

  const planned = prepareAutonomousTurn(
    session.worldState,
    actorId,
    config,
    dependencies.createEventId,
    scheduled,
  );
  if (!planned.success) {
    return {
      status: "REFUSED",
      code: planned.code,
      reason: planned.reason,
      decisionTrace: planned.decisionTrace,
    };
  }

  const event = bindEventToSession(
    planned.prepared.resolution.event,
    sessionId,
  );
  const newWorldState = planned.prepared.resolution.newWorldState;
  const observerPerception = buildPerceptibleFacts(
    newWorldState,
    session.controlledEntityId,
    event,
  );
  const observerFacts =
    observerPerception.success &&
    observerPerception.facts.actionOutcome !== null
      ? observerPerception.facts
      : null;
  const observerNarration = observerFacts
    ? dependencies.narrate(observerFacts)
    : null;
  const narrativeHistory = observerNarration
    ? [
        ...session.narrativeHistory,
        {
          id: dependencies.createNarrativeEntryId(),
          type: "narrator" as const,
          text: observerNarration,
          timestamp: dependencies.nowIso(),
        },
      ]
    : [...session.narrativeHistory];

  try {
    await commitAction(
      {
        sessionId,
        expectedWorldVersion: session.worldVersion,
        expectedNarrativeHistory: session.narrativeHistory,
        newWorldState,
        narrativeHistory,
        event,
        autoSaveId: dependencies.createAutoSaveId(),
      },
      dependencies.commitPort,
    );
  } catch (error) {
    if (error instanceof WorldVersionConflictError) {
      return {
        status: "CONFLICT",
        code: error.code,
        decisionTrace: planned.prepared.decisionTrace,
        attemptedEventId: event.id,
      };
    }
    throw error;
  }

  return {
    status: "COMMITTED",
    decisionTrace: planned.prepared.decisionTrace,
    event,
    worldState: newWorldState,
    narrativeHistory,
    observerFacts,
    observerNarration,
  };
}

export async function runAutonomousTurn(
  sessionId: string,
  actorId: EntityId,
  config: AutonomousDecisionConfig,
  dependencies?: AutonomousTurnDependencies,
): Promise<AutonomousTurnResult> {
  const effectiveDependencies =
    dependencies ?? (await createDefaultDependencies());
  const session = await effectiveDependencies.loadSession(sessionId);
  if (!session) {
    return { status: "NOT_FOUND", code: "SESSION_NOT_FOUND" };
  }
  return runAutonomousTurnFromSnapshot(
    session,
    actorId,
    config,
    effectiveDependencies,
  );
}
