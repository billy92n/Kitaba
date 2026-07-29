import { eq, sql } from "drizzle-orm";
import {
  db,
  kitabaEventsTable,
  kitabaSavesTable,
  kitabaSessionsTable,
  pool,
} from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorldState } from "../domain/world.js";
import { resolveAction } from "../engine/actionResolver.js";
import { loadSession } from "../persistence/worldRepository.js";
import { postgresActionCommitPort } from "../services/postgresActionCommit.js";
import { runWorldSchedulerBatch } from "../services/worldScheduler.js";
import { createInitialWorldState } from "../worldSeed.js";

const sessionId = "autonomy-concurrency-integration";
const secondSessionId = "autonomy-concurrency-integration-second";

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
  await db
    .delete(kitabaEventsTable)
    .where(eq(kitabaEventsTable.sessionId, secondSessionId));
  await db
    .delete(kitabaSavesTable)
    .where(eq(kitabaSavesTable.sessionId, secondSessionId));
  await db
    .delete(kitabaSessionsTable)
    .where(eq(kitabaSessionsTable.id, secondSessionId));
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
    expect(
      await db
        .select()
        .from(kitabaEventsTable)
        .where(eq(kitabaEventsTable.sessionId, sessionId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(kitabaSavesTable)
        .where(eq(kitabaSavesTable.sessionId, sessionId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(kitabaSessionsTable)
        .where(eq(kitabaSessionsTable.id, sessionId)),
    ).toMatchObject([{ id: sessionId, worldVersion: 1 }]);
  });

  it("atomically keeps one scheduler transition for two stale batches", async () => {
    const initial = createInitialWorldState("Scheduler");
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
    const staleSnapshot = await loadSession(sessionId);
    expect(staleSnapshot).not.toBeNull();
    if (!staleSnapshot) return;
    const dependencies = {
      loadSession: async () => staleSnapshot,
      commitPort: postgresActionCommitPort,
    };
    const schedulerConfig = {
      seed: "postgres-scheduler",
      budgetUnits: 8,
      lodProfiles: {
        LOD1: { cadenceMinutes: 60, budgetCost: 8 },
      },
    } as const;

    const results = await Promise.all([
      runWorldSchedulerBatch(sessionId, schedulerConfig, dependencies),
      runWorldSchedulerBatch(sessionId, schedulerConfig, dependencies),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "COMPLETED",
      "CONFLICT",
    ]);
    expect(
      await db
        .select()
        .from(kitabaEventsTable)
        .where(eq(kitabaEventsTable.sessionId, sessionId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(kitabaSavesTable)
        .where(eq(kitabaSavesTable.sessionId, sessionId)),
    ).toHaveLength(1);
    const [persisted] = await db
      .select()
      .from(kitabaSessionsTable)
      .where(eq(kitabaSessionsTable.id, sessionId));
    expect(persisted).toMatchObject({ worldVersion: 1 });
    expect(
      (persisted?.worldState as WorldState | undefined)?.scheduler?.revision,
    ).toBe(1);
  });

  it("persists identical seeded timelines in separate sessions without ID collisions", async () => {
    const first = createInitialWorldState("First");
    const second = createInitialWorldState("Second");
    for (const id of [sessionId, secondSessionId]) {
      await db
        .delete(kitabaEventsTable)
        .where(eq(kitabaEventsTable.sessionId, id));
      await db
        .delete(kitabaSavesTable)
        .where(eq(kitabaSavesTable.sessionId, id));
      await db
        .delete(kitabaSessionsTable)
        .where(eq(kitabaSessionsTable.id, id));
    }
    await db.insert(kitabaSessionsTable).values([
      {
        id: sessionId,
        controlledEntityId: first.controlledEntityId,
        worldVersion: 0,
        worldState: first,
        narrativeHistory: [],
      },
      {
        id: secondSessionId,
        controlledEntityId: second.controlledEntityId,
        worldVersion: 0,
        worldState: second,
        narrativeHistory: [],
      },
    ]);
    const firstSnapshot = await loadSession(sessionId);
    const secondSnapshot = await loadSession(secondSessionId);
    expect(firstSnapshot).not.toBeNull();
    expect(secondSnapshot).not.toBeNull();
    if (!firstSnapshot || !secondSnapshot) return;
    const config = {
      seed: "shared-postgres-seed",
      budgetUnits: 8,
      lodProfiles: {
        LOD1: { cadenceMinutes: 60, budgetCost: 8 },
      },
    } as const;

    const [firstResult, secondResult] = await Promise.all([
      runWorldSchedulerBatch(sessionId, config, {
        loadSession: async () => firstSnapshot,
        commitPort: postgresActionCommitPort,
      }),
      runWorldSchedulerBatch(secondSessionId, config, {
        loadSession: async () => secondSnapshot,
        commitPort: postgresActionCommitPort,
      }),
    ]);

    expect(firstResult.status).toBe("COMPLETED");
    expect(secondResult.status).toBe("COMPLETED");
    if (
      firstResult.status !== "COMPLETED" ||
      secondResult.status !== "COMPLETED"
    ) {
      return;
    }
    expect(firstResult.activations[0]?.selectedCandidateKey).toBe(
      secondResult.activations[0]?.selectedCandidateKey,
    );
    expect(firstResult.activations[0]?.eventId).not.toBe(
      secondResult.activations[0]?.eventId,
    );
    expect(
      await db
        .select()
        .from(kitabaEventsTable)
        .where(eq(kitabaEventsTable.sessionId, sessionId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(kitabaEventsTable)
        .where(eq(kitabaEventsTable.sessionId, secondSessionId)),
    ).toHaveLength(1);
  });
});
