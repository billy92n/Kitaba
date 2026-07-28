// domain/actions.ts — Action structurée produite par le module LLM d'interprétation.
// Validée par schéma Zod avant d'être transmise au moteur.
// Le moteur n'interprète JAMAIS le langage naturel — il reçoit cette structure.

export const ACTION_TYPES = [
  "move",
  "speak",
  "take",
  "examine",
  "give",
  "eat",
  "sleep",
  "attack",
  "use",
  "unknown",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export interface StructuredAction {
  actionType: ActionType;
  targetName: string | null;
  details: string;
  rawInput: string;
}
