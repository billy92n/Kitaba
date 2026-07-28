// engine/actionResolver.ts — Orchestre validation, conséquences et avance du temps.
// Reçoit une StructuredAction déjà parsée. N'interprète JAMAIS le langage naturel.
// Retourne : le nouvel état du monde, un événement factuel, et les faits observables.
// Ne produit aucune narration.

import { randomUUID } from "crypto";
import type { EntityId, WorldState } from "../domain/world.js";
import type { StructuredAction } from "../domain/actions.js";
import type { GameEvent } from "../domain/events.js";
import type { ActionOutcome } from "../domain/knowledge.js";
import { validateAction } from "./actionValidator.js";
import { applyConsequences } from "./consequenceEngine.js";
import { applyTimeAndDecay } from "./timeEngine.js";

export interface ResolvedAction {
  success: boolean;
  newWorldState: WorldState;
  event: GameEvent;
  actionOutcome: ActionOutcome;
}

export function resolveAction(
  state: WorldState,
  actorId: EntityId,
  action: StructuredAction,
): ResolvedAction {
  const controlled = state.entities[actorId];
  const validation = validateAction(state, actorId, action);

  if (!validation.possible) {
    // Action impossible — aucun changement d'état
    const event: GameEvent = {
      id: randomUUID(),
      sessionId: "",            // rempli par gameService après création
      worldVersion: state.worldVersion,
      actionType: action.actionType,
      actorId,
      locationId: controlled?.locationId ?? "",
      targetId: null,
      description: `[BLOQUÉ] ${validation.reason ?? "Action impossible"}`,
      consequences: [],
      occurredAt: state.time,
    };

    const outcome: ActionOutcome = {
      actionType: action.actionType,
      success: false,
      targetName: action.targetName,
      observableFacts: [validation.reason ?? "Action impossible."],
    };

    return { success: false, newWorldState: state, event, actionOutcome: outcome };
  }
  if (!controlled) throw new Error(`Validated actor not found: ${actorId}`);

  // Calcule et applique les conséquences
  const { newWorldState: stateAfterConsequences, observableFacts, consequences, targetId } =
    applyConsequences(state, actorId, action);

  // Avance le temps et applique le déclin passif
  const stateAfterTime = applyTimeAndDecay(stateAfterConsequences, actorId, action.actionType);

  // Incrémente worldVersion
  const newWorldState: WorldState = {
    ...stateAfterTime,
    worldVersion: state.worldVersion + 1,
  };

  const event: GameEvent = {
    id: randomUUID(),
    sessionId: "",              // rempli par gameService
    worldVersion: newWorldState.worldVersion,
    actionType: action.actionType,
    actorId: controlled.id,
    locationId: controlled.locationId,
    targetId,
    description: `${controlled.name} : ${action.actionType} → ${action.targetName ?? "—"}`,
    consequences,
    occurredAt: state.time,    // moment où l'action a eu lieu (avant l'avance du temps)
  };

  const outcome: ActionOutcome = {
    actionType: action.actionType,
    success: true,
    targetName: action.targetName,
    observableFacts,
  };

  return { success: true, newWorldState, event, actionOutcome: outcome };
}
