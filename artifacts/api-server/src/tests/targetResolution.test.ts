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
    ["Tavérne", "taverne"],
    ["d’Oumou", "d oumou"],
    ["l'Oumou", "l oumou"],
    ["---", ""],
  ])("normalise %j en %j", (input, expected) => {
    expect(normalizeTarget(input)).toBe(expected);
  });
});

describe("priorité stable de résolution", () => {
  it.each([
    ["la Taverne du Loup Gris", "taverne_du_loup"],
    ["L’forge de Hamid", "forge_hamid"],
    ["FERME D'OUMOU", "ferme_oumou"],
    ["forge_hamid", "forge_hamid"],
    [" ", null],
  ])("résout le lieu %j", (query, expected) => {
    expect(
      findLocationByQuery(createInitialWorldState("Yara"), query)?.id ?? null,
    ).toBe(expected);
  });

  it("préfère égalité, préfixe puis correspondance partielle dans l'ordre du monde", () => {
    const state = createInitialWorldState("Yara");
    state.entities.alia = {
      ...state.entities.leila,
      id: "alia",
      name: "Ali",
    };
    state.entities.alim = {
      ...state.entities.leila,
      id: "alim",
      name: "Alim",
    };
    expect(
      findEntityAtLocation(state, "tariq", "taverne_du_loup", "Ali")?.id,
    ).toBe("alia");
    expect(
      findEntityAtLocation(state, "tariq", "taverne_du_loup", "Al")?.id,
    ).toBe("alia");
    expect(
      findEntityAtLocation(state, "tariq", "taverne_du_loup", "Tariq"),
    ).toBeNull();
  });

  it("distingue inventaire propre, sol et inventaire tiers", () => {
    const state = createInitialWorldState("Yara");
    expect(
      resolveObjectInActorContext(state, "tariq", "pain")?.availability,
    ).toBe("ACTOR_INVENTORY");
    expect(
      resolveObjectInActorContext(state, "tariq", "lanterne")?.availability,
    ).toBe("GROUND");
    expect(
      resolveObjectInActorContext(state, "leila", "pain")?.availability,
    ).toBe("OTHER_INVENTORY");
    expect(resolveObjectInActorContext(state, "player", "pain")).toBeNull();
    expect(resolveObjectInActorContext(state, "absent", "pain")).toBeNull();
    expect(resolveObjectInActorContext(state, "tariq", null)).toBeNull();
    state.entities.tariq = {
      ...state.entities.tariq,
      inventory: ["missing", ...state.entities.tariq.inventory],
    };
    expect(resolveObjectInActorContext(state, "tariq", "pain")?.object.id).toBe(
      "pain_taverne",
    );
  });

  it("résout les objets, entités, lieu courant et sorties inspectables", () => {
    const state = createInitialWorldState("Yara");
    expect(findInspectable(state, "tariq", "lanterne")).toMatchObject({
      kind: "OBJECT",
      id: "lanterne_taverne",
    });
    expect(findInspectable(state, "tariq", "Leila")).toMatchObject({
      kind: "ENTITY",
      id: "leila",
    });
    expect(findInspectable(state, "tariq", "loup gris")).toMatchObject({
      kind: "LOCATION",
      id: "taverne_du_loup",
    });
    expect(findInspectable(state, "tariq", "place centrale")).toMatchObject({
      kind: "LOCATION",
      id: "place_centrale",
    });
    expect(findInspectable(state, "absent", "place")).toBeNull();
    expect(findInspectable(state, "tariq", "absent")).toBeNull();
    expect(
      findEntityAtLocation(state, "tariq", "taverne_du_loup", null),
    ).toBeNull();
    state.locations.taverne_du_loup = {
      ...state.locations.taverne_du_loup,
      connectedLocations: ["missing"],
    };
    expect(findInspectable(state, "tariq", "place")).toBeNull();
  });
});
