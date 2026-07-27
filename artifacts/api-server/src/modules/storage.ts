// storage.ts — Lecture et écriture de l'état du jeu en base de données.
// Toute persistance passe par ce module. Le LLM n'y a pas accès.

import { db, kitabaSessionsTable, kitabaSavesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { WorldState } from "./worldState.js";
import { NarrativeEntry } from "./types.js";
import { randomUUID } from "crypto";

// --- Sessions ---

export async function createSession(
  playerName: string,
  worldState: WorldState,
  narrativeHistory: NarrativeEntry[]
): Promise<string> {
  const id = randomUUID();

  await db.insert(kitabaSessionsTable).values({
    id,
    playerName,
    worldState: worldState as unknown as Record<string, unknown>,
    narrativeHistory: narrativeHistory as unknown as Record<string, unknown>[],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return id;
}

export async function loadSession(
  sessionId: string
): Promise<{ worldState: WorldState; narrativeHistory: NarrativeEntry[] } | null> {
  const rows = await db
    .select()
    .from(kitabaSessionsTable)
    .where(eq(kitabaSessionsTable.id, sessionId))
    .limit(1);

  if (!rows.length) return null;

  const row = rows[0];
  return {
    worldState: row.worldState as unknown as WorldState,
    narrativeHistory: row.narrativeHistory as unknown as NarrativeEntry[],
  };
}

export async function updateSession(
  sessionId: string,
  worldState: WorldState,
  narrativeHistory: NarrativeEntry[]
): Promise<void> {
  await db
    .update(kitabaSessionsTable)
    .set({
      worldState: worldState as unknown as Record<string, unknown>,
      narrativeHistory: narrativeHistory as unknown as Record<string, unknown>[],
      updatedAt: new Date(),
    })
    .where(eq(kitabaSessionsTable.id, sessionId));
}

// --- Sauvegardes nommées ---

export async function createSave(
  sessionId: string,
  playerName: string,
  saveName: string,
  worldState: WorldState,
  narrativeHistory: NarrativeEntry[]
): Promise<string> {
  const id = randomUUID();

  await db.insert(kitabaSavesTable).values({
    id,
    sessionId,
    saveName,
    playerName,
    worldState: worldState as unknown as Record<string, unknown>,
    narrativeHistory: narrativeHistory as unknown as Record<string, unknown>[],
    savedAt: new Date(),
  });

  return id;
}

export async function loadSave(
  saveId: string
): Promise<{ sessionId: string; playerName: string; worldState: WorldState; narrativeHistory: NarrativeEntry[] } | null> {
  const rows = await db
    .select()
    .from(kitabaSavesTable)
    .where(eq(kitabaSavesTable.id, saveId))
    .limit(1);

  if (!rows.length) return null;

  const row = rows[0];
  return {
    sessionId: row.sessionId,
    playerName: row.playerName,
    worldState: row.worldState as unknown as WorldState,
    narrativeHistory: row.narrativeHistory as unknown as NarrativeEntry[],
  };
}

export async function listSaves(): Promise<
  { saveId: string; saveName: string; playerName: string; savedAt: string }[]
> {
  const rows = await db
    .select({
      id: kitabaSavesTable.id,
      saveName: kitabaSavesTable.saveName,
      playerName: kitabaSavesTable.playerName,
      savedAt: kitabaSavesTable.savedAt,
    })
    .from(kitabaSavesTable)
    .orderBy(kitabaSavesTable.savedAt);

  return rows.map((r) => ({
    saveId: r.id,
    saveName: r.saveName,
    playerName: r.playerName,
    savedAt: r.savedAt.toISOString(),
  }));
}
