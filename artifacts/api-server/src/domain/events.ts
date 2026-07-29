// domain/events.ts â€” Ã‰vÃ©nements factuels produits par le moteur.
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
  description: string; // fait factuel court : "acteur se dÃ©place vers lieu"
  consequences: string[]; // liste des changements d'Ã©tat : "objet retirÃ© de X", "entitÃ© en Y"
  occurredAt: WorldTime;
}

/**
 * Convention actuelle, sans migration PostgreSQL :
 * - worldVersion avance uniquement lorsqu'un Ã©vÃ©nement modifie le monde ;
 * - une tentative refusÃ©e conserve la version, porte une description prÃ©fixÃ©e
 *   `[BLOQUÃ‰] [CODE]`, aucune consÃ©quence et un identifiant d'Ã©vÃ©nement unique.
 * Une future modÃ©lisation plus riche devra ajouter un statut discriminant au
 * domaine et au schÃ©ma dans une migration explicite.
 */

