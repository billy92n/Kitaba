import type { Entity } from "../domain/entities.js";
import type { EntityId, WorldLocation, WorldObject, WorldState } from "../domain/world.js";

export function normalizeTarget(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
}

export function findLocationByQuery(state: WorldState, query: string | null): WorldLocation | null {
  if (!query) return null;
  const stripped = query.replace(/^(la|le|les|l'|du|au|aux|un|une)\s+/i, "").trim();
  const normalized = normalizeTarget(stripped || query);
  return Object.values(state.locations).find((location) => {
    const name = normalizeTarget(location.name);
    return name.includes(normalized) ||
      normalized.includes(normalizeTarget(location.id)) ||
      name.split(" ").some((word) => word.length > 3 && normalized.includes(word));
  }) ?? null;
}

export function findEntityAtLocation(
  state: WorldState,
  actorId: EntityId,
  locationId: string,
  query: string | null,
): Entity | null {
  if (!query) return null;
  const normalized = normalizeTarget(query);
  return Object.values(state.entities).find(
    (entity) =>
      entity.locationId === locationId &&
      entity.id !== actorId &&
      normalizeTarget(entity.name).includes(normalized),
  ) ?? null;
}

export function findObjectAvailable(
  state: WorldState,
  actorId: EntityId,
  query: string | null,
): WorldObject | null {
  if (!query) return null;
  const actor = state.entities[actorId];
  if (!actor) return null;
  const normalized = normalizeTarget(query);
  for (const objectId of actor.inventory) {
    const object = state.objects[objectId];
    if (object && normalizeTarget(object.name).includes(normalized)) return object;
  }
  return Object.values(state.objects).find(
    (object) =>
      (object.locationId === actor.locationId ||
        (object.ownerId !== null && state.entities[object.ownerId]?.locationId === actor.locationId)) &&
      normalizeTarget(object.name).includes(normalized),
  ) ?? null;
}

export function findAnything(
  state: WorldState,
  observerId: EntityId,
  query: string | null,
): { name: string; description: string } | null {
  if (!query) return null;
  const observer = state.entities[observerId];
  if (!observer) return null;
  const normalized = normalizeTarget(query);
  for (const object of Object.values(state.objects)) {
    if ((object.locationId === observer.locationId || observer.inventory.includes(object.id)) &&
        normalizeTarget(object.name).includes(normalized)) {
      return { name: object.name, description: object.description };
    }
  }
  for (const entity of Object.values(state.entities)) {
    if (entity.locationId === observer.locationId && normalizeTarget(entity.name).includes(normalized)) {
      return { name: entity.name, description: entity.description };
    }
  }
  const location = state.locations[observer.locationId];
  if (!location) return null;
  if (normalizeTarget(location.name).includes(normalized)) {
    return { name: location.name, description: location.description };
  }
  for (const connectedId of location.connectedLocations) {
    const connected = state.locations[connectedId];
    if (connected && normalizeTarget(connected.name).includes(normalized)) {
      return { name: connected.name, description: connected.description };
    }
  }
  if (normalized.length < 3 || normalized.includes("lieu") || normalized.includes("endroit")) {
    return { name: location.name, description: location.description };
  }
  return null;
}
