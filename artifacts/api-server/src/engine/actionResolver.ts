// Orchestre validation, conséquences et temps sans interpréter le langage naturel.

import { randomUUID } from "crypto";
import type { StructuredAction } from "../domain/actions.js";
import type { GameEvent } from "../domain/events.js";
import type { ActionOutcome } from "../domain/knowledge.js";
import type { EntityId, WorldState } from "../domain/world.js";
import { validateAction, type ActionFailureCode } from "./actionValidator.js";
import { applyConsequences } from "./consequenceEngine.js";
import { applyTimeAndDecay } from "./timeEngine.js";

export const UNRESOLVED_LOCATION_ID = "unresolved";

export interface ResolutionDependencies {
  createEventId(): string;
}

const defaultDependencies: ResolutionDependencies = {
  createEventId: randomUUID,
};

interface ResolutionBase {
  newWorldState: WorldState;
  event: GameEvent;
  actionOutcome: ActionOutcome;
}

export interface ResolvedActionSuccess extends ResolutionBase {
  success: true;
}

export interface ResolvedActionFailure extends ResolutionBase {
  success: false;
  failureCode: ActionFailureCode;
}

export type ResolvedAction = ResolvedActionSuccess | ResolvedActionFailure;

export function resolveAction(
  state: WorldState,
  actorId: EntityId,
  action: StructuredAction,
  dependencies: ResolutionDependencies = defaultDependencies,
): ResolvedAction {
  const validation = validateAction(state, actorId, action);

  if (!validation.possible) {
    const event: GameEvent = {
      id: dependencies.createEventId(),
      sessionId: "",
      worldVersion: state.worldVersion,
      actionType: action.actionType,
      actorId,
      locationId: validation.actor?.locationId ?? UNRESOLVED_LOCATION_ID,
      targetId: null,
      description: `[BLOQUÉ] [${validation.code}] ${validation.reason}`,
      consequences: [],
      occurredAt: state.time,
    };
    return {
      success: false,
      failureCode: validation.code,
      newWorldState: state,
      event,
      actionOutcome: {
        actionType: action.actionType,
        success: false,
        targetName: action.targetName,
        observableFacts: [validation.reason],
      },
    };
  }

  const consequence = applyConsequences(state, validation.context);
  const stateAfterTime = applyTimeAndDecay(
    consequence.newWorldState,
    consequence.actorAfter,
    action.actionType,
  );
  const newWorldState: WorldState = {
    ...stateAfterTime,
    worldVersion: state.worldVersion + 1,
  };

  return {
    success: true,
    newWorldState,
    event: {
      id: dependencies.createEventId(),
      sessionId: "",
      worldVersion: newWorldState.worldVersion,
      actionType: action.actionType,
      actorId: validation.context.actor.id,
      // Convention : lieu de départ, afin de préserver le contexte de l'action.
      locationId: validation.context.location.id,
      targetId: consequence.targetId,
      description: `${validation.context.actor.name} : ${action.actionType} → ${action.targetName ?? "—"}`,
      consequences: consequence.consequences,
      // Convention : instant du monde avant l'application du coût temporel.
      occurredAt: state.time,
    },
    actionOutcome: {
      actionType: action.actionType,
      success: true,
      targetName: action.targetName,
      observableFacts: consequence.observableFacts,
    },
  };
}
