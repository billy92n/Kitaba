import { cpus, platform, release } from "node:os";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { Entity } from "../domain/entities.js";
import type { WorldState } from "../domain/world.js";
import {
  completeScheduledActivation,
  ensureWorldScheduler,
  resolveWorldSchedulerConfig,
  selectScheduledActivation,
} from "../engine/worldScheduler.js";
import { createInitialWorldState } from "../worldSeed.js";

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
});
