// engine/perceptionEngine.ts — Construit les PerceptibleFacts de l'entité contrôlée.
// Filtre rigoureusement l'état du monde : seules les informations perceptibles passent.
// Le module de narration ne recevra que cette structure — jamais WorldState directement.

import type { WorldState } from "../domain/world.js";
import type { ActionOutcome } from "../domain/knowledge.js";
import type { PerceptibleFacts } from "../domain/knowledge.js";
import { getControlledEntity } from "../domain/world.js";

export function buildPerceptibleFacts(
  state: WorldState,
  outcome: ActionOutcome
): PerceptibleFacts {
  const controlled = getControlledEntity(state);
  const location = state.locations[controlled.locationId];

  // Entités présentes dans le lieu — sauf l'entité contrôlée elle-même
  const presentEntities = (location?.presentEntities ?? [])
    .filter((id) => id !== controlled.id)
    .map((id) => state.entities[id])
    .filter(Boolean)
    .map((e) => ({
      name: e.name,
      occupation: e.occupation,
      mood: e.mood,
      // NOTE : on n'expose pas les notes secrètes des relations, ni l'inventaire des PNJ
    }));

  // Objets visibles au sol dans le lieu (pas ceux dans les inventaires)
  const presentObjects = (location?.presentObjects ?? [])
    .map((id) => state.objects[id])
    .filter(Boolean)
    .map((o) => ({ name: o.name, description: o.description }));

  // Inventaire du personnage contrôlé
  const inventoryObjects = controlled.inventory
    .map((id) => state.objects[id])
    .filter(Boolean)
    .map((o) => ({ name: o.name, description: o.description }));

  // Stats vitales — seulement si l'entité en possède
  const entityStats =
    controlled.hunger !== undefined &&
    controlled.fatigue !== undefined &&
    controlled.health !== undefined
      ? {
          hunger: Math.round(controlled.hunger),
          fatigue: Math.round(controlled.fatigue),
          health: Math.round(controlled.health),
        }
      : null;

  return {
    actorName: controlled.name,
    locationName: location?.name ?? "lieu inconnu",
    locationDescription: location?.description ?? "",
    presentEntities,
    presentObjects,
    inventoryObjects,
    worldTime: state.time,
    entityStats,
    actionOutcome: outcome,
  };
}
