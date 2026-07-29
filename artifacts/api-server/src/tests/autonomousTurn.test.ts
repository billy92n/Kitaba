import { describe, expect, it } from "vitest";
import type {
  ActionCommit,
  ActionCommitPort,
} from "../services/actionCommit.js";
import {
  prepareAutonomousTurn,
  runAutonomousTurn,
  type AutonomousSessionSnapshot,
  type AutonomousTurnDependencies,
} from "../services/autonomousTurn.js";
import { createInitialWorldState } from "../worldSeed.js";

class InMemoryCommitPort implements ActionCommitPort {
  worldVersion: number;
  narrativeHistory: ActionCommit["narrativeHistory"];
  commits: ActionCommit[] = [];

  constructor(snapshot: AutonomousSessionSnapshot) {
    this.worldVersion = snapshot.worldVersion;
    this.narrativeHistory = snapshot.narrativeHistory;
  }

  async tryCommit(
    actionCommit: ActionCommit,
  ): Promise<"COMMITTED" | "CONFLICT"> {
    if (
      actionCommit.expectedWorldVersion !== this.worldVersion ||
      JSON.stringify(actionCommit.expectedNarrativeHistory) !==
        JSON.stringify(this.narrativeHistory)
    ) {
      return "CONFLICT";
    }
    this.worldVersion = actionCommit.newWorldState.worldVersion;
    this.narrativeHistory = actionCommit.narrativeHistory;
    this.commits.push(actionCommit);
    return "COMMITTED";
  }
}

function snapshot(): AutonomousSessionSnapshot {
  const worldState = createInitialWorldState("Yara");
  return {
    id: "session",
    controlledEntityId: worldState.controlledEntityId,
    worldVersion: worldState.worldVersion,
    worldState,
    narrativeHistory: [],
  };
}

function dependencies(
  session: AutonomousSessionSnapshot,
  port: ActionCommitPort,
  suffix: string,
): AutonomousTurnDependencies {
  return {
    loadSession: async () => session,
    commitPort: port,
    createEventId: () => `event-${suffix}`,
    createNarrativeEntryId: () => `narrative-${suffix}`,
    createAutoSaveId: () => `save-${suffix}`,
    nowIso: () => "2026-07-29T12:00:00.000Z",
    narrate: (facts) =>
      `Observed ${facts.actionOutcome?.actionType ?? "nothing"}.`,
  };
}

describe("autonomous turn service", () => {
  it("lets a remote NPC advance and persist the world without player input", async () => {
    const session = snapshot();
    const before = structuredClone(session.worldState);
    const port = new InMemoryCommitPort(session);

    const result = await runAutonomousTurn(
      session.id,
      "tariq",
      { seed: "npc-turn" },
      dependencies(session, port, "npc"),
    );

    expect(result.status).toBe("COMMITTED");
    if (result.status !== "COMMITTED") return;
    expect(result.event.actorId).toBe("tariq");
    expect(result.worldState.worldVersion).toBe(1);
    expect(result.worldState.time).not.toEqual(before.time);
    expect(result.observerFacts).toBeNull();
    expect(result.observerNarration).toBeNull();
    expect(port.commits).toHaveLength(1);
    expect(port.commits[0]).toMatchObject({
      autoSaveId: "save-npc",
      event: { id: "event-npc", actorId: "tariq" },
    });
    expect(session.worldState).toEqual(before);
  });

  it("reveals a NPC event to the observer only when the normal resolver allows it", async () => {
    const session = snapshot();
    session.worldState.entities.player = {
      ...session.worldState.entities.player,
      locationId: "taverne_du_loup",
    };
    session.worldState.locations.place_centrale.presentEntities = [];
    session.worldState.locations.taverne_du_loup.presentEntities.push("player");
    session.worldState.entities.tariq = {
      ...session.worldState.entities.tariq,
      hunger: 100,
      fatigue: 100,
      autonomyProfile: {
        traits: {
          prudence: 0,
          sociability: 100,
          ambition: 0,
          curiosity: 0,
          discipline: 0,
        },
        persistentGoal: { kind: "SOCIALIZE", strength: 100 },
      },
    };
    const port = new InMemoryCommitPort(session);

    const result = await runAutonomousTurn(
      session.id,
      "tariq",
      { seed: "witness" },
      dependencies(session, port, "witness"),
    );

    expect(result.status).toBe("COMMITTED");
    if (result.status !== "COMMITTED") return;
    expect(result.observerFacts).not.toBeNull();
    expect(result.observerFacts?.actionOutcome?.targetName).toBeNull();
    expect(result.observerNarration).not.toBeNull();
    expect(port.commits[0].narrativeHistory).toHaveLength(1);
  });

  it("returns an explicit OCC conflict with no phantom event or autosave", async () => {
    const session = snapshot();
    const port = new InMemoryCommitPort(session);
    const results = await Promise.all([
      runAutonomousTurn(
        session.id,
        "hamid",
        { seed: "same-revision" },
        dependencies(session, port, "first"),
      ),
      runAutonomousTurn(
        session.id,
        "tariq",
        { seed: "same-revision" },
        dependencies(session, port, "second"),
      ),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "COMMITTED",
      "CONFLICT",
    ]);
    expect(port.commits).toHaveLength(1);
    expect(port.commits[0].event.id).toBe("event-first");
    expect(port.commits[0].autoSaveId).toBe("save-first");
  });

  it("is completely reproducible when all dependencies are injected", async () => {
    const firstSession = snapshot();
    firstSession.worldState.entities.player = {
      ...firstSession.worldState.entities.player,
      locationId: "taverne_du_loup",
    };
    firstSession.worldState.locations.place_centrale.presentEntities = [];
    firstSession.worldState.locations.taverne_du_loup.presentEntities.push(
      "player",
    );
    const secondSession = structuredClone(firstSession);
    const first = await runAutonomousTurn(
      firstSession.id,
      "hamid",
      { seed: "replay" },
      dependencies(
        firstSession,
        new InMemoryCommitPort(firstSession),
        "replay",
      ),
    );
    const second = await runAutonomousTurn(
      secondSession.id,
      "hamid",
      { seed: "replay" },
      dependencies(
        secondSession,
        new InMemoryCommitPort(secondSession),
        "replay",
      ),
    );

    expect(second).toEqual(first);
  });

  it("persists bounded commitment through the normal action resolver", () => {
    const session = snapshot();
    const prepared = prepareAutonomousTurn(
      session.worldState,
      "tariq",
      { seed: "commitment", commitmentTurns: 2 },
      () => "event",
    );
    expect(prepared.success).toBe(true);
    if (!prepared.success) return;
    expect(
      prepared.prepared.resolution.newWorldState.entities.tariq
        .autonomyDecisionState,
    ).toEqual({
      intentKey: prepared.prepared.decisionTrace.selectedCandidateKey,
      remainingCommitmentTurns: 2,
    });
  });

  it("does not persist commitment when normal validation rejects the intention", () => {
    const session = snapshot();
    session.worldState.entities.hamid.locationId = "missing";
    const before = structuredClone(session.worldState);
    const prepared = prepareAutonomousTurn(
      session.worldState,
      "hamid",
      { seed: "invalid" },
      () => "event",
    );
    expect(prepared).toMatchObject({
      success: false,
      code: "ACTOR_LOCATION_NOT_FOUND",
    });
    expect(session.worldState).toEqual(before);
  });

  it("reports missing sessions and actors without committing", async () => {
    const session = snapshot();
    const port = new InMemoryCommitPort(session);
    const deps = dependencies(session, port, "none");
    expect(
      await runAutonomousTurn(
        "missing",
        "hamid",
        { seed: 1 },
        {
          ...deps,
          loadSession: async () => null,
        },
      ),
    ).toEqual({ status: "NOT_FOUND", code: "SESSION_NOT_FOUND" });
    expect(
      await runAutonomousTurn(session.id, "missing", { seed: 1 }, deps),
    ).toMatchObject({ status: "REFUSED", code: "ACTOR_NOT_FOUND" });
    expect(port.commits).toHaveLength(0);
  });
});
