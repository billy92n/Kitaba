import { describe, expect, it } from "vitest";
import {
  findEntityAtLocation,
  findInspectable,
  findLocationByQuery,
  normalizeTarget,
  resolveObjectInActorContext,
} from "../engine/targetResolution.js";
import { createInitialWorldState } from "../worldSeed.js";

describe("normalisation des cibles", () => {
  it.each([
    ["  FORGE  ", "forge"],
    ["TavÃ©rne", "taverne"],
    ["dâ€™Oumou", "d oumou"],
    ["l'Oumou", "l oumou"],
    ["---", ""],
  ])("normalise %j en %j", (input, expected) => {
    expect(normalizeTarget(input)).toBe(expected);
  });
});

describe("rÃ©solution discriminÃ©e et stable", () => {
  it.each([
    ["la Taverne du Loup Gris", "taverne_du_loup"],
    ["Lâ€™forge de Hamid", "forge_hamid"],
    ["FERME D'OUMOU", "ferme_oumou"],
    ["forge_hamid", "forge_hamid"],
    [" ", null],
  ])("rÃ©sout le lieu %j", (query, expected) => {
    const result = findLocationByQuery(createInitialWorldState("Yara"), query);
    expect(result.status === "FOUND" ? result.target.id : null).toBe(expected);
  });

  it("prÃ©fÃ¨re l'Ã©galitÃ© et refuse les meilleurs prÃ©fixes ambigus", () => {
    const state = createInitialWorldState("Yara");
    state.entities.alia = { ...state.entities.leila, id: "alia", name: "Ali" };
    state.entities.alim = { ...state.entities.leila, id: "alim", name: "Alim" };
    expect(
      findEntityAtLocation(state, "tariq", "taverne_du_loup", "Ali"),
    ).toMatchObject({ status: "FOUND", target: { id: "alia" } });
    expect(
      findEntityAtLocation(state, "tariq", "taverne_du_loup", "Al"),
    ).toEqual({ status: "AMBIGUOUS", candidateIds: ["alia", "alim"] });
    expect(
      findEntityAtLocation(state, "tariq", "taverne_du_loup", "Tariq"),
    ).toEqual({ status: "MISSING" });
  });

  it("distingue inventaire propre, sol et inventaire tiers", () => {
    const state = createInitialWorldState("Yara");
    expect(resolveObjectInActorContext(state, "tariq", "pain")).toMatchObject({
      status: "FOUND",
      target: { availability: "ACTOR_INVENTORY" },
    });
    expect(
      resolveObjectInActorContext(state, "tariq", "lanterne"),
    ).toMatchObject({
      status: "FOUND",
      target: { availability: "GROUND" },
    });
    expect(resolveObjectInActorContext(state, "leila", "pain")).toMatchObject({
      status: "FOUND",
      target: { availability: "OTHER_INVENTORY" },
    });
    expect(resolveObjectInActorContext(state, "player", "pain")).toEqual({
      status: "MISSING",
    });
    expect(resolveObjectInActorContext(state, "absent", "pain")).toEqual({
      status: "MISSING",
    });
    expect(resolveObjectInActorContext(state, "tariq", null)).toEqual({
      status: "MISSING",
    });
    state.entities.tariq = {
      ...state.entities.tariq,
      inventory: ["missing", ...state.entities.tariq.inventory],
    };
    expect(resolveObjectInActorContext(state, "tariq", "pain")).toMatchObject({
      status: "FOUND",
      target: { object: { id: "pain_taverne" } },
    });
  });

  it("rÃ©sout objets, entitÃ©s, lieu courant et sorties inspectables", () => {
    const state = createInitialWorldState("Yara");
    expect(findInspectable(state, "tariq", "lanterne")).toMatchObject({
      status: "FOUND",
      target: { kind: "OBJECT", id: "lanterne_taverne" },
    });
    expect(findInspectable(state, "tariq", "Leila")).toMatchObject({
      status: "FOUND",
      target: { kind: "ENTITY", id: "leila" },
    });
    expect(findInspectable(state, "tariq", "loup gris")).toMatchObject({
      status: "FOUND",
      target: { kind: "LOCATION", id: "taverne_du_loup" },
    });
    expect(findInspectable(state, "tariq", "place centrale")).toMatchObject({
      status: "FOUND",
      target: { kind: "LOCATION", id: "place_centrale" },
    });
    expect(findInspectable(state, "absent", "place")).toEqual({
      status: "MISSING",
    });
    expect(findInspectable(state, "tariq", "absent")).toEqual({
      status: "MISSING",
    });
    expect(
      findEntityAtLocation(state, "tariq", "taverne_du_loup", null),
    ).toEqual({ status: "MISSING" });
    state.locations.taverne_du_loup = {
      ...state.locations.taverne_du_loup,
      connectedLocations: ["missing"],
    };
    expect(findInspectable(state, "tariq", "place")).toEqual({
      status: "MISSING",
    });
  });

  it.each([
    ["prÃ©fixes", "Ali", "Al"],
    ["partielles", "Jean Rouge", "Rouge"],
    ["identiques", "Sam", "Sam"],
  ])(
    "refuse les cibles %s Ã©quivalentes indÃ©pendamment de l'insertion",
    (_label, name, query) => {
      const first = createInitialWorldState("Yara");
      first.entities.zed = { ...first.entities.leila, id: "zed", name };
      first.entities.alpha = { ...first.entities.leila, id: "alpha", name };
      const second = createInitialWorldState("Yara");
      second.entities.alpha = { ...second.entities.leila, id: "alpha", name };
      second.entities.zed = { ...second.entities.leila, id: "zed", name };
      const expected = {
        status: "AMBIGUOUS",
        candidateIds: ["alpha", "zed"],
      };
      expect(
        findEntityAtLocation(first, "tariq", "taverne_du_loup", query),
      ).toEqual(expected);
      expect(
        findEntityAtLocation(second, "tariq", "taverne_du_loup", query),
      ).toEqual(expected);
    },
  );
});

