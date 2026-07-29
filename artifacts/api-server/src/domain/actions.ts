// domain/actions.ts — Action structurée produite par le module LLM d'interprétation.
// Validée par schéma Zod avant d'être transmise au moteur.
// Le moteur n'interprète JAMAIS le langage naturel — il reçoit cette structure.

import type { AutonomousActionMetadata } from "./autonomy.js";

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

const AUTONOMOUS_TARGETED_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
  "move",
  "speak",
  "take",
  "examine",
  "eat",
]);

export function actionRequiresCanonicalTarget(actionType: ActionType): boolean {
  return AUTONOMOUS_TARGETED_ACTION_TYPES.has(actionType);
}

export interface StructuredAction {
  actionType: ActionType;
  targetName: string | null;
  details: string;
  rawInput: string;
  /** Internal intent metadata. It never grants eligibility or consequences. */
  autonomy?: AutonomousActionMetadata;
}
