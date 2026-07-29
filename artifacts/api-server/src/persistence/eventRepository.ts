// persistence/eventRepository.ts — Journal persistant des événements.
// Chaque action réussie (et même bloquée) crée un événement immuable.

import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { kitabaEventsTable } from "./schema.js";
import {
  deserializeEventDetails,
  serializeEventDetails,
  type GameEvent,
} from "../domain/events.js";

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
    consequences: serializeEventDetails(event),
    occurredAt: event.occurredAt as unknown as Record<string, unknown>,
  });
}

export async function getSessionEvents(
  sessionId: string,
): Promise<GameEvent[]> {
  const rows = await db
    .select()
    .from(kitabaEventsTable)
    .where(eq(kitabaEventsTable.sessionId, sessionId))
    .orderBy(kitabaEventsTable.worldVersion);

  return rows.map((row) => {
    const details = deserializeEventDetails(row.consequences, row.description);
    return {
      id: row.id,
      sessionId: row.sessionId,
      worldVersion: row.worldVersion,
      actionType: row.actionType as GameEvent["actionType"],
      actorId: row.actorId,
      locationId: row.locationId,
      targetId: row.targetId ?? null,
      description: row.description,
      consequences: details.changes,
      occurredAt:
        row.occurredAt as unknown as import("../domain/world.js").WorldTime,
      status: details.status,
      requestedTargetName: details.requestedTargetName,
      observations: details.observations,
    };
  });
}
