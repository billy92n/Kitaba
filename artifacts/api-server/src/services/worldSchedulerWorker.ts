import {
  runWorldSchedulerBatch,
  type CompletedScheduledActivation,
  type WorldSchedulerBatchConfig,
  type WorldSchedulerBatchResult,
} from "./worldScheduler.js";

export interface WorldSchedulerWorkerOptions {
  sessionId: string;
  maxBatches: number;
  batchConfig: WorldSchedulerBatchConfig;
}

export interface WorldSchedulerWorkerDependencies {
  runBatch(
    sessionId: string,
    config: WorldSchedulerBatchConfig,
  ): Promise<WorldSchedulerBatchResult>;
}

export type WorldSchedulerWorkerResult =
  | {
      status: "DRAINED" | "LIMIT_REACHED";
      batches: number;
      spentBudget: number;
      activations: CompletedScheduledActivation[];
    }
  | {
      status: "INTERRUPTED";
      batches: number;
      spentBudget: number;
      activations: CompletedScheduledActivation[];
      result: Exclude<WorldSchedulerBatchResult, { status: "COMPLETED" }>;
    };

const defaultDependencies: WorldSchedulerWorkerDependencies = {
  runBatch: runWorldSchedulerBatch,
};

/**
 * Bounded production pump. It never uses wall-clock time or retries OCC:
 * supervisors may invoke it repeatedly, while each invocation remains
 * replayable and safely interruptible.
 */
export async function runWorldSchedulerWorker(
  options: WorldSchedulerWorkerOptions,
  dependencies: WorldSchedulerWorkerDependencies = defaultDependencies,
): Promise<WorldSchedulerWorkerResult> {
  if (!Number.isSafeInteger(options.maxBatches) || options.maxBatches <= 0) {
    throw new Error("maxBatches must be a positive safe integer.");
  }

  const activations: CompletedScheduledActivation[] = [];
  let spentBudget = 0;

  for (let batch = 1; batch <= options.maxBatches; batch += 1) {
    const result = await dependencies.runBatch(
      options.sessionId,
      options.batchConfig,
    );
    if (result.status !== "COMPLETED") {
      return {
        status: "INTERRUPTED",
        batches: batch,
        spentBudget,
        activations,
        result,
      };
    }
    spentBudget += result.spentBudget;
    activations.push(...result.activations);
    if (result.stopReason === "NO_ACTIVE_ACTOR") {
      return { status: "DRAINED", batches: batch, spentBudget, activations };
    }
  }

  return {
    status: "LIMIT_REACHED",
    batches: options.maxBatches,
    spentBudget,
    activations,
  };
}
