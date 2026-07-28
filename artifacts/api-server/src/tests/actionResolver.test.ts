// tests/actionResolver.test.ts
// Prouve que : une action impossible ne modifie rien
//              une action réussie crée un événement avec worldVersion incrémenté

import { describe, it, expect } from "vitest";
import { resolveAction } from "../engine/actionResolver.js";
import { createInitialWorldState } from "../worldSeed.js";
import type { StructuredAction } from "../domain/actions.js";

function makeAction(overrides: Partial<StructuredAction>): StructuredAction {
  return {
    actionType: "unknown",
    targetName: null,
    details: "",
    rawInput: "",
    ...overrides,
  };
}

describe("actionResolver", () => {
  it("une action impossible ne modifie pas le worldState", () => {
    const state = createInitialWorldState("Yara");
    const before = state.worldVersion;
    const action = makeAction({ actionType: "move", targetName: "lieu_inexistant" });

    const result = resolveAction(state, state.controlledEntityId, action);

    expect(result.success).toBe(false);
    expect(result.newWorldState.worldVersion).toBe(before); // inchangé
    expect(result.newWorldState).toStrictEqual(state);      // aucun changement d'état
  });

  it("une action réussie incrémente worldVersion", () => {
    const state = createInitialWorldState("Yara");
    const action = makeAction({ actionType: "move", targetName: "taverne du loup" });

    const result = resolveAction(state, state.controlledEntityId, action);

    expect(result.success).toBe(true);
    expect(result.newWorldState.worldVersion).toBe(state.worldVersion + 1);
  });

  it("une action réussie crée un événement factuel non-vide", () => {
    const state = createInitialWorldState("Yara");
    const action = makeAction({ actionType: "move", targetName: "taverne du loup" });

    const result = resolveAction(state, state.controlledEntityId, action);

    expect(result.event).toBeDefined();
    expect(result.event.actionType).toBe("move");
    expect(result.event.actorId).toBe(state.controlledEntityId);
    expect(result.event.description).toBeTruthy();
    expect(result.event.worldVersion).toBe(result.newWorldState.worldVersion);
  });

  it("une action impossible crée un événement marqué [BLOQUÉ]", () => {
    const state = createInitialWorldState("Yara");
    const action = makeAction({ actionType: "attack", targetName: "quelqu'un" });

    const result = resolveAction(state, state.controlledEntityId, action);

    expect(result.success).toBe(false);
    expect(result.event.description).toContain("[BLOQUÉ]");
  });

  it("se déplacer met à jour la locationId de l'entité contrôlée", () => {
    const state = createInitialWorldState("Yara");
    const action = makeAction({ actionType: "move", targetName: "taverne du loup" });

    const result = resolveAction(state, state.controlledEntityId, action);

    const entity = result.newWorldState.entities[result.newWorldState.controlledEntityId];
    expect(entity.locationId).toBe("taverne_du_loup");
  });

  it("examiner ne modifie pas le worldState mais retourne une description", () => {
    const state = createInitialWorldState("Yara");
    const action = makeAction({ actionType: "examine", targetName: "fontaine" });

    const result = resolveAction(state, state.controlledEntityId, action);

    // L'examine réussit toujours côté validator
    expect(result.newWorldState.worldVersion).toBe(state.worldVersion + 1);
    expect(result.actionOutcome.observableFacts.length).toBeGreaterThan(0);
  });
});
