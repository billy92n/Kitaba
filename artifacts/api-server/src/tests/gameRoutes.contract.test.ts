import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ListSavesResponse,
  NewGameResponse,
  SaveGameResponse,
  SubmitActionResponse,
} from "@workspace/api-zod";
import { WorldVersionConflictError } from "../services/actionCommit.js";

const service = vi.hoisted(() => ({
  startNewGame: vi.fn(),
  processPlayerAction: vi.fn(),
  saveGame: vi.fn(),
  loadSavedGame: vi.fn(),
  getManualSaves: vi.fn(),
}));

vi.mock("../services/gameService.js", () => service);

const characterStatus = {
  name: "Yara",
  locationName: "Place centrale",
  worldDate: "Jour 1, 08:00",
  hunger: 100,
  fatigue: 100,
  health: 100,
};

const narrativeEntry = {
  id: "entry-1",
  type: "narrator" as const,
  text: "Le passage est bloqué.",
  timestamp: "2026-07-28T20:00:00.000Z",
};

let server: Server;
let baseUrl: string;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

beforeAll(async () => {
  const { default: app } = await import("../app.js");
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) throw error;
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contrats HTTP du jeu", () => {
  it("retourne une session conforme lors de la création", async () => {
    service.startNewGame.mockResolvedValue({
      sessionId: "session-1",
      characterStatus,
      narrativeHistory: [narrativeEntry],
    });

    const response = await request("/api/game/new", {
      method: "POST",
      body: JSON.stringify({ playerName: "Yara" }),
    });

    expect(response.status).toBe(200);
    expect(NewGameResponse.parse(response.body)).toEqual(response.body);
  });

  it("retourne worldVersion pour une action réussie", async () => {
    service.processPlayerAction.mockResolvedValue({
      narrativeEntry,
      characterStatus,
      worldVersion: 4,
    });

    const response = await request("/api/game/action", {
      method: "POST",
      body: JSON.stringify({ sessionId: "session-1", playerInput: "avancer" }),
    });

    expect(response.status).toBe(200);
    expect(SubmitActionResponse.parse(response.body)).toEqual(response.body);
    expect(
      (response.body as { worldVersion: unknown }).worldVersion,
    ).toBeTypeOf("number");
  });

  it("conserve le même contrat pour une action refusée", async () => {
    service.processPlayerAction.mockResolvedValue({
      narrativeEntry,
      characterStatus,
      worldVersion: 3,
    });

    const response = await request("/api/game/action", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "session-1",
        playerInput: "traverser le mur",
      }),
    });

    expect(response.status).toBe(200);
    expect(SubmitActionResponse.safeParse(response.body).success).toBe(true);
    expect(
      (response.body as { narrativeEntry: { text: string } }).narrativeEntry
        .text,
    ).toContain("bloqué");
  });

  it("retourne un conflit métier explicite si la version du monde a changé", async () => {
    service.processPlayerAction.mockRejectedValue(
      new WorldVersionConflictError("session-1", 3),
    );

    const response = await request("/api/game/action", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "session-1",
        playerInput: "avancer",
      }),
    });

    expect(response).toEqual({
      status: 409,
      body: { error: "WORLD_VERSION_CONFLICT" },
    });
  });

  it("retourne les métadonnées stables d'une sauvegarde manuelle", async () => {
    service.saveGame.mockResolvedValue({
      saveId: "save-1",
      saveName: "Avant le marché",
      savedAt: "2026-07-28T20:30:00.000Z",
    });

    const response = await request("/api/game/save", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "session-1",
        saveName: "Avant le marché",
      }),
    });

    expect(response.status).toBe(200);
    expect(SaveGameResponse.parse(response.body)).toEqual(response.body);
    expect(response.body).not.toHaveProperty("message");
  });

  it("retourne une liste contenant worldVersion", async () => {
    service.getManualSaves.mockResolvedValue([
      {
        saveId: "save-1",
        saveName: "Avant le marché",
        characterName: "Yara",
        savedAt: "2026-07-28T20:30:00.000Z",
        worldVersion: 7,
      },
    ]);

    const response = await request("/api/game/saves");

    expect(response.status).toBe(200);
    expect(ListSavesResponse.parse(response.body)).toEqual(response.body);
    expect(
      (response.body as { saves: Array<{ worldVersion: unknown }> }).saves[0]
        ?.worldVersion,
    ).toBeTypeOf("number");
  });

  it("rejette un corps invalide avec l'erreur HTTP commune", async () => {
    const response = await request("/api/game/action", {
      method: "POST",
      body: JSON.stringify({ sessionId: "session-1" }),
    });

    expect(response).toEqual({
      status: 400,
      body: { error: "Corps de requête invalide." },
    });
    expect(service.processPlayerAction).not.toHaveBeenCalled();
  });
});
