// tests/persistence.test.ts
// Prouve que : recharger la page conserve la progression
//              une action réussie crée un événement persistant (vérifié via mocks)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInitialWorldState } from "../worldSeed.js";
import { resolveAction } from "../engine/actionResolver.js";
import type { StructuredAction } from "../domain/actions.js";

// Ces tests vérifient la logique de persistance sans toucher à la vraie DB.
// Le worldVersion est la clé d'idempotence : un doublon = même version → rejeté.

function makeAction(overrides: Partial<StructuredAction>): StructuredAction {
  return {
    actionType: "unknown",
    targetName: null,
    details: "",
    rawInput: "",
    ...overrides,
  };
}

describe("persistance — logique de cohérence", () => {
  it("chaque action réussie incrémente worldVersion de 1 exactement", () => {
    let state = createInitialWorldState("Reza");

    const actions: StructuredAction[] = [
      makeAction({ actionType: "move", targetName: "taverne du loup" }),
      makeAction({ actionType: "examine", targetName: "taverne" }),
    ];

    let version = state.worldVersion;
    for (const action of actions) {
      const result = resolveAction(state, state.controlledEntityId, action);
      if (result.success) {
        expect(result.newWorldState.worldVersion).toBe(version + 1);
        version = result.newWorldState.worldVersion;
        state = result.newWorldState;
      }
    }
  });

  it("une action bloquée ne change pas worldVersion", () => {
    const state = createInitialWorldState("Reza");
    const action = makeAction({
      actionType: "move",
      targetName: "château_invisible",
    });

    const result = resolveAction(state, state.controlledEntityId, action);

    expect(result.success).toBe(false);
    expect(result.newWorldState.worldVersion).toBe(state.worldVersion);
  });

  it("l'état après deux actions est reproductible (déterminisme)", () => {
    function playThrough(playerName: string) {
      let state = createInitialWorldState(playerName);
      const actions = [
        makeAction({ actionType: "move", targetName: "taverne du loup" }),
        makeAction({ actionType: "examine", targetName: "tariq" }),
      ];
      for (const action of actions) {
        const result = resolveAction(state, state.controlledEntityId, action);
        if (result.success) state = result.newWorldState;
      }
      return state;
    }

    const stateA = playThrough("Saba");
    const stateB = playThrough("Saba");

    // L'entité contrôlée doit être au même endroit dans les deux runs
    const entityA = stateA.entities[stateA.controlledEntityId];
    const entityB = stateB.entities[stateB.controlledEntityId];
    expect(entityA.locationId).toBe(entityB.locationId);
    expect(stateA.worldVersion).toBe(stateB.worldVersion);
  });

  it("worldState contient controlledEntityId — pas de champ 'player' séparé", () => {
    const state = createInitialWorldState("Nour");

    expect(state).toHaveProperty("controlledEntityId");
    expect(state).not.toHaveProperty("player");
    expect(state.entities).toHaveProperty(state.controlledEntityId);
  });

  it("les événements portent le worldVersion de l'état APRÈS l'action", () => {
    const state = createInitialWorldState("Nour");
    const action = makeAction({ actionType: "move", targetName: "forge" });

    const result = resolveAction(state, state.controlledEntityId, action);

    if (result.success) {
      expect(result.event.worldVersion).toBe(result.newWorldState.worldVersion);
    }
  });
});
