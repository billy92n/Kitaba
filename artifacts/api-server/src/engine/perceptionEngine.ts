// Construit une vue filtrée pour un observateur explicite.

import type { GameEvent } from "../domain/events.js";
import type { ActionOutcome, PerceptibleFacts } from "../domain/knowledge.js";
import type { EntityId, WorldState } from "../domain/world.js";

export type PerceptionFailureCode =
  "OBSERVER_NOT_FOUND" | "OBSERVER_LOCATION_NOT_FOUND";

export type PerceptionResult =
  | { success: true; facts: PerceptibleFacts }
  | { success: false; code: PerceptionFailureCode; reason: string };

export function resolveObservedAction(
  state: WorldState,
  observerId: EntityId,
  event: GameEvent,
): ActionOutcome | null {
  const observer = state.entities[observerId];
  if (!observer) return null;

  const observableFacts = event.observations.flatMap((observation) => {
    if (observation.audience === "PUBLIC") return [observation.text];
    if (observation.audience === "ACTOR" && observerId === event.actorId) {
      return [observation.text];
    }
    if (
      observation.audience === "LOCATION" &&
      observerId !== event.actorId &&
      observer.locationId === event.locationId
    ) {
      return [observation.text];
    }
    return [];
  });

  if (observableFacts.length === 0) return null;
  return {
    actionType: event.actionType,
    success: event.status === "APPLIED",
    targetName: observerId === event.actorId ? event.requestedTargetName : null,
    observableFacts,
  };
}

export function buildPerceptibleFacts(
  state: WorldState,
  observerId: EntityId,
  event: GameEvent,
): PerceptionResult {
  const observer = state.entities[observerId];
  if (!observer) {
    return {
      success: false,
      code: "OBSERVER_NOT_FOUND",
      reason: `Observateur introuvable : ${observerId}.`,
    };
  }
  const location = state.locations[observer.locationId];
  if (!location) {
    return {
      success: false,
      code: "OBSERVER_LOCATION_NOT_FOUND",
      reason: `L'observateur ${observerId} n'a pas de lieu valide.`,
    };
  }

  const presentEntities = location.presentEntities.flatMap((id) => {
    if (id === observer.id) return [];
    const entity = state.entities[id];
    return entity
      ? [
          {
            name: entity.name,
            occupation: entity.occupation,
            mood: entity.mood,
          },
        ]
      : [];
  });
  const presentObjects = location.presentObjects.flatMap((id) => {
    const object = state.objects[id];
    return object
      ? [{ name: object.name, description: object.description }]
      : [];
  });
  const inventoryObjects = observer.inventory.flatMap((id) => {
    const object = state.objects[id];
    return object
      ? [{ name: object.name, description: object.description }]
      : [];
  });
  const entityStats =
    observer.hunger !== undefined &&
    observer.fatigue !== undefined &&
    observer.health !== undefined
      ? {
          hunger: Math.round(observer.hunger),
          fatigue: Math.round(observer.fatigue),
          health: Math.round(observer.health),
        }
      : null;

  return {
    success: true,
    facts: {
      actorName: observer.name,
      locationName: location.name,
      locationDescription: location.description,
      presentEntities,
      presentObjects,
      inventoryObjects,
      worldTime: state.time,
      entityStats,
      actionOutcome: resolveObservedAction(state, observerId, event),
    },
  };
}
