// engine/consequenceEngine.ts — Calcule et applique les conséquences d'une action validée.
// Retourne le nouvel état du monde et la liste des changements (faits, jamais de narration).
// N'interprète jamais le langage naturel — reçoit une action déjà structurée et validée.

import type { WorldState } from "../domain/world.js";
import type { StructuredAction } from "../domain/actions.js";
import { getControlledEntity } from "../domain/world.js";

export interface ConsequenceResult {
  newWorldState: WorldState;
  observableFacts: string[];   // faits perceptibles par l'acteur
  consequences: string[];      // description technique des changements d'état
  targetId: string | null;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
}

function findLocationByQuery(state: WorldState, query: string | null) {
  if (!query) return null;
  const stripped = query.replace(/^(la|le|les|l'|l'|du|au|aux|un|une)\s+/i, "").trim();
  const q = normalize(stripped || query);
  for (const loc of Object.values(state.locations)) {
    const n = normalize(loc.name);
    if (n.includes(q) || q.includes(normalize(loc.id)) || n.split(" ").some((w) => w.length > 3 && q.includes(w))) {
      return loc;
    }
  }
  return null;
}

function findEntityAtLocation(state: WorldState, locationId: string, query: string | null) {
  if (!query) return null;
  const q = normalize(query);
  return Object.values(state.entities).find(
    (e) => e.locationId === locationId && e.id !== state.controlledEntityId && normalize(e.name).includes(q)
  ) ?? null;
}

function findObjectAvailable(state: WorldState, query: string | null) {
  if (!query) return null;
  const q = normalize(query);
  const controlled = getControlledEntity(state);
  for (const objId of controlled.inventory) {
    const obj = state.objects[objId];
    if (obj && normalize(obj.name).includes(q)) return obj;
  }
  const locationId = controlled.locationId;
  const all = Object.values(state.objects).filter(
    (o) =>
      o.locationId === locationId ||
      (o.ownerId !== null && state.entities[o.ownerId]?.locationId === locationId)
  );
  return all.find((o) => normalize(o.name).includes(q)) ?? null;
}

function findAnything(state: WorldState, query: string | null): { name: string; description: string } | null {
  if (!query) return null;
  const q = normalize(query);
  const controlled = getControlledEntity(state);
  const locationId = controlled.locationId;

  for (const obj of Object.values(state.objects)) {
    if (obj.locationId === locationId || controlled.inventory.includes(obj.id)) {
      if (normalize(obj.name).includes(q)) return { name: obj.name, description: obj.description };
    }
  }
  for (const entity of Object.values(state.entities)) {
    if (entity.locationId === locationId && normalize(entity.name).includes(q)) {
      return { name: entity.name, description: entity.description };
    }
  }
  const loc = state.locations[locationId];
  if (loc) {
    if (normalize(loc.name).includes(q)) return { name: loc.name, description: loc.description };
    for (const connId of loc.connectedLocations) {
      const conn = state.locations[connId];
      if (conn && normalize(conn.name).includes(q)) return { name: conn.name, description: conn.description };
    }
    if (q.length < 3 || normalize(loc.name).includes(q) || q.includes("lieu") || q.includes("endroit")) {
      return { name: loc.name, description: loc.description };
    }
  }
  return null;
}

export function applyConsequences(state: WorldState, action: StructuredAction): ConsequenceResult {
  const controlled = getControlledEntity(state);
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
      const entity = findEntityAtLocation(state, controlled.locationId, action.targetName)!;
      return {
        newWorldState: newState,
        observableFacts: [`${entity.name} vous répond brièvement.`],
        consequences: [],
        targetId: entity.id,
      };
    }

    case "take": {
      const obj = findObjectAvailable(state, action.targetName)!;
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
      const found = findAnything(state, action.targetName);
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
      const obj = findObjectAvailable(state, action.targetName)!;
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
