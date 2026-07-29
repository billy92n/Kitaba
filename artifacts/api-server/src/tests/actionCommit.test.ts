import { describe, expect, it } from "vitest";
import type { StructuredAction } from "../domain/actions.js";
import { resolveAction } from "../engine/actionResolver.js";
import {
  commitAction,
  WorldVersionConflictError,
  type ActionCommit,
  type ActionCommitPort,
  type ActionCommitResult,
} from "../services/actionCommit.js";
import { createInitialWorldState } from "../worldSeed.js";

class InMemoryActionCommitPort implements ActionCommitPort {
  worldVersion = 0;
  narrativeHistory: ActionCommit["narrativeHistory"] = [];
  committedEvents: string[] = [];
  autoSaves: string[] = [];
  committedStateId: string | null = null;

  async tryCommit(actionCommit: ActionCommit): Promise<ActionCommitResult> {
    if (
      actionCommit.expectedWorldVersion !== this.worldVersion ||
      JSON.stringify(actionCommit.expectedNarrativeHistory) !==
        JSON.stringify(this.narrativeHistory)
    ) {
      return "CONFLICT";
    }
    this.worldVersion = actionCommit.newWorldState.worldVersion;
    this.narrativeHistory = actionCommit.narrativeHistory;
    this.committedEvents.push(actionCommit.event.id);
    this.autoSaves.push(actionCommit.autoSaveId);
    this.committedStateId = actionCommit.event.id;
    return "COMMITTED";
  }
}

function action(actionType: StructuredAction["actionType"]): StructuredAction {
  return { actionType, targetName: null, details: "", rawInput: "" };
}

describe("contrôle de concurrence optimiste", () => {
  it("rejette le second commit chargé à la même version sans événement fantôme", async () => {
    const initial = createInitialWorldState("Yara");
    const first = resolveAction(initial, "hamid", action("sleep"), {
      createEventId: () => "event-a",
    });
    const second = resolveAction(initial, "tariq", action("sleep"), {
      createEventId: () => "event-b",
    });
    const port = new InMemoryActionCommitPort();

    const commits = await Promise.allSettled([
      commitAction(
        {
          sessionId: "session",
          expectedWorldVersion: 0,
          expectedNarrativeHistory: [],
          newWorldState: first.newWorldState,
          narrativeHistory: [],
          event: first.event,
          autoSaveId: "save-a",
        },
        port,
      ),
      commitAction(
        {
          sessionId: "session",
          expectedWorldVersion: 0,
          expectedNarrativeHistory: [],
          newWorldState: second.newWorldState,
          narrativeHistory: [],
          event: second.event,
          autoSaveId: "save-b",
        },
        port,
      ),
    ]);

    expect(commits[0]).toMatchObject({ status: "fulfilled" });
    expect(commits[1]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        name: "WorldVersionConflictError",
        code: "WORLD_VERSION_CONFLICT",
      }),
    });
    expect(
      commits[1].status === "rejected" && commits[1].reason,
    ).toBeInstanceOf(WorldVersionConflictError);
    expect(port).toMatchObject({
      worldVersion: 1,
      committedEvents: ["event-a"],
      autoSaves: ["save-a"],
      committedStateId: "event-a",
    });
  });

  it("sérialise aussi deux refus concurrents qui conservent worldVersion", async () => {
    const initial = createInitialWorldState("Yara");
    const first = resolveAction(initial, "hamid", action("give"), {
      createEventId: () => "refusal-a",
    });
    const second = resolveAction(initial, "tariq", action("use"), {
      createEventId: () => "refusal-b",
    });
    const port = new InMemoryActionCommitPort();
    const firstEntry = {
      id: "entry-a",
      type: "narrator" as const,
      text: "Refus A",
      timestamp: "2026-07-29T12:00:00.000Z",
    };
    const secondEntry = {
      id: "entry-b",
      type: "narrator" as const,
      text: "Refus B",
      timestamp: "2026-07-29T12:00:00.000Z",
    };

    const commits = await Promise.allSettled([
      commitAction(
        {
          sessionId: "session",
          expectedWorldVersion: 0,
          expectedNarrativeHistory: [],
          newWorldState: first.newWorldState,
          narrativeHistory: [firstEntry],
          event: first.event,
          autoSaveId: "refusal-save-a",
        },
        port,
      ),
      commitAction(
        {
          sessionId: "session",
          expectedWorldVersion: 0,
          expectedNarrativeHistory: [],
          newWorldState: second.newWorldState,
          narrativeHistory: [secondEntry],
          event: second.event,
          autoSaveId: "refusal-save-b",
        },
        port,
      ),
    ]);

    expect(commits.map(({ status }) => status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(port).toMatchObject({
      worldVersion: 0,
      narrativeHistory: [firstEntry],
      committedEvents: ["refusal-a"],
      autoSaves: ["refusal-save-a"],
    });
  });
});
