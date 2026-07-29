import { cpus, platform, release } from "node:os";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { Entity } from "../domain/entities.js";
import type { WorldLocation, WorldState } from "../domain/world.js";
import {
  completeScheduledActivation,
  ensureWorldScheduler,
  resolveWorldSchedulerConfig,
  selectScheduledActivation,
} from "../engine/worldScheduler.js";
import { createInitialWorldState } from "../worldSeed.js";
import type {
  ActionCommit,
  ActionCommitPort,
} from "../services/actionCommit.js";
import type { AutonomousSessionSnapshot } from "../services/autonomousTurn.js";
import { createWorldSchedulerBatchRunner } from "../services/worldScheduler.js";

function largeWorld(actorCount: number): WorldState {
  const base = createInitialWorldState("Benchmark");
  const template = base.entities.hamid;
  const entities: Record<string, Entity> = {};
  for (let index = actorCount - 1; index >= 0; index -= 1) {
    const id = `actor-${index.toString().padStart(6, "0")}`;
    entities[id] = { ...template, id, name: id };
  }
  return {
    ...base,
    controlledEntityId: "actor-000000",
    entities,
  };
}

function isolatedWorld(actorCount: number): WorldState {
  const world = largeWorld(actorCount);
  const locations: Record<string, WorldLocation> = {};
  const entities: Record<string, Entity> = {};
  for (const actorId of Object.keys(world.entities)) {
    const locationId = `location-${actorId}`;
    locations[locationId] = {
      id: locationId,
      name: locationId,
      description: "Isolated benchmark location",
      connectedLocations: [],
      presentEntities: [actorId],
      presentObjects: [],
    };
    entities[actorId] = {
      ...world.entities[actorId],
      locationId,
      inventory: [],
    };
  }
  return { ...world, entities, locations, objects: {}, relations: [] };
}

describe("world scheduler performance", () => {
  it("measures bootstrap and one fair cycle for ten thousand actors", () => {
    const actorCount = 10_000;
    const config = resolveWorldSchedulerConfig({ budgetUnits: 8 });
    const bootstrapStartedAt = performance.now();
    let state = ensureWorldScheduler(largeWorld(actorCount), "benchmark-seed");
    const bootstrapMs = performance.now() - bootstrapStartedAt;

    const cycleStartedAt = performance.now();
    for (let index = 0; index < actorCount; index += 1) {
      const activation = selectScheduledActivation(state.scheduler, config);
      if (!activation) throw new Error("The active queue became empty.");
      state = completeScheduledActivation(state, activation, config);
    }
    const cycleMs = performance.now() - cycleStartedAt;
    const report = {
      protocol: {
        actors: actorCount,
        operation:
          "historical-save bootstrap followed by one pop/reinsert per actor",
        clock: "node:perf_hooks performance.now",
        note: "Pure scheduler benchmark; autonomous decisions, database I/O and narration are excluded.",
      },
      environment: {
        node: process.version,
        platform: `${platform()} ${release()}`,
        cpu: cpus()[0]?.model ?? "unknown",
      },
      bootstrapMs: Number(bootstrapMs.toFixed(3)),
      fairCycleMs: Number(cycleMs.toFixed(3)),
      meanActivationMicroseconds: Number(
        ((cycleMs * 1_000) / actorCount).toFixed(3),
      ),
      finalRevision: state.scheduler.revision,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    expect(report.finalRevision).toBe(actorCount);
    expect(report.bootstrapMs).toBeGreaterThanOrEqual(0);
    expect(report.fairCycleMs).toBeGreaterThanOrEqual(0);
  });

  it("measures one thousand full service activations with one-actor budgets", async () => {
    const actorCount = 1_000;
    const worldState = ensureWorldScheduler(
      isolatedWorld(actorCount),
      "service-benchmark-seed",
    );
    let session: AutonomousSessionSnapshot = {
      id: "service-benchmark-session",
      controlledEntityId: worldState.controlledEntityId,
      worldVersion: worldState.worldVersion,
      worldState,
      narrativeHistory: [],
    };
    const commitPort: ActionCommitPort = {
      async tryCommit(commit: ActionCommit) {
        if (commit.expectedWorldVersion !== session.worldVersion) {
          return "CONFLICT";
        }
        session = {
          ...session,
          worldVersion: commit.newWorldState.worldVersion,
          worldState: commit.newWorldState,
          narrativeHistory: commit.narrativeHistory,
        };
        return "COMMITTED";
      },
    };
    const runBatch = await createWorldSchedulerBatchRunner(
      session.id,
      {
        seed: "service-benchmark-seed",
        budgetUnits: 8,
        lodProfiles: { LOD1: { cadenceMinutes: 60, budgetCost: 8 } },
      },
      { loadSession: async () => session, commitPort },
    );
    const startedAt = performance.now();
    let activationCount = 0;
    for (let index = 0; index < actorCount; index += 1) {
      const result = await runBatch();
      if (result.status !== "COMPLETED") {
        throw new Error(`Service benchmark stopped with ${result.status}.`);
      }
      activationCount += result.activations.length;
    }
    const elapsedMs = performance.now() - startedAt;
    const report = {
      protocol: {
        actors: actorCount,
        operation:
          "one thousand separate service batches including decision, engine, perception, narration and in-memory ActionCommitPort",
        persistence:
          "in-memory OCC adapter; PostgreSQL latency and JSONB writes excluded",
        budget: "one LOD1 activation per batch",
      },
      environment: {
        node: process.version,
        platform: `${platform()} ${release()}`,
        cpu: cpus()[0]?.model ?? "unknown",
      },
      elapsedMs: Number(elapsedMs.toFixed(3)),
      meanActivationMs: Number((elapsedMs / actorCount).toFixed(3)),
      activations: activationCount,
      finalWorldVersion: session.worldVersion,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    expect(report.activations).toBe(actorCount);
    expect(report.finalWorldVersion).toBe(actorCount);
  });
});
