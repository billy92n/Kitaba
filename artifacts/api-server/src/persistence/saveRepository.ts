// persistence/saveRepository.ts — Sauvegardes manuelles et automatiques.
//
// saveType "auto"   : créé après chaque action réussie, nom généré automatiquement.
// saveType "manual" : nommé par le joueur explicitement.
//
// Le chargement d'une sauvegarde crée une NOUVELLE session (branchement).
// L'ancienne session et son historique restent intacts.

import { randomUUID } from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { kitabaSavesTable } from "./schema.js";
import type { WorldState } from "../domain/world.js";
import type { NarrativeEntry } from "./types.js";

export interface SaveRecord {
  id: string;
  sessionId: string;
  parentSessionId: string | null;
  saveType: string;
  saveName: string;
  controlledEntityId: string;
  worldVersion: number;
  worldState: WorldState;
  narrativeHistory: NarrativeEntry[];
  savedAt: Date;
}

export async function createSave(
  sessionId: string,
  saveName: string,
  saveType: "auto" | "manual",
  controlledEntityId: string,
  worldState: WorldState,
  narrativeHistory: NarrativeEntry[],
  parentSessionId?: string
): Promise<string> {
  const id = randomUUID();
  await db.insert(kitabaSavesTable).values({
    id,
    sessionId,
    parentSessionId: parentSessionId ?? null,
    saveType,
    saveName,
    controlledEntityId,
    worldVersion: worldState.worldVersion,
    worldState: worldState as unknown as Record<string, unknown>,
    narrativeHistory: narrativeHistory as unknown as Record<string, unknown>[],
  });
  return id;
}

export async function loadSave(saveId: string): Promise<SaveRecord | null> {
  const rows = await db
    .select()
    .from(kitabaSavesTable)
    .where(eq(kitabaSavesTable.id, saveId));
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    sessionId: row.sessionId,
    parentSessionId: row.parentSessionId ?? null,
    saveType: row.saveType,
    saveName: row.saveName,
    controlledEntityId: row.controlledEntityId,
    worldVersion: row.worldVersion,
    worldState: row.worldState as unknown as WorldState,
    narrativeHistory: row.narrativeHistory as unknown as NarrativeEntry[],
    savedAt: row.savedAt,
  };
}

export async function listManualSaves(sessionId?: string): Promise<SaveRecord[]> {
  const conditions = sessionId
    ? and(eq(kitabaSavesTable.saveType, "manual"), eq(kitabaSavesTable.sessionId, sessionId))
    : eq(kitabaSavesTable.saveType, "manual");

  const rows = await db
    .select()
    .from(kitabaSavesTable)
    .where(conditions)
    .orderBy(desc(kitabaSavesTable.savedAt));

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    parentSessionId: row.parentSessionId ?? null,
    saveType: row.saveType,
    saveName: row.saveName,
    controlledEntityId: row.controlledEntityId,
    worldVersion: row.worldVersion,
    worldState: row.worldState as unknown as WorldState,
    narrativeHistory: row.narrativeHistory as unknown as NarrativeEntry[],
    savedAt: row.savedAt,
  }));
}

// Supprime les auto-saves anciennes (garde les N plus récentes par session)
export async function pruneAutoSaves(sessionId: string, keepCount = 5): Promise<void> {
  const rows = await db
    .select({ id: kitabaSavesTable.id })
    .from(kitabaSavesTable)
    .where(and(eq(kitabaSavesTable.sessionId, sessionId), eq(kitabaSavesTable.saveType, "auto")))
    .orderBy(desc(kitabaSavesTable.savedAt));

  const toDelete = rows.slice(keepCount);
  for (const row of toDelete) {
    await db.delete(kitabaSavesTable).where(eq(kitabaSavesTable.id, row.id));
  }
}
