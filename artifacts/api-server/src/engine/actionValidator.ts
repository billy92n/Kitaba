// engine/actionValidator.ts — Vérifie si une action structurée est possible dans le monde actuel.
// Ne modifie jamais le monde. Retourne un résultat de validation avec raison en cas d'échec.

import type { WorldState } from "../domain/world.js";
import type { StructuredAction } from "../domain/actions.js";
import { getControlledEntity, getEntitiesAt, getObjectsAt } from "../domain/world.js";

export interface ValidationResult {
  possible: boolean;
  reason: string | null; // non-null si !possible
}

const OK: ValidationResult = { possible: true, reason: null };
const fail = (reason: string): ValidationResult => ({ possible: false, reason });

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
  return getEntitiesAt(state, locationId).find(
    (e) => e.id !== state.controlledEntityId && normalize(e.name).includes(q)
  ) ?? null;
}

function findObjectAvailable(state: WorldState, query: string | null) {
  if (!query) return null;
  const q = normalize(query);
  const controlled = getControlledEntity(state);

  // Inventaire du personnage contrôlé en priorité
  for (const objId of controlled.inventory) {
    const obj = state.objects[objId];
    if (obj && normalize(obj.name).includes(q)) return obj;
  }

  // Objets au sol ou portés par des entités dans le même lieu
  const locationId = controlled.locationId;
  const all = Object.values(state.objects).filter(
    (o) =>
      o.locationId === locationId ||
      (o.ownerId !== null && state.entities[o.ownerId]?.locationId === locationId)
  );
  return all.find((o) => normalize(o.name).includes(q)) ?? null;
}

export function validateAction(state: WorldState, action: StructuredAction): ValidationResult {
  const controlled = getControlledEntity(state);
  const currentLocation = state.locations[controlled.locationId];

  switch (action.actionType) {
    case "move": {
      const target = findLocationByQuery(state, action.targetName);
      if (!target) return fail(`Vous ne savez pas comment aller à "${action.targetName ?? "?"}".`);
      if (!currentLocation.connectedLocations.includes(target.id)) {
        return fail(`${target.name} n'est pas directement accessible depuis ${currentLocation.name}.`);
      }
      if (target.id === controlled.locationId) return fail(`Vous êtes déjà à ${target.name}.`);
      return OK;
    }

    case "speak": {
      if (!action.targetName) return fail("À qui voulez-vous parler ?");
      const entity = findEntityAtLocation(state, controlled.locationId, action.targetName);
      if (!entity) return fail(`Personne du nom de "${action.targetName}" n'est ici.`);
      return OK;
    }

    case "take": {
      const obj = findObjectAvailable(state, action.targetName);
      if (!obj) return fail(`Vous ne voyez pas "${action.targetName ?? "cet objet"}" ici.`);
      if (controlled.inventory.includes(obj.id)) return fail(`Vous avez déjà ${obj.name} dans vos affaires.`);
      return OK;
    }

    case "examine": {
      // On peut toujours examiner — si la cible n'existe pas, l'engine le notera dans les faits
      return OK;
    }

    case "eat": {
      const obj = findObjectAvailable(state, action.targetName);
      if (!obj) return fail(`Vous n'avez pas "${action.targetName ?? "de quoi manger"}" sur vous.`);
      if (!controlled.inventory.includes(obj.id)) {
        return fail(`${obj.name} ne vous appartient pas.`);
      }
      return OK;
    }

    case "sleep": {
      return OK; // peut dormir partout dans ce prototype
    }

    case "give": {
      if (!action.targetName) return fail("À qui voulez-vous donner, et quoi ?");
      return OK;
    }

    case "attack": {
      return fail("La violence n'est pas implémentée dans cette version du monde.");
    }

    case "use": {
      return OK;
    }

    case "unknown": {
      return fail("Vous ne savez pas comment faire cela.");
    }

    default:
      return fail("Action inconnue.");
  }
}
