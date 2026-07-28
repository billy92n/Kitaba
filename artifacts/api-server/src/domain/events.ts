// domain/events.ts — Événements factuels produits par le moteur.
// Ce sont des faits observables, jamais de la narration.

import type { WorldTime } from "./world.js";

export interface GameEvent {
  id: string;
  sessionId: string;
  worldVersion: number;
  actionType: string;
  actorId: string;
  locationId: string;
  targetId: string | null;
  description: string;         // fait factuel court : "acteur se déplace vers lieu"
  consequences: string[];      // liste des changements d'état : "objet retiré de X", "entité en Y"
  occurredAt: WorldTime;
}
