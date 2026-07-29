// domain/entities.ts — Le personnage contrôlé utilise exactement le même modèle qu'un PNJ.
// Aucune structure "player" spéciale. La distinction se fait uniquement via
// WorldState.controlledEntityId.

import type { WorldTime } from "./world.js";

export type EntityId = string;

export interface Entity {
  id: EntityId;
  name: string;
  occupation: string;
  locationId: string;
  description: string;
  mood: string;
  inventory: string[]; // ObjectId[]

  // Stats vitales — présentes pour le personnage contrôlé, optionnelles pour les PNJ.
  hunger?: number; // 0 (affamé) → 100 (rassasié)
  fatigue?: number; // 0 (épuisé) → 100 (reposé)
  health?: number; // 0 (mort)   → 100 (parfait)

  // Connaissance et mémoire — optionnelles pour les PNJ.
  knowledge?: string[];
  memories?: string[];
  objectives?: string[];

  /**
   * Dernier instant mondial auquel les effets passifs de cette entité ont été
   * matérialisés. Optionnel pour charger les sauvegardes antérieures.
   */
  lastSimulationTime?: WorldTime;
}

