import type { Entity } from "../domain/entities.js";
import type {
  EntityId,
  LocationId,
  ObjectId,
  WorldLocation,
  WorldObject,
  WorldState,
} from "../domain/world.js";

export type TargetResolution<T> =
  | { status: "FOUND"; target: T }
  | { status: "MISSING" }
  | { status: "AMBIGUOUS"; candidateIds: string[] };

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
): TargetResolution<T> {
  const ranked = candidates.flatMap((candidate) => {
    const rank = matchRank(candidate.id, candidate.name, query);
    return rank === null ? [] : [{ candidate, rank }];
  });
  if (ranked.length === 0) return { status: "MISSING" };
  const bestRank = Math.min(...ranked.map(({ rank }) => rank));
  const best = ranked
    .filter(({ rank }) => rank === bestRank)
    .map(({ candidate }) => candidate)
    .sort((left, right) => left.id.localeCompare(right.id));
  return best.length === 1
    ? { status: "FOUND", target: best[0] }
    : { status: "AMBIGUOUS", candidateIds: best.map(({ id }) => id) };
}

export function findLocationByQuery(
  state: WorldState,
  query: string | null,
): TargetResolution<WorldLocation> {
  if (query === null) return { status: "MISSING" };
  const stripped = query.replace(
    /^(la|le|les|l['’]|du|de la|de l['’]|au|aux|un|une)\s*/i,
    "",
  );
  const normalized = normalizedQuery(stripped.length > 0 ? stripped : query);
  return normalized
    ? bestMatch(Object.values(state.locations), normalized)
    : { status: "MISSING" };
}

export function findEntityAtLocation(
  state: WorldState,
  actorId: EntityId,
  locationId: LocationId,
  query: string | null,
): TargetResolution<Entity> {
  const normalized = normalizedQuery(query);
  return normalized
    ? bestMatch(
        Object.values(state.entities).filter(
          (entity) => entity.locationId === locationId && entity.id !== actorId,
        ),
        normalized,
      )
    : { status: "MISSING" };
}

function resolveObjectGroup(
  objects: WorldObject[],
  availability: ObjectAvailability,
  query: string,
): TargetResolution<ResolvedObject> {
  const result = bestMatch(objects, query);
  if (result.status !== "FOUND") return result;
  return {
    status: "FOUND",
    target: { object: result.target, availability },
  };
}

/**
 * Priorité métier historique : inventaire de l'acteur, sol, inventaire tiers.
 * Une ambiguïté au meilleur niveau de priorité est refusée.
 */
export function resolveObjectInActorContext(
  state: WorldState,
  actorId: EntityId,
  query: string | null,
): TargetResolution<ResolvedObject> {
  const actor = state.entities[actorId];
  const normalized = normalizedQuery(query);
  if (!actor || !normalized) return { status: "MISSING" };

  const groups: Array<[WorldObject[], ObjectAvailability]> = [
    [
      actor.inventory.flatMap((id) => {
        const object = state.objects[id];
        return object ? [object] : [];
      }),
      "ACTOR_INVENTORY",
    ],
    [
      Object.values(state.objects).filter(
        (object) =>
          object.locationId === actor.locationId && object.ownerId === null,
      ),
      "GROUND",
    ],
    [
      Object.values(state.objects).filter(
        (object) =>
          object.ownerId !== null &&
          object.ownerId !== actorId &&
          state.entities[object.ownerId]?.locationId === actor.locationId,
      ),
      "OTHER_INVENTORY",
    ],
  ];

  for (const [objects, availability] of groups) {
    const result = resolveObjectGroup(objects, availability, normalized);
    if (result.status !== "MISSING") return result;
  }
  return { status: "MISSING" };
}

function inspectableResult<
  T extends { id: string; name: string; description: string },
>(
  result: TargetResolution<T>,
  kind: ResolvedInspectable["kind"],
): TargetResolution<ResolvedInspectable> {
  if (result.status !== "FOUND") return result;
  return {
    status: "FOUND",
    target: {
      kind,
      id: result.target.id,
      name: result.target.name,
      description: result.target.description,
    },
  };
}

export function findInspectable(
  state: WorldState,
  observerId: EntityId,
  query: string | null,
): TargetResolution<ResolvedInspectable> {
  const observer = state.entities[observerId];
  const normalized = normalizedQuery(query);
  if (!observer || !normalized) return { status: "MISSING" };

  const object = inspectableResult(
    bestMatch(
      Object.values(state.objects).filter(
        (candidate) =>
          candidate.locationId === observer.locationId ||
          observer.inventory.includes(candidate.id),
      ),
      normalized,
    ),
    "OBJECT",
  );
  if (object.status !== "MISSING") return object;

  const entity = inspectableResult(
    bestMatch(
      Object.values(state.entities).filter(
        (candidate) =>
          candidate.id !== observerId &&
          candidate.locationId === observer.locationId,
      ),
      normalized,
    ),
    "ENTITY",
  );
  if (entity.status !== "MISSING") return entity;

  const location = state.locations[observer.locationId];
  if (!location) return { status: "MISSING" };
  return inspectableResult(
    bestMatch(
      [
        location,
        ...location.connectedLocations.flatMap((id) => {
          const connected = state.locations[id];
          return connected ? [connected] : [];
        }),
      ],
      normalized,
    ),
    "LOCATION",
  );
}
