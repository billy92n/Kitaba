import { randomUUID } from "node:crypto";
import type { GameEvent } from "../domain/events.js";
import type { PerceptibleFacts } from "../domain/knowledge.js";
import type { EntityId, WorldState } from "../domain/world.js";
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

export type PrepareAutonomousTurnResult =
  | { success: true; prepared: PreparedAutonomousTurn }
  | {
      success: false;
      code:
        | AutonomousContextFailureCode
        | "NO_ELIGIBLE_ACTION"
        | "DUPLICATE_CANDIDATE_KEY"
        | "INVALID_AUTONOMY_IDENTITY"
        | "UNBOUND_TARGETED_CANDIDATE";
      reason: string;
      decisionTrace?: AutonomousDecisionTrace;
    };

export type AutonomousTurnResult =
  | {
      status: "COMMITTED";
      decisionTrace: AutonomousDecisionTrace;
      event: GameEvent;
      worldState: WorldState;
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
      code:
        | AutonomousContextFailureCode
        | "NO_ELIGIBLE_ACTION"
        | "DUPLICATE_CANDIDATE_KEY"
        | "INVALID_AUTONOMY_IDENTITY"
        | "UNBOUND_TARGETED_CANDIDATE"
        | "SESSION_VERSION_MISMATCH";
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
): PrepareAutonomousTurnResult {
  const context = buildAutonomousDecisionInput(state, actorId);
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
  return {
    success: true,
    prepared: {
      decisionTrace: decision.trace,
      resolution: resolveAction(state, actorId, decision.action, {
        createEventId,
      }),
    },
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
    effectiveDependencies.createEventId,
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
    ? effectiveDependencies.narrate(observerFacts)
    : null;
  const narrativeHistory = observerNarration
    ? [
        ...session.narrativeHistory,
        {
          id: effectiveDependencies.createNarrativeEntryId(),
          type: "narrator" as const,
          text: observerNarration,
          timestamp: effectiveDependencies.nowIso(),
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
        autoSaveId: effectiveDependencies.createAutoSaveId(),
      },
      effectiveDependencies.commitPort,
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
    observerFacts,
    observerNarration,
  };
}
