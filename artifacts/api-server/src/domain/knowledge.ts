// domain/knowledge.ts — Ce que l'entité contrôlée peut percevoir.
// Le module de narration ne reçoit QUE ces informations — jamais l'état complet du monde.

import type { ActionType } from "./actions.js";
import type { WorldTime } from "./world.js";

// Projection d'un événement réel pour un observateur donné (faits, pas narration).
export interface ActionOutcome {
  actionType: ActionType;
  success: boolean;
  targetName: string | null;
  observableFacts: string[];
}

// Faits perceptibles par l'entité contrôlée à l'instant T, après résolution de l'action.
// Le LLM de narration n'a accès qu'à ces données — aucun secret du monde ne lui parvient.
export interface PerceptibleFacts {
  actorName: string;
  locationName: string;
  locationDescription: string;
  presentEntities: Array<{
    name: string;
    occupation: string;
    mood: string;
    // description visible publiquement, sans notes secrètes ni humeur cachée
  }>;
  presentObjects: Array<{ name: string; description: string }>;
  inventoryObjects: Array<{ name: string; description: string }>;
  worldTime: WorldTime;
  entityStats: { hunger: number; fatigue: number; health: number } | null;
  actionOutcome: ActionOutcome | null;
}

