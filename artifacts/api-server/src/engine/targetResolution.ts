import type { Entity } from "../domain/entities.js";
import type {
  EntityId,
  LocationId,
  ObjectId,
  WorldLocation,
  WorldObject,
  WorldState,
} from "../domain/world.js";

export type ObjectAvailability =
  "ACTOR_INVENTORY" | "GROUND" | "OTHER_INVENTORY";

export interface ResolvedObject {
  object: WorldObject;
  availability: ObjectAvailability;
}

export type ResolvedInspectable =
  | { kind: "OBJECT"; id: ObjectId; name: string; description: string }
  | { kind: "ENTITY"; id: EntityId; name: string; description: string }
  | { kind: "LOCATION"; id: LocationId; name: string; description: string };

export function normalizeTarget(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedQuery(query: string | null): string | null {
  if (query === null) return null;
  const normalized = normalizeTarget(query);
  return normalized.length === 0 ? null : normalized;
}

function matchRank(id: string, name: string, query: string): number | null {
  const normalizedId = normalizeTarget(id);
  const normalizedName = normalizeTarget(name);
  if (normalizedId === query || normalizedName === query) return 0;
  if (normalizedName.startsWith(query)) return 1;
  if (normalizedName.includes(query)) return 2;
  if (normalizedId.includes(query)) return 3;
  return null;
}

function bestMatch<T extends { id: string; name: string }>(
  candidates: readonly T[],
  query: string,
): T | null {
  let selected: T | null = null;
  let selectedRank = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const rank = matchRank(candidate.id, candidate.name, query);
    if (rank !== null && rank < selectedRank) {
      selected = candidate;
      selectedRank = rank;
    }
  }
  return selected;
}

export function findLocationByQuery(
  state: WorldState,
  query: string | null,
): WorldLocation | null {
  if (query === null) return null;
  const stripped = query.replace(
    /^(la|le|les|l['’]|du|de la|de l['’]|au|aux|un|une)\s*/i,
    "",
  );
  const normalized = normalizedQuery(stripped.length > 0 ? stripped : query);
  return normalized
    ? bestMatch(Object.values(state.locations), normalized)
    : null;
}

export function findEntityAtLocation(
  state: WorldState,
  actorId: EntityId,
  locationId: LocationId,
  query: string | null,
): Entity | null {
  const normalized = normalizedQuery(query);
  if (!normalized) return null;
  return bestMatch(
    Object.values(state.entities).filter(
      (entity) => entity.locationId === locationId && entity.id !== actorId,
    ),
    normalized,
  );
}

/**
 * Priorité stable conservant le comportement historique :
 * inventaire de l'acteur, objets au sol, puis objets portés par une autre
 * entité présente. Cette dernière catégorie reste une décision métier ouverte.
 */
export function resolveObjectInActorContext(
  state: WorldState,
  actorId: EntityId,
  query: string | null,
): ResolvedObject | null {
  const actor = state.entities[actorId];
  const normalized = normalizedQuery(query);
  if (!actor || !normalized) return null;

  const inventoryObject = bestMatch(
    actor.inventory.flatMap((id) => {
      const object = state.objects[id];
      return object ? [object] : [];
    }),
    normalized,
  );
  if (inventoryObject)
    return { object: inventoryObject, availability: "ACTOR_INVENTORY" };

  const groundObject = bestMatch(
    Object.values(state.objects).filter(
      (object) =>
        object.locationId === actor.locationId && object.ownerId === null,
    ),
    normalized,
  );
  if (groundObject) return { object: groundObject, availability: "GROUND" };

  const otherInventoryObject = bestMatch(
    Object.values(state.objects).filter(
      (object) =>
        object.ownerId !== null &&
        object.ownerId !== actorId &&
        state.entities[object.ownerId]?.locationId === actor.locationId,
    ),
    normalized,
  );
  return otherInventoryObject
    ? { object: otherInventoryObject, availability: "OTHER_INVENTORY" }
    : null;
}

export function findInspectable(
  state: WorldState,
  observerId: EntityId,
  query: string | null,
): ResolvedInspectable | null {
  const observer = state.entities[observerId];
  const normalized = normalizedQuery(query);
  if (!observer || !normalized) return null;

  const object = bestMatch(
    Object.values(state.objects).filter(
      (candidate) =>
        candidate.locationId === observer.locationId ||
        observer.inventory.includes(candidate.id),
    ),
    normalized,
  );
  if (object) return { kind: "OBJECT", ...object };

  const entity = bestMatch(
    Object.values(state.entities).filter(
      (candidate) =>
        candidate.id !== observerId &&
        candidate.locationId === observer.locationId,
    ),
    normalized,
  );
  if (entity) return { kind: "ENTITY", ...entity };

  const location = state.locations[observer.locationId];
  if (!location) return null;
  const locationMatch = bestMatch(
    [
      location,
      ...location.connectedLocations.flatMap((id) => {
        const connected = state.locations[id];
        return connected ? [connected] : [];
      }),
    ],
    normalized,
  );
  return locationMatch ? { kind: "LOCATION", ...locationMatch } : null;
}
