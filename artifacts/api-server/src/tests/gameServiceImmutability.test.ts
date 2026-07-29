import { describe, expect, it, vi } from "vitest";
import type { GameEvent } from "../domain/events.js";
import type { NarrativeEntry } from "../persistence/types.js";

vi.mock("@workspace/db", () => ({
  db: {},
  kitabaSessionsTable: {},
  kitabaEventsTable: {},
  kitabaSavesTable: {},
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));

const { appendNarrativeEntry, bindEventToSession } =
  await import("../services/gameService.js");

describe("immutabilité du service", () => {
  it("associe la session à une copie de l'événement moteur", () => {
    const event: GameEvent = {
      id: "event-1",
      sessionId: "",
      worldVersion: 0,
      actionType: "give",
      actorId: "hamid",
      locationId: "forge_hamid",
      targetId: null,
      description: "[BLOQUÉ] [ACTION_NOT_IMPLEMENTED]",
      consequences: [],
      occurredAt: {
        year: 1,
        season: "printemps",
        day: 1,
        hour: 9,
        minute: 0,
      },
      status: "REJECTED",
      requestedTargetName: "marteau",
      observations: [{ audience: "ACTOR", text: "Action non implémentée." }],
    };
    Object.freeze(event);
    const persisted = bindEventToSession(event, "session-1");
    expect(persisted).not.toBe(event);
    expect(persisted.sessionId).toBe("session-1");
    expect(event.sessionId).toBe("");
  });

  it("ajoute une narration sans modifier l'historique chargé", () => {
    const previous: NarrativeEntry = {
      id: "entry-1",
      type: "system",
      text: "Début",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const history = Object.freeze([previous]);
    const next: NarrativeEntry = {
      id: "entry-2",
      type: "narrator",
      text: "Tentative refusée",
      timestamp: "2026-01-01T00:01:00.000Z",
    };
    const updated = appendNarrativeEntry(history, next);
    expect(updated).toEqual([previous, next]);
    expect(updated).not.toBe(history);
    expect(history).toEqual([previous]);
  });
});
