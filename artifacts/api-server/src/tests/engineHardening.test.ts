import { describe, expect, it } from "vitest";
import type { StructuredAction } from "../domain/actions.js";
import type { GameEvent } from "../domain/events.js";
import type { WorldTime } from "../domain/world.js";
import {
  resolveAction,
  type ResolutionDependencies,
} from "../engine/actionResolver.js";
import {
  buildPerceptibleFacts,
  resolveObservedAction,
} from "../engine/perceptionEngine.js";
import {
  advanceTime,
  applyPassiveDecay,
  applyTimeAndDecay,
  catchUpEntity,
  elapsedWorldMinutes,
  getTimeCostMinutes,
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
    ["use", "marteau"],
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
    expect(result.newWorldState.time).toMatchObject({ hour: 9, minute: 6 });
    expect(result.newWorldState.entities.hamid.hunger).toBe(49.75);
    expect(result.newWorldState.entities.amir).toBe(state.entities.amir);
    expect(result.newWorldState.entities.player).toBe(state.entities.player);
  });

  it("couvre les frontières calendaires et les stats optionnelles", () => {
    expect(
      advanceTime({ year: 2, season: "hiver", day: 30, hour: 23 }, 120),
    ).toEqual({ year: 3, season: "printemps", day: 1, hour: 1, minute: 0 });
    expect(
      advanceTime({ year: 2, season: "été", day: 30, hour: 23 }, 120),
    ).toEqual({ year: 2, season: "automne", day: 1, hour: 1, minute: 0 });
    expect(
      advanceTime({ year: 2, season: "été", day: 4, hour: 23 }, 120),
    ).toEqual({ year: 2, season: "été", day: 5, hour: 1, minute: 0 });
    const actorWithoutStats = createInitialWorldState("Yara").entities.hamid;
    expect(applyPassiveDecay(actorWithoutStats, 120)).toBe(actorWithoutStats);
    expect(
      applyPassiveDecay(
        {
          ...createInitialWorldState("Yara").entities.hamid,
          hunger: 1,
          fatigue: undefined,
        },
        120,
      ),
    ).toMatchObject({ hunger: 0, fatigue: undefined });
    expect(getTimeCostMinutes("unknown")).toBe(0);
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

  it("refuse une cible ambiguë sans divulguer ses identifiants au narrateur", () => {
    const state = createInitialWorldState("Yara");
    state.entities.alia = { ...state.entities.leila, id: "alia", name: "Ali" };
    state.entities.alim = { ...state.entities.leila, id: "alim", name: "Alim" };
    const result = resolveAction(
      state,
      "tariq",
      action("speak", "Al"),
      deterministic,
    );
    expect(result).toMatchObject({
      success: false,
      failureCode: "TARGET_AMBIGUOUS",
      newWorldState: state,
    });
    expect(JSON.stringify(result.event.observations)).not.toContain("alia");
    expect(JSON.stringify(result.event.observations)).not.toContain("alim");
  });

  it.each(["move", "take", "examine", "eat"] as const)(
    "refuse l'ambiguïté pour %s",
    (actionType) => {
      const state = createInitialWorldState("Yara");
      let actorId = "hamid";
      let targetName = "double";
      if (actionType === "move") {
        state.locations.double_a = {
          ...state.locations.place_centrale,
          id: "double_a",
          name: "Double",
        };
        state.locations.double_b = {
          ...state.locations.place_centrale,
          id: "double_b",
          name: "Double",
        };
      } else if (actionType === "eat") {
        actorId = "tariq";
        state.objects.double_a = {
          ...state.objects.pain_taverne,
          id: "double_a",
          name: "Double",
        };
        state.objects.double_b = {
          ...state.objects.pain_taverne,
          id: "double_b",
          name: "Double",
        };
        state.entities.tariq = {
          ...state.entities.tariq,
          inventory: ["double_a", "double_b"],
        };
      } else {
        state.objects.double_a = {
          ...state.objects.minerai_fer,
          id: "double_a",
          name: "Double",
        };
        state.objects.double_b = {
          ...state.objects.minerai_fer,
          id: "double_b",
          name: "Double",
        };
        state.locations.forge_hamid = {
          ...state.locations.forge_hamid,
          presentObjects: [
            ...state.locations.forge_hamid.presentObjects,
            "double_a",
            "double_b",
          ],
        };
      }
      expect(
        resolveAction(
          state,
          actorId,
          action(actionType, targetName),
          deterministic,
        ),
      ).toMatchObject({
        success: false,
        failureCode: "TARGET_AMBIGUOUS",
        newWorldState: state,
      });
    },
  );

  it("couvre les valeurs optionnelles et plafonds de eat/examine", () => {
    const noHunger = createInitialWorldState("Yara");
    noHunger.entities.tariq = {
      ...noHunger.entities.tariq,
      hunger: undefined,
    };
    expect(
      resolveAction(noHunger, "tariq", action("eat", "pain"), deterministic)
        .newWorldState.entities.tariq.hunger,
    ).toBe(79.375);

    const capped = createInitialWorldState("Yara");
    capped.entities.tariq = { ...capped.entities.tariq, hunger: 90 };
    expect(
      resolveAction(capped, "tariq", action("eat", "pain"), deterministic)
        .newWorldState.entities.tariq.hunger,
    ).toBe(99.375);

    const examined = resolveAction(
      createInitialWorldState("Yara"),
      "hamid",
      action("examine", null),
      deterministic,
    );
    expect(examined.success).toBe(true);
    expect(examined.event.targetId).toBeNull();
  });

  it("accumule exactement les durées courtes et les fractions héritées", () => {
    let tenth: WorldTime = {
      year: 1,
      season: "printemps",
      day: 1,
      hour: 8,
    };
    for (let index = 0; index < 10; index += 1) {
      tenth = advanceTime(tenth, 6);
    }
    expect(tenth).toEqual({
      year: 1,
      season: "printemps",
      day: 1,
      hour: 9,
      minute: 0,
    });
    expect(
      advanceTime(
        advanceTime({ year: 1, season: "printemps", day: 1, hour: 8 }, 15),
        15,
      ),
    ).toMatchObject({ hour: 8, minute: 30 });
    expect(
      advanceTime({ year: 1, season: "printemps", day: 1, hour: 8.25 }, 15),
    ).toMatchObject({ hour: 8, minute: 30 });
  });

  it("rattrape paresseusement un PNJ resté inactif pendant plusieurs jours", () => {
    let state = createInitialWorldState("Yara");
    state.entities.hamid = {
      ...state.entities.hamid,
      hunger: 100,
      fatigue: 100,
    };
    const hamidBefore = state.entities.hamid;
    for (let index = 0; index < 12; index += 1) {
      state = resolveAction(
        state,
        "player",
        action("sleep"),
        deterministic,
      ).newWorldState;
    }
    expect(state.entities.hamid).toBe(hamidBefore);
    const lastSimulationTime = hamidBefore.lastSimulationTime;
    expect(lastSimulationTime).toBeDefined();
    if (!lastSimulationTime) {
      throw new Error("Le curseur temporel initial de Hamid est absent.");
    }
    expect(elapsedWorldMinutes(lastSimulationTime, state.time)).toBe(
      3 * 24 * 60,
    );

    const activated = resolveAction(
      state,
      "hamid",
      action("examine", "forge"),
      deterministic,
    );
    expect(activated.success).toBe(true);
    expect(activated.newWorldState.entities.hamid).toMatchObject({
      hunger: 0,
      fatigue: 0,
      lastSimulationTime: activated.newWorldState.time,
    });
  });

  it("une ellipse temporelle agrège les besoins sans simuler chaque action", () => {
    const state = createInitialWorldState("Yara");
    const entity = {
      ...state.entities.tariq,
      hunger: 80,
      fatigue: 80,
    };
    const future = advanceTime(state.time, 10 * 24 * 60);
    const caughtUp = catchUpEntity(entity, future);
    expect(caughtUp).toMatchObject({
      hunger: 0,
      fatigue: 0,
      lastSimulationTime: future,
    });
    expect(catchUpEntity(caughtUp, future)).toBe(caughtUp);
  });

  it("initialise sans dette rétroactive une sauvegarde historique sans curseur", () => {
    const state = createInitialWorldState("Yara");
    const { lastSimulationTime: _legacyCursor, ...legacyEntity } =
      state.entities.hamid;
    const currentTime = advanceTime(state.time, 600);
    const caughtUp = catchUpEntity(legacyEntity, currentTime);

    expect(caughtUp).toEqual({
      ...legacyEntity,
      lastSimulationTime: currentTime,
    });
  });

  it("ne recule jamais le curseur temporel d'une entité", () => {
    const state = createInitialWorldState("Yara");
    const future = advanceTime(state.time, 60);
    const entity = { ...state.entities.hamid, lastSimulationTime: future };

    expect(catchUpEntity(entity, state.time)).toBe(entity);
  });

  it("applique le même rattrapage à un PNJ et à l'entité contrôlée", () => {
    const state = createInitialWorldState("Yara");
    const future = advanceTime(state.time, 120);
    const shared = {
      hunger: 70,
      fatigue: 85,
      lastSimulationTime: state.time,
    };
    const player = catchUpEntity(
      { ...state.entities.player, ...shared },
      future,
    );
    const npc = catchUpEntity({ ...state.entities.hamid, ...shared }, future);
    expect({
      hunger: npc.hunger,
      fatigue: npc.fatigue,
      lastSimulationTime: npc.lastSimulationTime,
    }).toEqual({
      hunger: player.hunger,
      fatigue: player.fatigue,
      lastSimulationTime: player.lastSimulationTime,
    });
  });

  it.each(["move", "take", "eat"] as const)(
    "refuse %s sans cible avec un échec typé",
    (actionType) => {
      const result = resolveAction(
        createInitialWorldState("Yara"),
        "hamid",
        action(actionType, null),
        deterministic,
      );
      expect(result).toMatchObject({
        success: false,
        failureCode: "TARGET_NOT_FOUND",
      });
    },
  );

  it.each(["give", "use"] as const)(
    "refuse %s sans version, temps ni état fictifs",
    (actionType) => {
      const state = createInitialWorldState("Yara");
      const result = resolveAction(
        state,
        "hamid",
        action(actionType, "marteau"),
        deterministic,
      );
      expect(result).toMatchObject({
        success: false,
        failureCode: "ACTION_NOT_IMPLEMENTED",
        newWorldState: state,
        event: { worldVersion: 0, consequences: [] },
      });
      expect(result.newWorldState).toBe(state);
      expect(result.newWorldState.time).toBe(state.time);
    },
  );

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
    ["eat", "marteau", "OBJECT_NOT_EDIBLE"],
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
      if (actionType === "eat" && targetName === "marteau") {
        state.entities.hamid = {
          ...state.entities.hamid,
          inventory: ["marteau_hamid"],
        };
        state.objects.marteau_hamid = {
          ...state.objects.marteau_hamid,
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
  const event: GameEvent = {
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

  it("retourne des erreurs typées pour observateur ou lieu absent", () => {
    const state = createInitialWorldState("Yara");
    expect(buildPerceptibleFacts(state, "absent", event)).toMatchObject({
      success: false,
      code: "OBSERVER_NOT_FOUND",
    });
    state.entities.hamid = { ...state.entities.hamid, locationId: "absent" };
    expect(buildPerceptibleFacts(state, "hamid", event)).toMatchObject({
      success: false,
      code: "OBSERVER_LOCATION_NOT_FOUND",
    });
  });

  it("ne résout aucune observation pour un identifiant d'observateur absent", () => {
    const state = createInitialWorldState("Yara");
    expect(resolveObservedAction(state, "absent", event)).toBeNull();
  });

  it("projette explicitement le statut d'une tentative refusée vers son acteur", () => {
    const state = createInitialWorldState("Yara");
    expect(
      resolveObservedAction(state, "player", {
        ...event,
        status: "REJECTED",
        observations: [{ audience: "ACTOR", text: "Tentative refusée." }],
      }),
    ).toMatchObject({
      success: false,
      observableFacts: ["Tentative refusée."],
    });
  });

  it("exclut soi, les autres lieux et les inventaires tiers", () => {
    const state = createInitialWorldState("Yara");
    const result = buildPerceptibleFacts(state, "tariq", event);
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
    const result = buildPerceptibleFacts(state, "player", event);
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

