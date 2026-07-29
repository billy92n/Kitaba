// domain/events.ts — Événements factuels produits par le moteur.
// Ce sont des faits observables, jamais de la narration.

import type { WorldTime } from "./world.js";
import type { ActionType } from "./actions.js";

export type ObservationAudience = "ACTOR" | "LOCATION" | "PUBLIC";

export interface EventObservation {
  audience: ObservationAudience;
  text: string;
}

export interface StoredEventDetails {
  changes: string[];
  observations: EventObservation[];
  requestedTargetName: string | null;
  status: "APPLIED" | "REJECTED";
}

export interface GameEvent {
  id: string;
  sessionId: string;
  worldVersion: number;
  actionType: ActionType;
  actorId: string;
  locationId: string;
  targetId: string | null;
  description: string; // fait factuel court : "acteur se déplace vers lieu"
  consequences: string[]; // liste des changements d'état : "objet retiré de X", "entité en Y"
  occurredAt: WorldTime;
  status: "APPLIED" | "REJECTED";
  requestedTargetName: string | null;
  observations: EventObservation[];
}

export function serializeEventDetails(event: GameEvent): StoredEventDetails {
  return {
    changes: event.consequences,
    observations: event.observations,
    requestedTargetName: event.requestedTargetName,
    status: event.status,
  };
}

export function deserializeEventDetails(
  value: unknown,
  legacyDescription: string,
): StoredEventDetails {
  if (
    value !== null &&
    typeof value === "object" &&
    "changes" in value &&
    "observations" in value &&
    "requestedTargetName" in value &&
    "status" in value
  ) {
    return value as StoredEventDetails;
  }
  return {
    changes: Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [],
    observations: [{ audience: "ACTOR", text: legacyDescription }],
    requestedTargetName: null,
    status: legacyDescription.startsWith("[BLOQUÉ]") ? "REJECTED" : "APPLIED",
  };
}

/**
 * Convention actuelle, sans migration PostgreSQL :
 * - worldVersion avance uniquement lorsqu'un événement modifie le monde ;
 * - une tentative refusée conserve la version, porte une description préfixée
 *   `[BLOQUÉ] [CODE]`, aucune conséquence et un identifiant d'événement unique.
 * - le statut discriminant et les règles d'observation vivent dans l'enveloppe
 *   JSONB afin que les anciennes lignes `string[]` restent lisibles.
 */
