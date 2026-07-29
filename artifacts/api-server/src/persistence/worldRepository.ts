// persistence/worldRepository.ts — CRUD des sessions (état du monde courant).
// Toutes les opérations sur la session courante passent par ici.

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { kitabaSessionsTable } from "./schema.js";
import type { WorldState } from "../domain/world.js";
import type { NarrativeEntry } from "./types.js";

export interface SessionRecord {
  id: string;
  controlledEntityId: string;
  worldVersion: number;
  worldState: WorldState;
  narrativeHistory: NarrativeEntry[];
}

export async function createSession(
  controlledEntityId: string,
  worldState: WorldState,
  narrativeHistory: NarrativeEntry[],
): Promise<string> {
  const id = randomUUID();
  await db.insert(kitabaSessionsTable).values({
    id,
    controlledEntityId,
    worldVersion: worldState.worldVersion,
    worldState: worldState as unknown as Record<string, unknown>,
    narrativeHistory: narrativeHistory as unknown as Record<string, unknown>[],
  });
  return id;
}

export async function loadSession(
  sessionId: string,
): Promise<SessionRecord | null> {
  const rows = await db
    .select()
    .from(kitabaSessionsTable)
    .where(eq(kitabaSessionsTable.id, sessionId));
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    controlledEntityId: row.controlledEntityId,
    worldVersion: row.worldVersion,
    worldState: row.worldState as unknown as WorldState,
    narrativeHistory: row.narrativeHistory as unknown as NarrativeEntry[],
  };
}
