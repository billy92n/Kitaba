import { describe, expect, it, vi } from "vitest";
import type { WorldSchedulerBatchResult } from "../services/worldScheduler.js";
import { runWorldSchedulerWorker } from "../services/worldSchedulerWorker.js";

function completed(
  stopReason: Extract<
    WorldSchedulerBatchResult,
    { status: "COMPLETED" }
  >["stopReason"],
): Extract<WorldSchedulerBatchResult, { status: "COMPLETED" }> {
  return {
    status: "COMPLETED",
    stopReason,
    spentBudget: stopReason === "NO_ACTIVE_ACTOR" ? 0 : 4,
    remainingBudget: stopReason === "NO_ACTIVE_ACTOR" ? 8 : 4,
    activations: [],
    worldState: {} as Extract<
      WorldSchedulerBatchResult,
      { status: "COMPLETED" }
    >["worldState"],
  };
}

const options = {
  sessionId: "session",
  maxBatches: 2,
  batchConfig: { seed: "seed", budgetUnits: 8 },
};

describe("world scheduler worker", () => {
  it("runs bounded batches until the active queue is drained", async () => {
    const runBatch = vi
      .fn()
      .mockResolvedValueOnce(completed("BUDGET_EXHAUSTED"))
      .mockResolvedValueOnce(completed("NO_ACTIVE_ACTOR"));

    await expect(
      runWorldSchedulerWorker(options, { runBatch }),
    ).resolves.toMatchObject({
      status: "DRAINED",
      batches: 2,
      spentBudget: 4,
    });
    expect(runBatch).toHaveBeenCalledTimes(2);
  });

  it("stops at its deterministic batch limit", async () => {
    const runBatch = vi.fn().mockResolvedValue(completed("FAIRNESS_BOUNDARY"));
    await expect(
      runWorldSchedulerWorker(options, { runBatch }),
    ).resolves.toMatchObject({
      status: "LIMIT_REACHED",
      batches: 2,
      spentBudget: 8,
    });
  });

  it("interrupts immediately on OCC conflict without retry", async () => {
    const conflict: WorldSchedulerBatchResult = {
      status: "CONFLICT",
      code: "WORLD_VERSION_CONFLICT",
      spentBudget: 0,
      activations: [],
      attemptedActorId: "actor",
    };
    const runBatch = vi.fn().mockResolvedValue(conflict);
    await expect(
      runWorldSchedulerWorker(options, { runBatch }),
    ).resolves.toMatchObject({
      status: "INTERRUPTED",
      batches: 1,
      result: conflict,
    });
    expect(runBatch).toHaveBeenCalledOnce();
  });

  it("rejects an unbounded or invalid batch count", async () => {
    await expect(
      runWorldSchedulerWorker(
        { ...options, maxBatches: 0 },
        { runBatch: vi.fn() },
      ),
    ).rejects.toThrow("maxBatches");
  });
});
