// domain/world.ts — Types du monde et état actif. Aucun état global en mémoire.
// Le LLM ne reçoit jamais WorldState directement.

export type LocationId = string;
export type EntityId = string;
export type ObjectId = string;

export interface WorldTime {
  year: number;
  season: "printemps" | "été" | "automne" | "hiver";
  day: number;
  hour: number;
}

export interface WorldLocation {
  id: LocationId;
  name: string;
  description: string;
  connectedLocations: LocationId[];
  presentEntities: EntityId[];
  presentObjects: ObjectId[];
}

export interface WorldObject {
  id: ObjectId;
  name: string;
  description: string;
  locationId: LocationId | null;
  ownerId: EntityId | null;
  properties: Record<string, unknown>;
}

// WorldState — instantané complet du monde à un instant donné.
// Chaque action réussie incrémente worldVersion.
// controlledEntityId désigne le personnage joué — c'est une entité ordinaire.
export interface WorldState {
  worldVersion: number;
  controlledEntityId: EntityId;
  locations: Record<LocationId, WorldLocation>;
  entities: Record<EntityId, import("./entities.js").Entity>;
  objects: Record<ObjectId, WorldObject>;
  relations: import("./relations.js").Relation[];
  time: WorldTime;
}

// ─── Helpers de lecture (ne mutent jamais le monde) ─────────────────────────────

export function getLocation(state: WorldState, id: LocationId): WorldLocation | undefined {
  return state.locations[id];
}

export function getEntity(state: WorldState, id: EntityId): import("./entities.js").Entity | undefined {
  return state.entities[id];
}

export function getObject(state: WorldState, id: ObjectId): WorldObject | undefined {
  return state.objects[id];
}

export function getControlledEntity(state: WorldState): import("./entities.js").Entity {
  const entity = state.entities[state.controlledEntityId];
  if (!entity) throw new Error(`Controlled entity ${state.controlledEntityId} not found in world state`);
  return entity;
}

export function getEntitiesAt(state: WorldState, locationId: LocationId): import("./entities.js").Entity[] {
  return Object.values(state.entities).filter((e) => e.locationId === locationId);
}

export function getObjectsAt(state: WorldState, locationId: LocationId): WorldObject[] {
  return Object.values(state.objects).filter((o) => o.locationId === locationId && o.ownerId === null);
}

export function formatWorldDate(time: WorldTime): string {
  const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const dayName = dayNames[(time.day - 1) % 7];
  const hourStr = time.hour.toString().padStart(2, "0") + "h00";
  return `${dayName}, ${time.season} — An ${time.year}, ${hourStr}`;
}
