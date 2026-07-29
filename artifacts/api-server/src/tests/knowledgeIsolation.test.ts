// tests/knowledgeIsolation.test.ts
// Prouve que : le narrateur ne connaÃ®t jamais les informations secrÃ¨tes du monde
//              le personnage contrÃ´lÃ© utilise exactement le mÃªme modÃ¨le qu'un PNJ

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
  it("les PerceptibleFacts ne contiennent pas les notes secrÃ¨tes des relations", () => {
    const state = createInitialWorldState("Yara");
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyOutcome),
    );

    // Les notes de relations sont secrÃ¨tes â€” elles ne doivent pas apparaÃ®tre dans les faits
    const factsJson = JSON.stringify(facts);
    expect(factsJson).not.toContain("fournit des lÃ©gumes");
    expect(factsJson).not.toContain("loge Ã  la taverne");
    expect(factsJson).not.toContain("notes");
  });

  it("les PerceptibleFacts ne contiennent pas les inventaires des PNJ", () => {
    const state = createInitialWorldState("Yara");
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyOutcome),
    );

    // L'inventaire de Tariq (pain_taverne) est privÃ© et ne doit pas fuiter
    const factsJson = JSON.stringify(facts);
    expect(factsJson).not.toContain("pain_taverne");
    // Les entitÃ©s prÃ©sentes n'exposent que name, occupation, mood â€” pas l'inventaire
    for (const e of facts.presentEntities) {
      expect(Object.keys(e)).not.toContain("inventory");
    }
  });

  it("les PerceptibleFacts n'exposent que le lieu courant, pas le monde entier", () => {
    const state = createInitialWorldState("Yara");
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyOutcome),
    );

    // Le joueur est place_centrale â€” la forge et la ferme ne doivent pas Ãªtre visibles
    const factsJson = JSON.stringify(facts);
    expect(factsJson).not.toContain("forge_hamid");
    expect(factsJson).not.toContain("ferme_oumou");
    // Mais le lieu courant doit Ãªtre prÃ©sent
    expect(facts.locationName).toContain("Salma");
  });

  it("le personnage contrÃ´lÃ© utilise exactement le mÃªme type Entity qu'un PNJ", () => {
    const state = createInitialWorldState("Yara");
    const controlled = state.entities[state.controlledEntityId];
    const npc = state.entities["hamid"];

    // Les deux doivent partager les mÃªmes clÃ©s de base
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

    // Le personnage contrÃ´lÃ© a des stats, le PNJ n'est pas obligÃ© d'en avoir
    expect(typeof controlled.hunger).toBe("number");
    expect(typeof controlled.fatigue).toBe("number");
    expect(typeof controlled.health).toBe("number");
  });

  it("seules les entitÃ©s du lieu courant sont visibles", () => {
    const state = createInitialWorldState("Yara");
    // Yara est place_centrale â€” Hamid est forge_hamid
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyOutcome),
    );

    const entityNames = facts.presentEntities.map((e) => e.name);
    expect(entityNames).not.toContain("Hamid");
    expect(entityNames).not.toContain("Tariq");
  });
});
