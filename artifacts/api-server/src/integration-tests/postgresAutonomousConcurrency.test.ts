import { eq, sql } from "drizzle-orm";
import {
  db,
  kitabaEventsTable,
  kitabaSavesTable,
  kitabaSessionsTable,
  pool,
} from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAction } from "../engine/actionResolver.js";
import { postgresActionCommitPort } from "../services/postgresActionCommit.js";
import { createInitialWorldState } from "../worldSeed.js";

const sessionId = "autonomy-concurrency-integration";

beforeAll(async () => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kitaba_sessions (
      id text PRIMARY KEY,
      controlled_entity_id text NOT NULL,
      world_version integer NOT NULL DEFAULT 0,
      world_state jsonb NOT NULL,
      narrative_history jsonb NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kitaba_events (
      id text PRIMARY KEY,
      session_id text NOT NULL,
      world_version integer NOT NULL,
      action_type text NOT NULL,
      actor_id text NOT NULL,
      location_id text NOT NULL,
      target_id text,
      description text NOT NULL,
      consequences jsonb NOT NULL,
      occurred_at jsonb NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kitaba_saves (
      id text PRIMARY KEY,
      session_id text NOT NULL,
      parent_session_id text,
      save_type text NOT NULL DEFAULT 'manual',
      save_name text NOT NULL,
      controlled_entity_id text NOT NULL,
      world_version integer NOT NULL,
      world_state jsonb NOT NULL,
      narrative_history jsonb NOT NULL,
      saved_at timestamp NOT NULL DEFAULT now()
    )
  `);
});

afterAll(async () => {
  await db
    .delete(kitabaEventsTable)
    .where(eq(kitabaEventsTable.sessionId, sessionId));
  await db
    .delete(kitabaSavesTable)
    .where(eq(kitabaSavesTable.sessionId, sessionId));
  await db
    .delete(kitabaSessionsTable)
    .where(eq(kitabaSessionsTable.id, sessionId));
  await pool.end();
});

describe("PostgreSQL autonomous optimistic concurrency", () => {
  it("atomically keeps one event and one save for two stale decisions", async () => {
    const initial = createInitialWorldState("Yara");
    await db
      .delete(kitabaEventsTable)
      .where(eq(kitabaEventsTable.sessionId, sessionId));
    await db
      .delete(kitabaSavesTable)
      .where(eq(kitabaSavesTable.sessionId, sessionId));
    await db
      .delete(kitabaSessionsTable)
      .where(eq(kitabaSessionsTable.id, sessionId));
    await db.insert(kitabaSessionsTable).values({
      id: sessionId,
      controlledEntityId: initial.controlledEntityId,
      worldVersion: initial.worldVersion,
      worldState: initial,
      narrativeHistory: [],
    });

    const hamid = resolveAction(
      initial,
      "hamid",
      {
        actionType: "sleep",
        targetName: null,
        details: "",
        rawInput: "",
      },
      { createEventId: () => "postgres-event-hamid" },
    );
    const tariq = resolveAction(
      initial,
      "tariq",
      {
        actionType: "sleep",
        targetName: null,
        details: "",
        rawInput: "",
      },
      { createEventId: () => "postgres-event-tariq" },
    );

    const results = await Promise.all([
      postgresActionCommitPort.tryCommit({
        sessionId,
        expectedWorldVersion: 0,
        expectedNarrativeHistory: [],
        newWorldState: hamid.newWorldState,
        narrativeHistory: [],
        event: { ...hamid.event, sessionId },
        autoSaveId: "postgres-save-hamid",
      }),
      postgresActionCommitPort.tryCommit({
        sessionId,
        expectedWorldVersion: 0,
        expectedNarrativeHistory: [],
        newWorldState: tariq.newWorldState,
        narrativeHistory: [],
        event: { ...tariq.event, sessionId },
        autoSaveId: "postgres-save-tariq",
      }),
    ]);

    expect(results.sort()).toEqual(["COMMITTED", "CONFLICT"]);
    expect(await db.select().from(kitabaEventsTable)).toHaveLength(1);
    expect(await db.select().from(kitabaSavesTable)).toHaveLength(1);
    expect(await db.select().from(kitabaSessionsTable)).toMatchObject([
      { id: sessionId, worldVersion: 1 },
    ]);
  });
});
