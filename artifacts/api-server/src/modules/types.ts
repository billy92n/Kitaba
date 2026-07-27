// types.ts — Types partagés entre les modules du serveur.

export interface NarrativeEntry {
  id: string;
  type: "player" | "narrator" | "system";
  text: string;
  timestamp: string;
}

export interface CharacterStatus {
  name: string;
  locationName: string;
  worldDate: string;
  hunger: number;
  fatigue: number;
  health: number;
}
