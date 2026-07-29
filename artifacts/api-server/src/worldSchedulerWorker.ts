import { runWorldSchedulerWorker } from "./services/worldSchedulerWorker.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value || value.length === 0) {
    throw new Error(`${name} must be a non-empty canonical string.`);
  }
  return value;
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}

const result = await runWorldSchedulerWorker({
  sessionId: requiredEnvironment("KITABA_SCHEDULER_SESSION_ID"),
  maxBatches: positiveIntegerEnvironment("KITABA_SCHEDULER_MAX_BATCHES", 100),
  batchConfig: {
    seed: requiredEnvironment("KITABA_SCHEDULER_SEED"),
    budgetUnits: positiveIntegerEnvironment(
      "KITABA_SCHEDULER_BUDGET_UNITS",
      64,
    ),
  },
});

process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status === "INTERRUPTED") process.exitCode = 1;
