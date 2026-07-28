import { describe, expect, it } from "vitest";
import type { StructuredAction } from "../domain/actions.js";
import { resolveAction } from "../engine/actionResolver.js";
import { buildPerceptibleFacts } from "../engine/perceptionEngine.js";
import { createInitialWorldState } from "../worldSeed.js";

function action(actionType: StructuredAction["actionType"], targetName: string | null): StructuredAction {
  return { actionType, targetName, details: "", rawInput: "" };
}

describe("moteur multi-acteur", () => {
  it("préserve les actions du personnage contrôlé", () => {
    const state = createInitialWorldState("Yara");
    expect(resolveAction(state, "player", action("move", "taverne du loup")).success).toBe(true);
  });

  it("permet à un PNJ de se déplacer", () => {
    const state = createInitialWorldState("Yara");
    const result = resolveAction(state, "hamid", action("move", "place centrale"));
    expect(result.success).toBe(true);
    expect(result.newWorldState.entities.hamid.locationId).toBe("place_centrale");
    expect(result.newWorldState.entities.player.locationId).toBe("place_centrale");
  });

  it("permet à un PNJ de prendre un objet", () => {
    const state = createInitialWorldState("Yara");
    const result = resolveAction(state, "hamid", action("take", "minerai"));
    expect(result.success).toBe(true);
    expect(result.newWorldState.entities.hamid.inventory).toContain("minerai_fer");
    expect(result.newWorldState.entities.player.inventory).not.toContain("minerai_fer");
  });

  it("permet à un PNJ de manger un objet de son inventaire", () => {
    const state = createInitialWorldState("Yara");
    state.entities.tariq.hunger = 40;
    const result = resolveAction(state, "tariq", action("eat", "pain"));
    expect(result.success).toBe(true);
    expect(result.newWorldState.entities.tariq.inventory).not.toContain("pain_taverne");
    expect(result.newWorldState.entities.tariq.hunger).toBeGreaterThan(40);
    expect(result.newWorldState.entities.player.inventory).toEqual([]);
  });

  it("applique le temps uniquement à l'acteur transmis", () => {
    const state = createInitialWorldState("Yara");
    state.entities.hamid.hunger = 50;
    state.entities.hamid.fatigue = 50;
    const playerBefore = { ...state.entities.player };
    const result = resolveAction(state, "hamid", action("examine", "forge"));
    expect(result.newWorldState.entities.hamid.hunger).toBeLessThan(50);
    expect(result.newWorldState.entities.hamid.fatigue).toBeLessThan(50);
    expect(result.newWorldState.entities.player).toEqual(playerBefore);
  });

  it("exclut l'acteur courant de la recherche de cible", () => {
    const state = createInitialWorldState("Yara");
    const self = resolveAction(state, "tariq", action("speak", "Tariq"));
    const other = resolveAction(state, "tariq", action("speak", "Leila"));
    expect(self.success).toBe(false);
    expect(other.success).toBe(true);
  });

  it("construit la perception pour l'observateur explicite", () => {
    const state = createInitialWorldState("Yara");
    const outcome = { actionType: "examine" as const, success: true, targetName: null, observableFacts: [] };
    const playerFacts = buildPerceptibleFacts(state, "player", outcome);
    const tariqFacts = buildPerceptibleFacts(state, "tariq", outcome);
    expect(playerFacts.locationName).not.toBe(tariqFacts.locationName);
    expect(tariqFacts.inventoryObjects.map((object) => object.name)).toContain("miche de pain");
  });

  it("retourne un refus explicite pour un acteur inconnu", () => {
    const state = createInitialWorldState("Yara");
    const result = resolveAction(state, "absent", action("move", "forge"));
    expect(result.success).toBe(false);
    expect(result.newWorldState).toBe(state);
    expect(result.event.actorId).toBe("absent");
    expect(result.event.description).toContain("Acteur introuvable");
  });

  it("refuse explicitement un acteur sans lieu valide", () => {
    const state = createInitialWorldState("Yara");
    state.entities.hamid.locationId = "inconnu";
    const result = resolveAction(state, "hamid", action("move", "place centrale"));
    expect(result.success).toBe(false);
    expect(result.event.description).toContain("lieu valide");
  });

  it("est indépendant de controlledEntityId pour un actorId explicite", () => {
    const first = createInitialWorldState("Yara");
    const second = structuredClone(first);
    second.controlledEntityId = "oumou";
    const firstResult = resolveAction(first, "hamid", action("take", "minerai"));
    const secondResult = resolveAction(second, "hamid", action("take", "minerai"));
    expect(secondResult.success).toBe(firstResult.success);
    expect(secondResult.newWorldState).toEqual({
      ...firstResult.newWorldState,
      controlledEntityId: "oumou",
    });
    expect(secondResult.actionOutcome).toEqual(firstResult.actionOutcome);
  });
});
