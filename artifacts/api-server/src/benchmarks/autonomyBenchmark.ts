import { cpus, platform, release } from "node:os";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { AutonomousDecisionInput } from "../engine/autonomyContext.js";
import { decideAutonomousAction } from "../engine/autonomyDecision.js";

function input(candidateCount: number): AutonomousDecisionInput {
  return {
    actor: {
      actorId: "benchmark-actor",
      actorName: "Benchmark",
      locationId: "benchmark-location",
      hunger: 100,
      fatigue: 100,
      health: 100,
      profile: {
        traits: {
          prudence: 50,
          sociability: 50,
          ambition: 50,
          curiosity: 70,
          discipline: 50,
        },
        persistentGoal: { kind: "EXPLORE", strength: 60 },
      },
      previousDecision: null,
      worldTime: {
        year: 1,
        season: "automne",
        day: 1,
        hour: 12,
        minute: 0,
      },
      observedAction: null,
    },
    candidates: Array.from({ length: candidateCount }, (_, index) => ({
      candidateKey: `move:location-${index.toString().padStart(5, "0")}`,
      targetId: `location-${index.toString().padStart(5, "0")}`,
      action: {
        actionType: "move" as const,
        targetName: `Location ${index}`,
        details: "",
        rawInput: "",
      },
      source: "CONNECTED_LOCATION" as const,
      eligibility: { eligible: true as const },
    })),
  };
}

function measure(candidateCount: number, iterations: number): object {
  const fixture = input(candidateCount);
  for (let index = 0; index < 100; index += 1) {
    decideAutonomousAction(fixture, { seed: index });
  }
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    decideAutonomousAction(fixture, { seed: index });
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    candidateCount,
    iterations,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    meanMicroseconds: Number(((elapsedMs * 1_000) / iterations).toFixed(3)),
  };
}

describe("autonomy decision performance", () => {
  it("measures candidate scaling and a series of independent actors", () => {
    const seriesStartedAt = performance.now();
    for (let actorIndex = 0; actorIndex < 100; actorIndex += 1) {
      decideAutonomousAction(input(100), { seed: `actor-${actorIndex}` });
    }
    const seriesElapsedMs = performance.now() - seriesStartedAt;
    const report = {
      protocol: {
        warmupIterations: 100,
        clock: "node:perf_hooks performance.now",
        note: "Microbenchmark of the pure scorer; candidate discovery and database I/O are excluded.",
      },
      environment: {
        node: process.version,
        platform: `${platform()} ${release()}`,
        cpu: cpus()[0]?.model ?? "unknown",
      },
      decisions: [measure(10, 2_000), measure(100, 1_000), measure(1_000, 200)],
      actorSeries: {
        actors: 100,
        candidatesPerActor: 100,
        elapsedMs: Number(seriesElapsedMs.toFixed(3)),
      },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    expect(report.decisions).toHaveLength(3);
    expect(report.actorSeries.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
