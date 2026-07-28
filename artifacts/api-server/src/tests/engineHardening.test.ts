import { describe, expect, it } from "vitest";
import type { StructuredAction } from "../domain/actions.js";
import type { WorldState } from "../domain/world.js";
import {
  resolveAction,
  type ResolutionDependencies,
} from "../engine/actionResolver.js";
import { buildPerceptibleFacts } from "../engine/perceptionEngine.js";
import {
  advanceTime,
  applyPassiveDecay,
  applyTimeAndDecay,
  getTimeCost,
} from "../engine/timeEngine.js";
import { createInitialWorldState } from "../worldSeed.js";

const deterministic: ResolutionDependencies = {
  createEventId: () => "event-fixed",
};

function action(
  actionType: StructuredAction["actionType"],
  targetName: string | null = null,
): StructuredAction {
  return { actionType, targetName, details: "", rawInput: "" };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

describe("contrats du moteur", () => {
  it("est entièrement déterministe lorsque les dépendances sont identiques", () => {
    const first = createInitialWorldState("Yara");
    const second = createInitialWorldState("Yara");
    expect(
      resolveAction(first, "hamid", action("take", "minerai"), deterministic),
    ).toEqual(
      resolveAction(second, "hamid", action("take", "minerai"), deterministic),
    );
  });

  it("code explicitement acteur et lieu absents sans modifier l'état", () => {
    const state = createInitialWorldState("Yara");
    const unknown = resolveAction(
      state,
      "absent",
      action("sleep"),
      deterministic,
    );
    expect(unknown).toMatchObject({
      success: false,
      failureCode: "ACTOR_NOT_FOUND",
      newWorldState: state,
      event: {
        id: "event-fixed",
        locationId: "unresolved",
        worldVersion: 0,
      },
    });

    const inconsistent = createInitialWorldState("Yara");
    inconsistent.entities.hamid = {
      ...inconsistent.entities.hamid,
      locationId: "missing",
    };
    const invalidLocation = resolveAction(
      inconsistent,
      "hamid",
      action("sleep"),
      deterministic,
    );
    expect(invalidLocation).toMatchObject({
      success: false,
      failureCode: "ACTOR_LOCATION_NOT_FOUND",
      newWorldState: inconsistent,
      event: { locationId: "missing", worldVersion: 0 },
    });
  });

  it("définit l'événement move au lieu et à l'heure de départ", () => {
    const state = createInitialWorldState("Yara");
    const result = resolveAction(
      state,
      "hamid",
      action("move", "place centrale"),
      deterministic,
    );
    expect(result.event).toMatchObject({
      actorId: "hamid",
      locationId: "forge_hamid",
      targetId: "place_centrale",
      worldVersion: 1,
      occurredAt: state.time,
    });
    expect(result.event.occurredAt).toBe(state.time);
  });

  it.each([
    ["move", "place centrale"],
    ["speak", "Amir"],
    ["take", "minerai"],
    ["examine", "forge"],
    ["sleep", null],
    ["give", "Amir"],
    ["use", "marteau"],
  ] satisfies Array<[StructuredAction["actionType"], string | null]>)(
    "ne mute jamais l'entrée pour l'action réussie %s",
    (actionType, targetName) => {
      const mutable = createInitialWorldState("Yara");
      const snapshot = structuredClone(mutable);
      const frozen = deepFreeze(mutable);
      const result = resolveAction(
        frozen,
        "hamid",
        action(actionType, targetName),
        deterministic,
      );
      expect(result.success).toBe(true);
      expect(frozen).toEqual(snapshot);
      expect(result.newWorldState).not.toBe(frozen);
      expect(result.newWorldState.worldVersion).toBe(1);
    },
  );

  it("ne mute jamais l'entrée pour eat", () => {
    const mutable = createInitialWorldState("Yara");
    mutable.entities.tariq = { ...mutable.entities.tariq, hunger: 40 };
    const snapshot = structuredClone(mutable);
    const result = resolveAction(
      deepFreeze(mutable),
      "tariq",
      action("eat", "pain"),
      deterministic,
    );
    expect(result.success).toBe(true);
    expect(mutable).toEqual(snapshot);
  });

  it.each([
    ["attack", "Amir"],
    ["unknown", null],
    ["move", "lieu absent"],
    ["speak", "personne absente"],
    ["take", "objet absent"],
    ["eat", "objet absent"],
    ["give", null],
  ] satisfies Array<[StructuredAction["actionType"], string | null]>)(
    "la branche refusée %s conserve état, version et temps",
    (actionType, targetName) => {
      const state = deepFreeze(createInitialWorldState("Yara"));
      const result = resolveAction(
        state,
        "hamid",
        action(actionType, targetName),
        deterministic,
      );
      expect(result.success).toBe(false);
      expect(result.newWorldState).toBe(state);
      expect(result.newWorldState.worldVersion).toBe(0);
      expect(result.newWorldState.time).toBe(state.time);
      expect(result.event.worldVersion).toBe(0);
      expect(result.event.consequences).toEqual([]);
    },
  );

  it("applique l'horloge mondiale et le déclin au seul acteur", () => {
    const state = createInitialWorldState("Yara");
    state.entities.hamid = { ...state.entities.hamid, hunger: 50, fatigue: 50 };
    state.entities.amir = { ...state.entities.amir, hunger: 50, fatigue: 50 };
    const result = resolveAction(
      state,
      "hamid",
      action("examine", "forge"),
      deterministic,
    );
    expect(result.newWorldState.time.hour).toBe(9);
    expect(result.newWorldState.entities.hamid.hunger).toBe(49.75);
    expect(result.newWorldState.entities.amir).toBe(state.entities.amir);
    expect(result.newWorldState.entities.player).toBe(state.entities.player);
  });

  it("couvre les frontières calendaires et les stats optionnelles", () => {
    expect(
      advanceTime({ year: 2, season: "hiver", day: 30, hour: 23 }, 2),
    ).toEqual({ year: 3, season: "printemps", day: 1, hour: 1 });
    expect(
      advanceTime({ year: 2, season: "été", day: 30, hour: 23 }, 2),
    ).toEqual({ year: 2, season: "automne", day: 1, hour: 1 });
    const actorWithoutStats = createInitialWorldState("Yara").entities.hamid;
    expect(applyPassiveDecay(actorWithoutStats, 2)).toBe(actorWithoutStats);
    expect(
      applyPassiveDecay(
        {
          ...createInitialWorldState("Yara").entities.hamid,
          hunger: 1,
          fatigue: undefined,
        },
        2,
      ),
    ).toMatchObject({ hunger: 0, fatigue: undefined });
    expect(getTimeCost("unknown")).toBe(0);
    const state = createInitialWorldState("Yara");
    expect(applyTimeAndDecay(state, state.entities.hamid, "unknown")).toBe(
      state,
    );
  });

  it("applique take à la cible validée même si une cible similaire existe", () => {
    const state = createInitialWorldState("Yara");
    state.objects.minerai_fer_fin = {
      ...state.objects.minerai_fer,
      id: "minerai_fer_fin",
      name: "minerai de fer fin",
    };
    state.locations.forge_hamid = {
      ...state.locations.forge_hamid,
      presentObjects: [
        ...state.locations.forge_hamid.presentObjects,
        "minerai_fer_fin",
      ],
    };
    const result = resolveAction(
      state,
      "hamid",
      action("take", "minerai de fer"),
      deterministic,
    );
    expect(result.event.targetId).toBe("minerai_fer");
    expect(result.newWorldState.entities.hamid.inventory).toContain(
      "minerai_fer",
    );
    expect(result.newWorldState.entities.hamid.inventory).not.toContain(
      "minerai_fer_fin",
    );
  });

  it("préserve la règle historique permettant de prendre un objet porté par autrui", () => {
    const state = createInitialWorldState("Yara");
    state.entities.leila = {
      ...state.entities.leila,
      inventory: ["vieille_enseigne"],
    };
    const result = resolveAction(
      state,
      "leila",
      action("take", "pain"),
      deterministic,
    );
    expect(result.success).toBe(true);
    expect(result.newWorldState.entities.tariq.inventory).not.toContain(
      "pain_taverne",
    );
    expect(result.newWorldState.entities.leila.inventory).toContain(
      "pain_taverne",
    );
  });

  it.each([
    ["move", "forge", "ACTION_NOT_ALLOWED"],
    ["speak", null, "TARGET_NOT_FOUND"],
    ["take", "minerai", "ACTION_NOT_ALLOWED"],
    ["eat", "marteau", "ACTION_NOT_ALLOWED"],
  ] satisfies Array<[StructuredAction["actionType"], string | null, string]>)(
    "catégorise le refus %s/%s",
    (actionType, targetName, failureCode) => {
      const state = createInitialWorldState("Yara");
      if (actionType === "take") {
        state.entities.hamid = {
          ...state.entities.hamid,
          inventory: ["minerai_fer"],
        };
        state.objects.minerai_fer = {
          ...state.objects.minerai_fer,
          ownerId: "hamid",
          locationId: null,
        };
      }
      const result = resolveAction(
        state,
        "hamid",
        action(actionType, targetName),
        deterministic,
      );
      expect(result).toMatchObject({ success: false, failureCode });
    },
  );

  it("refuse un lieu existant mais non connecté", () => {
    const result = resolveAction(
      createInitialWorldState("Yara"),
      "hamid",
      action("move", "taverne"),
      deterministic,
    );
    expect(result).toMatchObject({
      success: false,
      failureCode: "ACTION_NOT_ALLOWED",
    });
  });

  it("ne dépend jamais de controlledEntityId, événement compris", () => {
    const first = createInitialWorldState("Yara");
    const second = {
      ...createInitialWorldState("Yara"),
      controlledEntityId: "oumou",
    };
    const firstResult = resolveAction(
      first,
      "hamid",
      action("take", "minerai"),
      deterministic,
    );
    const secondResult = resolveAction(
      second,
      "hamid",
      action("take", "minerai"),
      deterministic,
    );
    expect(secondResult).toEqual({
      ...firstResult,
      newWorldState: {
        ...firstResult.newWorldState,
        controlledEntityId: "oumou",
      },
    });
  });
});

describe("perception multi-observateur", () => {
  const outcome = {
    actionType: "examine" as const,
    success: true,
    targetName: null,
    observableFacts: [],
  };

  it("retourne des erreurs typées pour observateur ou lieu absent", () => {
    const state = createInitialWorldState("Yara");
    expect(buildPerceptibleFacts(state, "absent", outcome)).toMatchObject({
      success: false,
      code: "OBSERVER_NOT_FOUND",
    });
    state.entities.hamid = { ...state.entities.hamid, locationId: "absent" };
    expect(buildPerceptibleFacts(state, "hamid", outcome)).toMatchObject({
      success: false,
      code: "OBSERVER_LOCATION_NOT_FOUND",
    });
  });

  it("exclut soi, les autres lieux et les inventaires tiers", () => {
    const state = createInitialWorldState("Yara");
    const result = buildPerceptibleFacts(state, "tariq", outcome);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.facts.presentEntities.map((entity) => entity.name)).toEqual([
      "Leila",
    ]);
    expect(result.facts.presentObjects.map((object) => object.name)).toEqual([
      "lanterne de la taverne",
    ]);
    expect(result.facts.inventoryObjects.map((object) => object.name)).toEqual([
      "miche de pain",
    ]);
    expect(JSON.stringify(result.facts)).not.toContain("panier de légumes");
    expect(JSON.stringify(result.facts)).not.toContain("Hamid");
  });

  it("ignore les identifiants incohérents dans les listes perceptibles", () => {
    const state = createInitialWorldState("Yara");
    state.locations.place_centrale = {
      ...state.locations.place_centrale,
      presentEntities: ["player", "absent"],
      presentObjects: ["vieille_enseigne", "absent"],
    };
    state.entities.player = {
      ...state.entities.player,
      inventory: ["absent"],
    };
    const result = buildPerceptibleFacts(state, "player", outcome);
    expect(result).toMatchObject({
      success: true,
      facts: {
        presentEntities: [],
        presentObjects: [{ name: "vieille enseigne" }],
        inventoryObjects: [],
      },
    });
  });
});
