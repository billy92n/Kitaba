import { and, eq } from "drizzle-orm";
import {
  db,
  kitabaEventsTable,
  kitabaSavesTable,
  kitabaSessionsTable,
} from "@workspace/db";
import { serializeEventDetails } from "../domain/events.js";
import type { ActionCommitPort, ActionCommitResult } from "./actionCommit.js";

/**
 * Adaptateur PostgreSQL du commit optimiste. Le contrat reste testable sans
 * initialiser de connexion à la base.
 */
export const postgresActionCommitPort: ActionCommitPort = {
  async tryCommit(actionCommit) {
    return db.transaction(async (tx): Promise<ActionCommitResult> => {
      const updatedSessions = await tx
        .update(kitabaSessionsTable)
        .set({
          worldVersion: actionCommit.newWorldState.worldVersion,
          worldState: actionCommit.newWorldState,
          narrativeHistory: actionCommit.narrativeHistory,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(kitabaSessionsTable.id, actionCommit.sessionId),
            eq(
              kitabaSessionsTable.worldVersion,
              actionCommit.expectedWorldVersion,
            ),
            eq(
              kitabaSessionsTable.narrativeHistory,
              actionCommit.expectedNarrativeHistory,
            ),
          ),
        )
        .returning({ id: kitabaSessionsTable.id });

      if (updatedSessions.length !== 1) return "CONFLICT";

      const event = actionCommit.event;
      await tx.insert(kitabaEventsTable).values({
        id: event.id,
        sessionId: actionCommit.sessionId,
        worldVersion: event.worldVersion,
        actionType: event.actionType,
        actorId: event.actorId,
        locationId: event.locationId,
        targetId: event.targetId,
        description: event.description,
        consequences: serializeEventDetails(event),
        occurredAt: event.occurredAt,
      });

      await tx.insert(kitabaSavesTable).values({
        id: actionCommit.autoSaveId,
        sessionId: actionCommit.sessionId,
        parentSessionId: null,
        saveType: "auto",
        saveName: `auto-v${actionCommit.newWorldState.worldVersion}`,
        controlledEntityId: actionCommit.newWorldState.controlledEntityId,
        worldVersion: actionCommit.newWorldState.worldVersion,
        worldState: actionCommit.newWorldState,
        narrativeHistory: actionCommit.narrativeHistory,
      });

      return "COMMITTED";
    });
  },
};

