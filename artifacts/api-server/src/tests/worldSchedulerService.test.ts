import { describe, expect, it } from "vitest";
import type {
  ActionCommit,
  ActionCommitPort,
} from "../services/actionCommit.js";
import type { AutonomousSessionSnapshot } from "../services/autonomousTurn.js";
import { ensureWorldScheduler } from "../engine/worldScheduler.js";
import {
  runWorldSchedulerBatch,
  type WorldSchedulerBatchDependencies,
} from "../services/worldScheduler.js";
import { createInitialWorldState } from "../worldSeed.js";

class StatefulCommitPort implements ActionCommitPort {
  readonly commits: ActionCommit[] = [];

  constructor(
    private version: number,
    private narrativeHistory: ActionCommit["narrativeHistory"],
    private readonly forceConflict = false,
  ) {}

  async tryCommit(commit: ActionCommit): Promise<"COMMITTED" | "CONFLICT"> {
    if (
      this.forceConflict ||
      commit.expectedWorldVersion !== this.version ||
      JSON.stringify(commit.expectedNarrativeHistory) !==
        JSON.stringify(this.narrativeHistory)
    ) {
      return "CONFLICT";
    }
    this.version = commit.newWorldState.worldVersion;
    this.narrativeHistory = commit.narrativeHistory;
    this.commits.push(commit);
    return "COMMITTED";
  }
}

function snapshot(controlledEntityId = "player"): AutonomousSessionSnapshot {
  const worldState = createInitialWorldState("Mina");
  worldState.controlledEntityId = controlledEntityId;
  return {
    id: "session-scheduler",
    controlledEntityId,
    worldVersion: worldState.worldVersion,
    worldState,
    narrativeHistory: [],
  };
}

function dependencies(
  session: AutonomousSessionSnapshot | null,
  port: ActionCommitPort,
): WorldSchedulerBatchDependencies {
  return { loadSession: async () => session, commitPort: port };
}

describe("world scheduler service", () => {
  it("runs a budgeted fair batch exclusively through ActionCommitPort", async () => {
    const session = snapshot();
    const before = structuredClone(session);
    const port = new StatefulCommitPort(0, []);
    const result = await runWorldSchedulerBatch(
      session.id,
      { seed: "service-seed", budgetUnits: 12 },
      dependencies(session, port),
    );

    expect(result.status).toBe("COMPLETED");
    if (result.status !== "COMPLETED") return;
    expect(result.stopReason).toBe("BUDGET_EXHAUSTED");
    expect(result.spentBudget).toBe(12);
    expect(result.activations.map((entry) => entry.actorId)).toEqual([
      "amir",
      "hamid",
      "leila",
    ]);
    expect(new Set(result.activations.map((entry) => entry.actorId)).size).toBe(
      result.activations.length,
    );
    expect(port.commits).toHaveLength(3);
    expect(
      port.commits.every((commit) => commit.event.status === "APPLIED"),
    ).toBe(true);
    expect(session).toEqual(before);
  });

  it("produces the same complete chronology from the same world and seed", async () => {
    const firstSession = snapshot();
    const secondSession = structuredClone(firstSession);
    const first = await runWorldSchedulerBatch(
      firstSession.id,
      { seed: "replay-seed", budgetUnits: 24 },
      dependencies(firstSession, new StatefulCommitPort(0, [])),
    );
    const second = await runWorldSchedulerBatch(
      secondSession.id,
      { seed: "replay-seed", budgetUnits: 24 },
      dependencies(secondSession, new StatefulCommitPort(0, [])),
    );
    expect(second).toEqual(first);
  });

  it("names persisted artifacts deterministically without cross-session collisions", async () => {
    const firstSession = snapshot("amir");
    const secondSession = snapshot("amir");
    secondSession.id = "another-session";
    const firstPort = new StatefulCommitPort(0, []);
    const secondPort = new StatefulCommitPort(0, []);
    const first = await runWorldSchedulerBatch(
      firstSession.id,
      { seed: "shared-seed", budgetUnits: 8 },
      dependencies(firstSession, firstPort),
    );
    const second = await runWorldSchedulerBatch(
      secondSession.id,
      { seed: "shared-seed", budgetUnits: 8 },
      dependencies(secondSession, secondPort),
    );

    expect(first.status).toBe("COMPLETED");
    expect(second.status).toBe("COMPLETED");
    if (first.status !== "COMPLETED" || second.status !== "COMPLETED") return;
    expect(second.activations[0]?.selectedCandidateKey).toBe(
      first.activations[0]?.selectedCandidateKey,
    );
    expect(second.activations[0]?.eventId).not.toBe(
      first.activations[0]?.eventId,
    );
    expect(secondPort.commits[0]?.autoSaveId).not.toBe(
      firstPort.commits[0]?.autoSaveId,
    );
    expect(secondPort.commits[0]?.narrativeHistory[0]?.text).toBe(
      firstPort.commits[0]?.narrativeHistory[0]?.text,
    );
    expect(secondPort.commits[0]?.narrativeHistory[0]?.id).not.toBe(
      firstPort.commits[0]?.narrativeHistory[0]?.id,
    );
  });

  it("does not use controlledEntityId to select or decide another actor", async () => {
    const firstSession = snapshot("player");
    const secondSession = snapshot("hamid");
    const first = await runWorldSchedulerBatch(
      firstSession.id,
      { seed: "no-player-dependency", budgetUnits: 8 },
      dependencies(firstSession, new StatefulCommitPort(0, [])),
    );
    const second = await runWorldSchedulerBatch(
      secondSession.id,
      { seed: "no-player-dependency", budgetUnits: 8 },
      dependencies(secondSession, new StatefulCommitPort(0, [])),
    );
    expect(first.status).toBe("COMPLETED");
    expect(second.status).toBe("COMPLETED");
    if (first.status !== "COMPLETED" || second.status !== "COMPLETED") return;
    expect(second.activations).toEqual(first.activations);
    expect(second.worldState.entities.amir.autonomyDecisionState).toEqual(
      first.worldState.entities.amir.autonomyDecisionState,
    );
  });

  it("does not leak a remote action to an observer in another location", async () => {
    const session = snapshot();
    const port = new StatefulCommitPort(0, []);
    const result = await runWorldSchedulerBatch(
      session.id,
      { seed: "perception", budgetUnits: 8 },
      dependencies(session, port),
    );
    expect(result.status).toBe("COMPLETED");
    expect(port.commits[0]?.event.actorId).toBe("amir");
    expect(port.commits[0]?.narrativeHistory).toEqual([]);
  });

  it("stops safely on OCC conflict without persisting a consumed activation", async () => {
    const session = snapshot();
    const before = structuredClone(session);
    const port = new StatefulCommitPort(0, [], true);
    const result = await runWorldSchedulerBatch(
      session.id,
      { seed: "conflict", budgetUnits: 8 },
      dependencies(session, port),
    );
    expect(result).toMatchObject({
      status: "CONFLICT",
      code: "WORLD_VERSION_CONFLICT",
      spentBudget: 0,
      activations: [],
      attemptedActorId: "amir",
    });
    expect(port.commits).toHaveLength(0);
    expect(session).toEqual(before);
  });

  it("resumes the same pending actor after an interrupted batch", async () => {
    const session = snapshot();
    const config = {
      seed: "resume-after-conflict",
      budgetUnits: 8,
      lodProfiles: { LOD1: { cadenceMinutes: 60, budgetCost: 8 } },
    } as const;
    const interrupted = await runWorldSchedulerBatch(
      session.id,
      config,
      dependencies(session, new StatefulCommitPort(0, [], true)),
    );
    const resumed = await runWorldSchedulerBatch(
      session.id,
      config,
      dependencies(session, new StatefulCommitPort(0, [])),
    );

    expect(interrupted).toMatchObject({
      status: "CONFLICT",
      attemptedActorId: "amir",
      activations: [],
    });
    expect(resumed).toMatchObject({
      status: "COMPLETED",
      activations: [{ actorId: "amir", schedulerRevision: 0 }],
    });
  });

  it("reports missing sessions and invalid persisted scheduler state", async () => {
    const missingPort = new StatefulCommitPort(0, []);
    await expect(
      runWorldSchedulerBatch(
        "missing",
        { seed: "missing", budgetUnits: 8 },
        dependencies(null, missingPort),
      ),
    ).resolves.toEqual({
      status: "NOT_FOUND",
      code: "SESSION_NOT_FOUND",
    });

    const session = snapshot();
    session.worldState.scheduler = {
      schemaVersion: 1,
      seed: "persisted",
      revision: 0,
      actorCount: 0,
      queue: null,
    };
    await expect(
      runWorldSchedulerBatch(
        session.id,
        { seed: "different", budgetUnits: 8 },
        dependencies(session, new StatefulCommitPort(0, [])),
      ),
    ).resolves.toMatchObject({
      status: "REFUSED",
      code: "SCHEDULER_SEED_MISMATCH",
      spentBudget: 0,
    });

    const corrupt = snapshot();
    const scheduledWorld = ensureWorldScheduler(
      corrupt.worldState,
      "deep-corruption",
    );
    corrupt.worldState = scheduledWorld;
    const queue = scheduledWorld.scheduler.queue;
    expect(queue).not.toBeNull();
    if (!queue) return;
    const pending = [{ node: queue, depth: 0 }];
    let corrupted = false;
    while (pending.length > 0) {
      const { node, depth } = pending.pop() as (typeof pending)[number];
      if (depth >= 2) {
        node.entry.actorId = "missing-world-actor";
        corrupted = true;
        break;
      }
      if (node.left) pending.push({ node: node.left, depth: depth + 1 });
      if (node.right) pending.push({ node: node.right, depth: depth + 1 });
    }
    expect(corrupted).toBe(true);
    await expect(
      runWorldSchedulerBatch(
        corrupt.id,
        { seed: "deep-corruption", budgetUnits: 8 },
        dependencies(corrupt, new StatefulCommitPort(0, [])),
      ),
    ).resolves.toMatchObject({
      status: "REFUSED",
      code: "INVALID_SCHEDULER_STATE",
      spentBudget: 0,
    });
  });
});
