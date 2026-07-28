// engine/consequenceEngine.ts — Calcule et applique les conséquences d'une action validée.
// Retourne le nouvel état du monde et la liste des changements (faits, jamais de narration).
// N'interprète jamais le langage naturel — reçoit une action déjà structurée et validée.

import type { EntityId, WorldState } from "../domain/world.js";
import type { StructuredAction } from "../domain/actions.js";
import {
  findAnything,
  findEntityAtLocation,
  findLocationByQuery,
  findObjectAvailable,
} from "./targetResolution.js";

export interface ConsequenceResult {
  newWorldState: WorldState;
  observableFacts: string[];   // faits perceptibles par l'acteur
  consequences: string[];      // description technique des changements d'état
  targetId: string | null;
}

export function applyConsequences(
  state: WorldState,
  actorId: EntityId,
  action: StructuredAction,
): ConsequenceResult {
  const controlled = state.entities[actorId]!;
  let newState = { ...state, entities: { ...state.entities }, locations: { ...state.locations }, objects: { ...state.objects } };

  switch (action.actionType) {
    case "move": {
      const target = findLocationByQuery(state, action.targetName)!;
      const prevLocId = controlled.locationId;
      const prevLoc = newState.locations[prevLocId];
      const nextLoc = newState.locations[target.id];

      // Met à jour la présence dans les lieux
      newState.locations[prevLocId] = {
        ...prevLoc,
        presentEntities: prevLoc.presentEntities.filter((id) => id !== controlled.id),
      };
      newState.locations[target.id] = {
        ...nextLoc,
        presentEntities: [...nextLoc.presentEntities.filter((id) => id !== controlled.id), controlled.id],
      };
      newState.entities[controlled.id] = { ...controlled, locationId: target.id };

      return {
        newWorldState: newState,
        observableFacts: [`Vous entrez dans ${target.name}.`],
        consequences: [`entity:${controlled.id}:locationId:${prevLocId}→${target.id}`],
        targetId: target.id,
      };
    }

    case "speak": {
      const entity = findEntityAtLocation(state, actorId, controlled.locationId, action.targetName)!;
      return {
        newWorldState: newState,
        observableFacts: [`${entity.name} vous répond brièvement.`],
        consequences: [],
        targetId: entity.id,
      };
    }

    case "take": {
      const obj = findObjectAvailable(state, actorId, action.targetName)!;
      const prevOwnerId = obj.ownerId;
      const prevLocationId = obj.locationId;

      // Retire l'objet de son propriétaire précédent ou du sol
      if (prevOwnerId && newState.entities[prevOwnerId]) {
        newState.entities[prevOwnerId] = {
          ...newState.entities[prevOwnerId],
          inventory: newState.entities[prevOwnerId].inventory.filter((id) => id !== obj.id),
        };
      }
      if (prevLocationId && newState.locations[prevLocationId]) {
        newState.locations[prevLocationId] = {
          ...newState.locations[prevLocationId],
          presentObjects: newState.locations[prevLocationId].presentObjects.filter((id) => id !== obj.id),
        };
      }

      // Ajoute à l'inventaire du personnage contrôlé
      newState.objects[obj.id] = { ...obj, locationId: null, ownerId: controlled.id };
      newState.entities[controlled.id] = {
        ...newState.entities[controlled.id],
        inventory: [...newState.entities[controlled.id].inventory, obj.id],
      };

      return {
        newWorldState: newState,
        observableFacts: [`${obj.name} est maintenant dans vos affaires.`],
        consequences: [`object:${obj.id}:owner:${prevOwnerId ?? prevLocationId ?? "sol"}→${controlled.id}`],
        targetId: obj.id,
      };
    }

    case "examine": {
      const found = findAnything(state, actorId, action.targetName);
      if (!found) {
        return {
          newWorldState: newState,
          observableFacts: [`Vous ne voyez rien de particulier concernant "${action.targetName ?? "cela"}".`],
          consequences: [],
          targetId: null,
        };
      }
      return {
        newWorldState: newState,
        observableFacts: [found.description],
        consequences: [],
        targetId: null,
      };
    }

    case "eat": {
      const obj = findObjectAvailable(state, actorId, action.targetName)!;
      newState.entities[controlled.id] = {
        ...newState.entities[controlled.id],
        inventory: newState.entities[controlled.id].inventory.filter((id) => id !== obj.id),
        hunger: Math.min(100, (controlled.hunger ?? 50) + 30),
      };
      newState.objects[obj.id] = { ...obj, locationId: null, ownerId: null };

      return {
        newWorldState: newState,
        observableFacts: [`Vous mangez ${obj.name}. Votre faim diminue.`],
        consequences: [`object:${obj.id}:consumed`, `entity:${controlled.id}:hunger:+30`],
        targetId: obj.id,
      };
    }

    case "sleep": {
      const fatigueBefore = controlled.fatigue ?? 50;
      const fatigueAfter = Math.min(100, fatigueBefore + 60);
      newState.entities[controlled.id] = {
        ...newState.entities[controlled.id],
        fatigue: fatigueAfter,
      };

      return {
        newWorldState: newState,
        observableFacts: [`Vous dormez plusieurs heures. Votre fatigue se dissipe.`],
        consequences: [`entity:${controlled.id}:fatigue:${fatigueBefore}→${fatigueAfter}`],
        targetId: null,
      };
    }

    case "give": {
      return {
        newWorldState: newState,
        observableFacts: [`L'échange a lieu.`],
        consequences: [],
        targetId: null,
      };
    }

    default: {
      return {
        newWorldState: newState,
        observableFacts: [],
        consequences: [],
        targetId: null,
      };
    }
  }
}
