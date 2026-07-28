// tests/knowledgeIsolation.test.ts
// Prouve que : le narrateur ne connaît jamais les informations secrètes du monde
//              le personnage contrôlé utilise exactement le même modèle qu'un PNJ

import { describe, it, expect } from "vitest";
import { buildPerceptibleFacts } from "../engine/perceptionEngine.js";
import { createInitialWorldState } from "../worldSeed.js";
import type { ActionOutcome } from "../domain/knowledge.js";
import type { PerceptionResult } from "../engine/perceptionEngine.js";

const dummyOutcome: ActionOutcome = {
  actionType: "examine",
  success: true,
  targetName: null,
  observableFacts: [],
};

function factsFrom(result: PerceptionResult) {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.reason);
  return result.facts;
}

describe("knowledgeIsolation", () => {
  it("les PerceptibleFacts ne contiennent pas les notes secrètes des relations", () => {
    const state = createInitialWorldState("Yara");
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyOutcome),
    );

    // Les notes de relations sont secrètes — elles ne doivent pas apparaître dans les faits
    const factsJson = JSON.stringify(facts);
    expect(factsJson).not.toContain("fournit des légumes");
    expect(factsJson).not.toContain("loge à la taverne");
    expect(factsJson).not.toContain("notes");
  });

  it("les PerceptibleFacts ne contiennent pas les inventaires des PNJ", () => {
    const state = createInitialWorldState("Yara");
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyOutcome),
    );

    // L'inventaire de Tariq (pain_taverne) est privé et ne doit pas fuiter
    const factsJson = JSON.stringify(facts);
    // Les entités présentes n'exposent que name, occupation, mood — pas l'inventaire
    for (const e of facts.presentEntities) {
      expect(Object.keys(e)).not.toContain("inventory");
    }
  });

  it("les PerceptibleFacts n'exposent que le lieu courant, pas le monde entier", () => {
    const state = createInitialWorldState("Yara");
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyOutcome),
    );

    // Le joueur est place_centrale — la forge et la ferme ne doivent pas être visibles
    const factsJson = JSON.stringify(facts);
    expect(factsJson).not.toContain("forge_hamid");
    expect(factsJson).not.toContain("ferme_oumou");
    // Mais le lieu courant doit être présent
    expect(facts.locationName).toContain("Salma");
  });

  it("le personnage contrôlé utilise exactement le même type Entity qu'un PNJ", () => {
    const state = createInitialWorldState("Yara");
    const controlled = state.entities[state.controlledEntityId];
    const npc = state.entities["hamid"];

    // Les deux doivent partager les mêmes clés de base
    const sharedKeys: Array<keyof typeof controlled> = [
      "id",
      "name",
      "occupation",
      "locationId",
      "description",
      "mood",
      "inventory",
    ];
    for (const key of sharedKeys) {
      expect(controlled).toHaveProperty(key);
      expect(npc).toHaveProperty(key);
    }

    // Le personnage contrôlé a des stats, le PNJ n'est pas obligé d'en avoir
    expect(typeof controlled.hunger).toBe("number");
    expect(typeof controlled.fatigue).toBe("number");
    expect(typeof controlled.health).toBe("number");
  });

  it("seules les entités du lieu courant sont visibles", () => {
    const state = createInitialWorldState("Yara");
    // Yara est place_centrale — Hamid est forge_hamid
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyOutcome),
    );

    const entityNames = facts.presentEntities.map((e) => e.name);
    expect(entityNames).not.toContain("Hamid");
    expect(entityNames).not.toContain("Tariq");
  });
});
