// Orchestre validation, conséquences et temps sans interpréter le langage naturel.

import { randomUUID } from "crypto";
import type { StructuredAction } from "../domain/actions.js";
import type { GameEvent } from "../domain/events.js";
import type { EntityId, WorldState } from "../domain/world.js";
import { validateAction, type ActionFailureCode } from "./actionValidator.js";
import { applyConsequences } from "./consequenceEngine.js";
import { applyTimeAndDecay, catchUpEntity } from "./timeEngine.js";

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
  const storedActor = state.entities[actorId];
  const activeActor = storedActor
    ? catchUpEntity(storedActor, state.time)
    : undefined;
  const activeState =
    activeActor && activeActor !== storedActor
      ? {
          ...state,
          entities: { ...state.entities, [actorId]: activeActor },
        }
      : state;
  const validation = validateAction(activeState, actorId, action);

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
      status: "REJECTED",
      requestedTargetName: action.targetName,
      observations: [{ audience: "ACTOR", text: validation.reason }],
    };
    return {
      success: false,
      failureCode: validation.code,
      newWorldState: state,
      event,
    };
  }

  const consequence = applyConsequences(activeState, validation.context);
  const stateAfterTime = applyTimeAndDecay(
    consequence.newWorldState,
    consequence.actorAfter,
    action.actionType,
  );
  const stateAfterAutonomy = action.autonomy
    ? {
        ...stateAfterTime,
        entities: {
          ...stateAfterTime.entities,
          [actorId]: {
            ...stateAfterTime.entities[actorId],
            autonomyDecisionState: {
              intentKey: action.autonomy.intentKey,
              remainingCommitmentTurns: action.autonomy.nextCommitmentTurns,
            },
          },
        },
      }
    : stateAfterTime;
  const newWorldState: WorldState = {
    ...stateAfterAutonomy,
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
      consequences: action.autonomy
        ? [
            ...consequence.consequences,
            `Autonomous intent ${action.autonomy.intentKey} committed for ${actorId}.`,
          ]
        : consequence.consequences,
      // Convention : instant du monde avant l'application du coût temporel.
      occurredAt: state.time,
      status: "APPLIED",
      requestedTargetName: action.targetName,
      observations: consequence.observations,
    },
  };
}
