// tests/knowledgeIsolation.test.ts
// Prouve que : le narrateur ne connaît jamais les informations secrètes du monde
//              le personnage contrôlé utilise exactement le même modèle qu'un PNJ

import { describe, it, expect } from "vitest";
import { buildPerceptibleFacts } from "../engine/perceptionEngine.js";
import { resolveAction } from "../engine/actionResolver.js";
import { createInitialWorldState } from "../worldSeed.js";
import type { GameEvent } from "../domain/events.js";
import type { StructuredAction } from "../domain/actions.js";
import type { PerceptionResult } from "../engine/perceptionEngine.js";

const dummyEvent: GameEvent = {
  id: "event-perception",
  sessionId: "session",
  worldVersion: 1,
  actionType: "examine",
  actorId: "player",
  locationId: "place_centrale",
  targetId: null,
  description: "inspection",
  consequences: [],
  occurredAt: {
    year: 1,
    season: "automne",
    day: 3,
    hour: 9,
    minute: 0,
  },
  status: "APPLIED",
  requestedTargetName: null,
  observations: [{ audience: "ACTOR", text: "inspection privée" }],
};

function factsFrom(result: PerceptionResult) {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.reason);
  return result.facts;
}

describe("knowledgeIsolation", () => {
  const takeMineral: StructuredAction = {
    actionType: "take",
    targetName: "minerai",
    details: "",
    rawInput: "",
  };

  it("les PerceptibleFacts ne contiennent pas les notes secrètes des relations", () => {
    const state = createInitialWorldState("Yara");
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyEvent),
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
      buildPerceptibleFacts(state, state.controlledEntityId, dummyEvent),
    );

    // L'inventaire de Tariq (pain_taverne) est privé et ne doit pas fuiter
    const factsJson = JSON.stringify(facts);
    expect(factsJson).not.toContain("pain_taverne");
    // Les entités présentes n'exposent que name, occupation, mood — pas l'inventaire
    for (const e of facts.presentEntities) {
      expect(Object.keys(e)).not.toContain("inventory");
    }
  });

  it("les PerceptibleFacts n'exposent que le lieu courant, pas le monde entier", () => {
    const state = createInitialWorldState("Yara");
    const facts = factsFrom(
      buildPerceptibleFacts(state, state.controlledEntityId, dummyEvent),
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
      buildPerceptibleFacts(state, state.controlledEntityId, dummyEvent),
    );

    const entityNames = facts.presentEntities.map((e) => e.name);
    expect(entityNames).not.toContain("Hamid");
    expect(entityNames).not.toContain("Tariq");
  });

  it("ne transmet pas les conséquences privées de Hamid à Tariq dans un autre lieu", () => {
    const state = createInitialWorldState("Yara");
    const resolved = resolveAction(state, "hamid", takeMineral, {
      createEventId: () => "event-hamid",
    });
    expect(resolved.event.observations.length).toBeGreaterThan(0);
    const facts = factsFrom(
      buildPerceptibleFacts(resolved.newWorldState, "tariq", resolved.event),
    );
    expect(facts.actionOutcome).toBeNull();
    expect(JSON.stringify(facts)).not.toContain(
      "minerai de fer est maintenant dans vos affaires",
    );
  });

  it("projette les faits de lieu aux témoins présents, mais les faits privés seulement à l'acteur", () => {
    const state = createInitialWorldState("Yara");
    state.entities.oumou = {
      ...state.entities.oumou,
      locationId: "forge_hamid",
    };
    state.locations.forge_hamid = {
      ...state.locations.forge_hamid,
      presentEntities: [
        ...state.locations.forge_hamid.presentEntities,
        "oumou",
      ],
    };
    const resolved = resolveAction(state, "hamid", takeMineral, {
      createEventId: () => "event-hamid",
    });
    const actorFacts = factsFrom(
      buildPerceptibleFacts(resolved.newWorldState, "hamid", resolved.event),
    );
    const witnessFacts = factsFrom(
      buildPerceptibleFacts(resolved.newWorldState, "amir", resolved.event),
    );
    const secondWitnessFacts = factsFrom(
      buildPerceptibleFacts(resolved.newWorldState, "oumou", resolved.event),
    );
    expect(actorFacts.actionOutcome?.observableFacts).toContain(
      "minerai de fer est maintenant dans vos affaires.",
    );
    expect(actorFacts.actionOutcome?.targetName).toBe("minerai");
    expect(witnessFacts.actionOutcome?.observableFacts).toContain(
      "Hamid prend minerai de fer.",
    );
    expect(witnessFacts.actionOutcome?.observableFacts.join(" ")).not.toContain(
      "vos affaires",
    );
    expect(witnessFacts.actionOutcome?.targetName).toBeNull();
    expect(secondWitnessFacts.actionOutcome).toEqual(
      witnessFacts.actionOutcome,
    );
  });

  it("projette un fait public vers un observateur autorisé quel que soit son lieu", () => {
    const state = createInitialWorldState("Yara");
    const publicEvent: GameEvent = {
      ...dummyEvent,
      actorId: "hamid",
      locationId: "forge_hamid",
      observations: [
        { audience: "PUBLIC", text: "La cloche du village sonne." },
      ],
    };
    const facts = factsFrom(buildPerceptibleFacts(state, "tariq", publicEvent));
    expect(facts.actionOutcome?.observableFacts).toEqual([
      "La cloche du village sonne.",
    ]);
  });
});

