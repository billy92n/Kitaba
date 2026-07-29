// domain/world.ts — Types du monde et état actif. Aucun état global en mémoire.
// Le LLM ne reçoit jamais WorldState directement.

export type LocationId = string;
export type EntityId = string;
export type ObjectId = string;

export interface WorldTime {
  year: number;
  season: "printemps" | "été" | "automne" | "hiver";
  day: number;
  /**
   * Heure entière. Les anciennes sauvegardes peuvent contenir une fraction :
   * normalizeWorldTime la convertit sans perte vers minute.
   */
  hour: number;
  /** Minute entière dans l'heure. Absente dans les sauvegardes historiques. */
  minute?: number;
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

export function getLocation(
  state: WorldState,
  id: LocationId,
): WorldLocation | undefined {
  return state.locations[id];
}

export function getEntity(
  state: WorldState,
  id: EntityId,
): import("./entities.js").Entity | undefined {
  return state.entities[id];
}

export function getObject(
  state: WorldState,
  id: ObjectId,
): WorldObject | undefined {
  return state.objects[id];
}

export function getControlledEntity(
  state: WorldState,
): import("./entities.js").Entity {
  const entity = state.entities[state.controlledEntityId];
  if (!entity)
    throw new Error(
      `Controlled entity ${state.controlledEntityId} not found in world state`,
    );
  return entity;
}

export function getEntitiesAt(
  state: WorldState,
  locationId: LocationId,
): import("./entities.js").Entity[] {
  return Object.values(state.entities).filter(
    (e) => e.locationId === locationId,
  );
}

export function getObjectsAt(
  state: WorldState,
  locationId: LocationId,
): WorldObject[] {
  return Object.values(state.objects).filter(
    (o) => o.locationId === locationId && o.ownerId === null,
  );
}

export function formatWorldDate(time: WorldTime): string {
  const normalized = normalizeWorldTime(time);
  const dayNames = [
    "Lundi",
    "Mardi",
    "Mercredi",
    "Jeudi",
    "Vendredi",
    "Samedi",
    "Dimanche",
  ];
  const dayName = dayNames[(normalized.day - 1) % 7];
  const hourStr =
    normalized.hour.toString().padStart(2, "0") +
    "h" +
    (normalized.minute ?? 0).toString().padStart(2, "0");
  return `${dayName}, ${normalized.season} — An ${normalized.year}, ${hourStr}`;
}

export function normalizeWorldTime(time: WorldTime): Required<WorldTime> {
  const legacyTotalMinutes =
    time.minute === undefined
      ? Math.round(time.hour * 60)
      : Math.trunc(time.hour) * 60 + time.minute;
  return {
    year: time.year,
    season: time.season,
    day: time.day,
    hour: Math.floor(legacyTotalMinutes / 60),
    minute: legacyTotalMinutes % 60,
  };
}
