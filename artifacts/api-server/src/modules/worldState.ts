// worldState.ts — Définit tous les types du monde. Le LLM ne possède jamais ces données.

export type LocationId = string;
export type CharacterId = string;
export type ObjectId = string;

export interface WorldLocation {
  id: LocationId;
  name: string;
  description: string;
  connectedLocations: LocationId[];
  presentCharacters: CharacterId[];
  presentObjects: ObjectId[];
}

export interface WorldCharacter {
  id: CharacterId;
  name: string;
  occupation: string;
  locationId: LocationId;
  description: string;
  mood: string;
  inventory: ObjectId[];
}

export interface WorldObject {
  id: ObjectId;
  name: string;
  description: string;
  locationId: LocationId | null;
  ownerId: CharacterId | null;
  properties: Record<string, unknown>;
}

export interface WorldRelation {
  characterAId: CharacterId;
  characterBId: CharacterId;
  type: string; // e.g. "ami", "maître-apprenti", "commerçant", "voisin"
  strength: number; // 0-100
  notes: string;
}

export interface WorldEvent {
  id: string;
  description: string;
  locationId: LocationId;
  participantIds: CharacterId[];
  timestamp: WorldTime;
  consequences: string[];
}

export interface PlayerCharacter {
  name: string;
  locationId: LocationId;
  hunger: number; // 0 (affamé) à 100 (rassasié)
  fatigue: number; // 0 (épuisé) à 100 (reposé)
  health: number; // 0 (mort) à 100 (parfait)
  inventory: ObjectId[];
  knowledge: string[];
  memories: string[];
  aspirations: string[];
  objectives: string[];
}

export interface WorldTime {
  year: number;
  season: "printemps" | "été" | "automne" | "hiver";
  day: number;
  hour: number;
}

export interface WorldState {
  locations: Record<LocationId, WorldLocation>;
  characters: Record<CharacterId, WorldCharacter>;
  objects: Record<ObjectId, WorldObject>;
  relations: WorldRelation[];
  events: WorldEvent[];
  player: PlayerCharacter;
  time: WorldTime;
}

// Helpers

export function getLocation(state: WorldState, id: LocationId): WorldLocation | undefined {
  return state.locations[id];
}

export function getCharacter(state: WorldState, id: CharacterId): WorldCharacter | undefined {
  return state.characters[id];
}

export function getObject(state: WorldState, id: ObjectId): WorldObject | undefined {
  return state.objects[id];
}

export function getCharactersAt(state: WorldState, locationId: LocationId): WorldCharacter[] {
  return Object.values(state.characters).filter((c) => c.locationId === locationId);
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
