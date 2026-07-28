import type { StructuredAction } from "../domain/actions.js";
import type { EntityId, WorldState } from "../domain/world.js";
import {
  findEntityAtLocation,
  findLocationByQuery,
  findObjectAvailable,
} from "./targetResolution.js";

export interface ValidationResult {
  possible: boolean;
  reason: string | null;
}

const OK: ValidationResult = { possible: true, reason: null };
const fail = (reason: string): ValidationResult => ({ possible: false, reason });

export function validateAction(
  state: WorldState,
  actorId: EntityId,
  action: StructuredAction,
): ValidationResult {
  const actor = state.entities[actorId];
  if (!actor) return fail(`Acteur introuvable : ${actorId}.`);
  const currentLocation = state.locations[actor.locationId];
  if (!currentLocation) return fail(`L'acteur ${actorId} n'a pas de lieu valide.`);

  switch (action.actionType) {
    case "move": {
      const target = findLocationByQuery(state, action.targetName);
      if (!target) return fail(`Vous ne savez pas comment aller à "${action.targetName ?? "?"}".`);
      if (!currentLocation.connectedLocations.includes(target.id)) {
        return fail(`${target.name} n'est pas directement accessible depuis ${currentLocation.name}.`);
      }
      if (target.id === actor.locationId) return fail(`Vous êtes déjà à ${target.name}.`);
      return OK;
    }
    case "speak": {
      if (!action.targetName) return fail("À qui voulez-vous parler ?");
      if (!findEntityAtLocation(state, actorId, actor.locationId, action.targetName)) {
        return fail(`Personne du nom de "${action.targetName}" n'est ici.`);
      }
      return OK;
    }
    case "take": {
      const object = findObjectAvailable(state, actorId, action.targetName);
      if (!object) return fail(`Vous ne voyez pas "${action.targetName ?? "cet objet"}" ici.`);
      if (actor.inventory.includes(object.id)) return fail(`Vous avez déjà ${object.name} dans vos affaires.`);
      return OK;
    }
    case "examine":
    case "sleep":
    case "use":
      return OK;
    case "eat": {
      const object = findObjectAvailable(state, actorId, action.targetName);
      if (!object) return fail(`Vous n'avez pas "${action.targetName ?? "de quoi manger"}" sur vous.`);
      if (!actor.inventory.includes(object.id)) return fail(`${object.name} ne vous appartient pas.`);
      return OK;
    }
    case "give":
      return action.targetName ? OK : fail("À qui voulez-vous donner, et quoi ?");
    case "attack":
      return fail("La violence n'est pas implémentée dans cette version du monde.");
    case "unknown":
      return fail("Vous ne savez pas comment faire cela.");
    default:
      return fail("Action inconnue.");
  }
}
