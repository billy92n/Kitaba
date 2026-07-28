// persistence/eventRepository.ts — Journal persistant des événements.
// Chaque action réussie (et même bloquée) crée un événement immuable.

import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { kitabaEventsTable } from "./schema.js";
import type { GameEvent } from "../domain/events.js";

export async function persistEvent(event: GameEvent): Promise<void> {
  await db.insert(kitabaEventsTable).values({
    id: event.id,
    sessionId: event.sessionId,
    worldVersion: event.worldVersion,
    actionType: event.actionType,
    actorId: event.actorId,
    locationId: event.locationId,
    targetId: event.targetId ?? null,
    description: event.description,
    consequences: event.consequences as unknown as Record<string, unknown>,
    occurredAt: event.occurredAt as unknown as Record<string, unknown>,
  });
}

export async function getSessionEvents(sessionId: string): Promise<GameEvent[]> {
  const rows = await db
    .select()
    .from(kitabaEventsTable)
    .where(eq(kitabaEventsTable.sessionId, sessionId))
    .orderBy(kitabaEventsTable.worldVersion);

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    worldVersion: row.worldVersion,
    actionType: row.actionType,
    actorId: row.actorId,
    locationId: row.locationId,
    targetId: row.targetId ?? null,
    description: row.description,
    consequences: row.consequences as unknown as string[],
    occurredAt: row.occurredAt as unknown as import("../domain/world.js").WorldTime,
    createdAt: row.createdAt,
  }));
}
