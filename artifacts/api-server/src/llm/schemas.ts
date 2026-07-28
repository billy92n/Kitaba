// llm/schemas.ts — Schémas Zod pour valider la sortie du module d'interprétation LLM.
// Le moteur n'accepte que des actions conformes à ce contrat strict.

import { z } from "zod/v4";
import { ACTION_TYPES } from "../domain/actions.js";

export const structuredActionSchema = z.object({
  actionType: z.enum(ACTION_TYPES as unknown as [string, ...string[]]),
  targetName: z.string().nullable(),
  details: z.string(),
  rawInput: z.string(),
});

export type ValidatedStructuredAction = z.infer<typeof structuredActionSchema>;

// Valide et retourne l'action structurée, ou lève une ZodError
export function validateStructuredAction(action: unknown): ValidatedStructuredAction {
  return structuredActionSchema.parse(action);
}
