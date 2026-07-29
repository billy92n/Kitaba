import { describe, expect, it } from "vitest";
import {
  resolveAutonomousActionMetadata,
  resolveAutonomyDecisionState,
  type AutonomyProfile,
} from "../domain/autonomy.js";
import type { GameEvent } from "../domain/events.js";
import type { WorldState } from "../domain/world.js";
import {
  buildAutonomousDecisionInput,
  type AutonomousDecisionInput,
} from "../engine/autonomyContext.js";
import { decideAutonomousAction } from "../engine/autonomyDecision.js";
import { resolveAction } from "../engine/actionResolver.js";
import { validateAction } from "../engine/actionValidator.js";
import { advanceTime } from "../engine/timeEngine.js";
import { createInitialWorldState } from "../worldSeed.js";

function profile(
  values: Partial<AutonomyProfile["traits"]> = {},
  goal: AutonomyProfile["persistentGoal"] = { kind: "NONE", strength: 0 },
): AutonomyProfile {
  return {
    traits: {
      prudence: 50,
      sociability: 50,
      ambition: 50,
      curiosity: 50,
      discipline: 50,
      ...values,
    },
    persistentGoal: goal,
  };
}

function inputFor(
  state: WorldState,
  actorId: string,
  event?: GameEvent,
): AutonomousDecisionInput {
  const result = buildAutonomousDecisionInput(state, actorId, event);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.reason);
  return result.input;
}

function selectedKey(
  state: WorldState,
  actorId: string,
  seed: string | number,
): string {
  const result = decideAutonomousAction(inputFor(state, actorId), { seed });
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.trace.reason);
  return result.trace.selectedCandidateKey ?? "";
}

describe("autonomous runtime identity boundaries", () => {
  it.each(["", " ", "\t", "\n", "  intention-valide  "])(
    "rejects non-canonical historical intentKey %j without mutation",
    (intentKey) => {
      const persisted = {
        intentKey,
        remainingCommitmentTurns: 2,
        previousLocationId: "place_centrale",
      };
      const before = structuredClone(persisted);

      expect(() => resolveAutonomyDecisionState(persisted)).toThrow(TypeError);
      expect(persisted).toEqual(before);
    },
  );

  it.each(["", " ", "\t", "\n", "  intention-valide  "])(
    "rejects non-canonical deserialized metadata intentKey %j",
    (intentKey) => {
      const persisted = JSON.stringify({
        intentKey,
        nextCommitmentTurns: 2,
        targetId: "pain_taverne",
      });
      const deserialized: unknown = JSON.parse(persisted);
      const before = structuredClone(deserialized);

      expect(() => resolveAutonomousActionMetadata(deserialized)).toThrow(
        TypeError,
      );
      expect(deserialized).toEqual(before);
    },
  );

  it.each([
    { field: "intentKey", value: 42 },
    { field: "targetId", value: " pain_taverne" },
    { field: "previousLocationId", value: "place_centrale " },
  ])("rejects malformed metadata identity $field", ({ field, value }) => {
    const metadata: Record<string, unknown> = {
      intentKey: "eat:pain_taverne",
      nextCommitmentTurns: 2,
      targetId: "pain_taverne",
      [field]: value,
    };
    expect(() => resolveAutonomousActionMetadata(metadata)).toThrow(TypeError);
  });

  it("rejects a persisted historical blank key through the context boundary", () => {
    const state = createInitialWorldState("Yara");
    state.entities.hamid.autonomyDecisionState = {
      intentKey: "\t",
      remainingCommitmentTurns: 2,
    };
    const before = structuredClone(state);

    expect(buildAutonomousDecisionInput(state, "hamid")).toMatchObject({
      success: false,
      code: "INVALID_AUTONOMY_STATE",
    });
    expect(state).toEqual(before);
  });

  it("rejects two visually equivalent candidate keys in either order", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    const candidate = input.candidates.find(
      (entry) => entry.action.actionType === "move",
    );
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const padded = {
      ...candidate,
      candidateKey: ` ${candidate.candidateKey} `,
    };
    const before = structuredClone(input);

    const first = decideAutonomousAction(
      { ...input, candidates: [candidate, padded] },
      { seed: "canonical-identity" },
    );
    const second = decideAutonomousAction(
      { ...input, candidates: [padded, candidate] },
      { seed: "canonical-identity" },
    );

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      success: false,
      code: "INVALID_AUTONOMY_IDENTITY",
      trace: { selectedCandidateKey: null },
    });
    expect(input).toEqual(before);
  });

  it.each([
    { actorId: " player", locationId: "place_centrale" },
    { actorId: "player", locationId: "place_centrale " },
  ])(
    "rejects non-canonical actor boundary identities %#",
    ({ actorId, locationId }) => {
      const input = inputFor(createInitialWorldState("Yara"), "player");
      expect(
        decideAutonomousAction(
          {
            ...input,
            actor: { ...input.actor, actorId, locationId },
          },
          { seed: "actor-identity" },
        ),
      ).toMatchObject({
        success: false,
        code: "INVALID_AUTONOMY_IDENTITY",
      });
    },
  );

  it("rejects a non-string actorId at the pure decision boundary", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    expect(
      decideAutonomousAction(
        {
          ...input,
          actor: {
            ...input.actor,
            actorId: 42 as unknown as string,
          },
        },
        { seed: "actor-type" },
      ),
    ).toMatchObject({
      success: false,
      code: "INVALID_AUTONOMY_IDENTITY",
      trace: { actorId: "" },
    });
  });

  it("rejects a non-string candidateKey at the pure decision boundary", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    const candidate = input.candidates[0];
    expect(candidate).toBeDefined();
    if (!candidate) return;
    expect(
      decideAutonomousAction(
        {
          ...input,
          candidates: [
            {
              ...candidate,
              candidateKey: 42 as unknown as string,
            },
          ],
        },
        { seed: "candidate-type" },
      ),
    ).toMatchObject({
      success: false,
      code: "INVALID_AUTONOMY_IDENTITY",
    });
  });

  it("rejects a non-canonical actorId before world lookup", () => {
    const state = createInitialWorldState("Yara");
    expect(buildAutonomousDecisionInput(state, " player")).toMatchObject({
      success: false,
      code: "INVALID_AUTONOMY_IDENTITY",
    });
  });

  it("rejects a non-canonical persisted actor location", () => {
    const state = createInitialWorldState("Yara");
    state.entities.player.locationId = "place_centrale ";
    const before = structuredClone(state);

    expect(buildAutonomousDecisionInput(state, "player")).toMatchObject({
      success: false,
      code: "INVALID_AUTONOMY_IDENTITY",
    });
    expect(state).toEqual(before);
  });
});

describe("autonomous decision context isolation", () => {
  it("is independent from the controlled entity for an explicit actor", () => {
    const first = createInitialWorldState("Yara");
    const second = structuredClone(first);
    second.controlledEntityId = "oumou";

    const firstDecision = decideAutonomousAction(inputFor(first, "hamid"), {
      seed: "same",
    });
    const secondDecision = decideAutonomousAction(inputFor(second, "hamid"), {
      seed: "same",
    });

    expect(secondDecision).toEqual(firstDecision);
  });

  it("never exposes an unseen remote object in candidates or traces", () => {
    const state = createInitialWorldState("Yara");
    state.objects.hidden_gem = {
      id: "hidden_gem",
      name: "gemme secrète",
      description: "Une gemme précieuse dissimulée.",
      locationId: "forge_hamid",
      ownerId: null,
      properties: {},
    };
    state.locations.forge_hamid.presentObjects.push("hidden_gem");

    const input = inputFor(state, "tariq");
    const decision = decideAutonomousAction(input, { seed: "privacy" });

    expect(JSON.stringify(input)).not.toContain("hidden_gem");
    expect(JSON.stringify(input)).not.toContain("gemme secrète");
    expect(JSON.stringify(decision)).not.toContain("hidden_gem");
    expect(JSON.stringify(decision)).not.toContain("gemme secrète");
  });

  it("is not influenced by a hidden remote location with the same name", () => {
    const state = createInitialWorldState("Yara");
    state.locations.hidden_farm = {
      id: "hidden_farm",
      name: state.locations.ferme_oumou.name,
      description: "A remote homonym that the actor cannot perceive.",
      connectedLocations: [],
      presentEntities: [],
      presentObjects: [],
    };

    const input = inputFor(state, "player");
    const localFarm = input.candidates.find(
      (candidate) => candidate.candidateKey === "move:ferme_oumou",
    );
    expect(localFarm?.eligibility).toEqual({ eligible: true });
    expect(JSON.stringify(input)).not.toContain("hidden_farm");
    const decision = decideAutonomousAction(
      { ...input, candidates: localFarm ? [localFarm] : [] },
      { seed: "local-id" },
    );
    expect(decision).toMatchObject({
      success: true,
      trace: { selectedCandidateKey: "move:ferme_oumou" },
    });
    if (!decision.success) return;
    expect(
      resolveAction(state, "player", decision.action, {
        createEventId: () => "local-id",
      }),
    ).toMatchObject({
      success: true,
      event: { targetId: "ferme_oumou" },
    });
  });

  it("does not enumerate an object carried by another actor", () => {
    const state = createInitialWorldState("Yara");
    state.entities.oumou.locationId = "taverne_du_loup";
    state.locations.taverne_du_loup.presentEntities.push("oumou");

    const input = inputFor(state, "tariq");
    expect(JSON.stringify(input.candidates)).not.toContain("panier_legumes");
    expect(JSON.stringify(input.candidates)).not.toContain("panier de légumes");
  });

  it("filters private observations and private target names", () => {
    const state = createInitialWorldState("Yara");
    const privateEvent: GameEvent = {
      id: "private",
      sessionId: "session",
      worldVersion: 0,
      actionType: "examine",
      actorId: "hamid",
      locationId: "forge_hamid",
      targetId: "hidden",
      description: "private",
      consequences: [],
      occurredAt: state.time,
      status: "APPLIED",
      requestedTargetName: "gemme secrète",
      observations: [{ audience: "ACTOR", text: "Vous voyez la gemme." }],
    };

    const input = inputFor(state, "tariq", privateEvent);
    expect(input.actor.observedAction).toBeNull();
    expect(JSON.stringify(input)).not.toContain("gemme secrète");
  });

  it("accepts only an explicitly public observation across locations", () => {
    const state = createInitialWorldState("Yara");
    const publicEvent: GameEvent = {
      id: "public",
      sessionId: "session",
      worldVersion: 0,
      actionType: "speak",
      actorId: "hamid",
      locationId: "forge_hamid",
      targetId: null,
      description: "public",
      consequences: [],
      occurredAt: state.time,
      status: "APPLIED",
      requestedTargetName: "secret target",
      observations: [{ audience: "PUBLIC", text: "La cloche sonne." }],
    };

    const input = inputFor(state, "tariq", publicEvent);
    expect(input.actor.observedAction).toMatchObject({
      targetName: null,
      observableFacts: ["La cloche sonne."],
    });
    expect(JSON.stringify(input)).not.toContain("secret target");
  });

  it("ignores inconsistent local references without scanning the world", () => {
    const state = createInitialWorldState("Yara");
    state.entities.hamid.locationId = "forge_hamid";
    state.objects.minerai_fer.locationId = "forge_hamid";
    state.objects.minerai_fer.ownerId = null;
    state.locations.taverne_du_loup.connectedLocations.push(
      "missing-location",
      "place_centrale",
    );
    state.locations.taverne_du_loup.presentEntities.push(
      "missing-entity",
      "hamid",
    );
    state.locations.taverne_du_loup.presentObjects.push(
      "missing-object",
      "minerai_fer",
    );
    state.entities.tariq.inventory.push(
      "missing-inventory-object",
      "panier_legumes",
    );

    const input = inputFor(state, "tariq");
    expect(JSON.stringify(input.candidates)).not.toContain("missing-");
    expect(JSON.stringify(input.candidates)).not.toContain("hamid");
    expect(JSON.stringify(input.candidates)).not.toContain("minerai_fer");
    expect(JSON.stringify(input.candidates)).not.toContain("panier_legumes");
    expect(
      input.candidates.filter(
        (candidate) => candidate.candidateKey === "move:place_centrale",
      ),
    ).toHaveLength(1);
  });
});

describe("candidate credibility and utility", () => {
  it("validates id-bound targets only through canonical local facts", () => {
    const state = createInitialWorldState("Yara");
    state.entities.oumou = {
      ...state.entities.oumou,
      locationId: "taverne_du_loup",
    };
    state.locations.taverne_du_loup.presentEntities.push("oumou");

    expect(
      validateAction(
        state,
        "tariq",
        {
          actionType: "take",
          targetName: "panier",
          details: "",
          rawInput: "",
        },
        "panier_legumes",
      ),
    ).toMatchObject({
      possible: true,
      context: { availability: "OTHER_INVENTORY" },
    });
    expect(
      validateAction(
        state,
        "tariq",
        {
          actionType: "examine",
          targetName: "Leila",
          details: "",
          rawInput: "",
        },
        "leila",
      ),
    ).toMatchObject({
      possible: true,
      context: { target: { kind: "ENTITY", id: "leila" } },
    });
    expect(
      validateAction(
        state,
        "tariq",
        {
          actionType: "examine",
          targetName: "taverne",
          details: "",
          rawInput: "",
        },
        "taverne_du_loup",
      ),
    ).toMatchObject({
      possible: true,
      context: { target: { kind: "LOCATION", id: "taverne_du_loup" } },
    });
    expect(
      validateAction(
        state,
        "tariq",
        {
          actionType: "examine",
          targetName: "place",
          details: "",
          rawInput: "",
        },
        "place_centrale",
      ),
    ).toMatchObject({
      possible: true,
      context: { target: { kind: "LOCATION", id: "place_centrale" } },
    });
  });

  it("refuses stale or physically inconsistent id-bound targets", () => {
    const state = createInitialWorldState("Yara");
    state.objects.false_inventory = {
      id: "false_inventory",
      name: "false inventory",
      description: "",
      locationId: null,
      ownerId: "tariq",
      properties: {},
    };
    state.objects.false_ground = {
      id: "false_ground",
      name: "false ground",
      description: "",
      locationId: "taverne_du_loup",
      ownerId: null,
      properties: {},
    };
    state.objects.remote_owner = {
      id: "remote_owner",
      name: "remote owner",
      description: "",
      locationId: null,
      ownerId: "oumou",
      properties: {},
    };

    const actionTypes = ["move", "speak", "take", "eat"] as const;
    for (const actionType of actionTypes) {
      expect(
        validateAction(
          state,
          "tariq",
          {
            actionType,
            targetName: "missing",
            details: "",
            rawInput: "",
          },
          "missing",
        ),
      ).toMatchObject({ possible: false, code: "TARGET_NOT_FOUND" });
    }
    expect(
      validateAction(
        state,
        "tariq",
        {
          actionType: "move",
          targetName: "place centrale",
          details: "",
          rawInput: "",
        },
        "",
      ),
    ).toMatchObject({ possible: false, code: "TARGET_NOT_FOUND" });
    expect(
      validateAction(
        state,
        "tariq",
        {
          actionType: "examine",
          targetName: null,
          details: "",
          rawInput: "",
        },
        "missing",
      ),
    ).toMatchObject({ possible: false, code: "TARGET_NOT_FOUND" });
    expect(
      validateAction(state, "tariq", {
        actionType: "examine",
        targetName: "missing",
        details: "",
        rawInput: "",
      }),
    ).toMatchObject({ possible: true, context: { target: null } });

    for (const targetId of [
      "false_inventory",
      "false_ground",
      "remote_owner",
    ]) {
      expect(
        validateAction(
          state,
          "tariq",
          {
            actionType: "take",
            targetName: targetId,
            details: "",
            rawInput: "",
          },
          targetId,
        ),
      ).toMatchObject({ possible: false, code: "TARGET_NOT_FOUND" });
    }
    for (const targetId of ["tariq", "hamid", "forge_hamid"]) {
      expect(
        validateAction(
          state,
          "tariq",
          {
            actionType: "examine",
            targetName: targetId,
            details: "",
            rawInput: "",
          },
          targetId,
        ),
      ).toMatchObject({ possible: false, code: "TARGET_NOT_FOUND" });
    }
  });

  it("generates candidates only from implemented verbs and visible affordances", () => {
    const input = inputFor(createInitialWorldState("Yara"), "tariq");
    const actionTypes = new Set(
      input.candidates.map((candidate) => candidate.action.actionType),
    );
    expect(actionTypes.has("give")).toBe(false);
    expect(actionTypes.has("use")).toBe(false);
    expect(actionTypes.has("attack")).toBe(false);
    expect(actionTypes.has("unknown")).toBe(false);
    expect(
      input.candidates.every(
        (candidate) =>
          candidate.source === "INTRINSIC" ||
          candidate.action.targetName !== null,
      ),
    ).toBe(true);
  });

  it("lets extreme hunger dominate every normal preference", () => {
    const state = createInitialWorldState("Yara");
    state.entities.tariq = {
      ...state.entities.tariq,
      hunger: 0,
      fatigue: 100,
      autonomyProfile: profile(
        { sociability: 100, curiosity: 100, discipline: 0 },
        { kind: "SOCIALIZE", strength: 100 },
      ),
    };

    for (let seed = 0; seed < 30; seed += 1) {
      expect(selectedKey(state, "tariq", seed)).toBe("eat:pain_taverne");
    }
  });

  it("lets extreme fatigue select sleep as a critical action", () => {
    const state = createInitialWorldState("Yara");
    state.entities.player = {
      ...state.entities.player,
      hunger: 100,
      fatigue: 0,
      autonomyProfile: profile(
        { curiosity: 100, prudence: 0 },
        { kind: "EXPLORE", strength: 100 },
      ),
    };
    expect(selectedKey(state, "player", "exhausted")).toBe("sleep:self");
  });

  it("does not force a satiated actor to eat", () => {
    const state = createInitialWorldState("Yara");
    state.entities.tariq = {
      ...state.entities.tariq,
      hunger: 100,
      fatigue: 100,
      autonomyProfile: profile(
        { sociability: 100, discipline: 0 },
        { kind: "SOCIALIZE", strength: 100 },
      ),
    };
    expect(selectedKey(state, "tariq", "social")).toBe("speak:leila");
  });

  it("allows curiosity to influence an appropriate non-vital choice", () => {
    const state = createInitialWorldState("Yara");
    state.entities.player = {
      ...state.entities.player,
      hunger: 100,
      fatigue: 100,
      autonomyProfile: profile(
        { curiosity: 100, sociability: 0, ambition: 0 },
        { kind: "EXPLORE", strength: 100 },
      ),
    };
    expect(selectedKey(state, "player", "curious")).toMatch(/^(move|examine):/);
  });

  it("keeps same-named visible targets bound to their exact ids", () => {
    const state = createInitialWorldState("Yara");
    state.objects.lantern_duplicate = {
      ...state.objects.lanterne_taverne,
      id: "lantern_duplicate",
    };
    state.locations.taverne_du_loup.presentObjects.push("lantern_duplicate");
    const decision = decideAutonomousAction(inputFor(state, "tariq"), {
      seed: "ambiguous",
    });
    expect(decision.success).toBe(true);
    expect(
      decision.trace.candidates.filter((candidate) =>
        ["lantern_duplicate", "lanterne_taverne"].some((id) =>
          candidate.candidateKey.endsWith(id),
        ),
      ),
    ).toHaveLength(4);
    expect(
      decision.trace.candidates
        .filter((candidate) =>
          ["lantern_duplicate", "lanterne_taverne"].some((id) =>
            candidate.candidateKey.endsWith(id),
          ),
        )
        .every((candidate) => candidate.eligible),
    ).toBe(true);
    if (!decision.success) return;
    const selected = decision.trace.candidates.find(
      (candidate) =>
        candidate.candidateKey === decision.trace.selectedCandidateKey,
    );
    expect(selected?.eligible).toBe(true);
  });

  it("revalidates the selected intention against the current world", () => {
    const initial = createInitialWorldState("Yara");
    initial.entities.tariq = {
      ...initial.entities.tariq,
      hunger: 0,
      autonomyProfile: profile(),
    };
    const decision = decideAutonomousAction(inputFor(initial, "tariq"), {
      seed: "stale",
    });
    expect(decision.success).toBe(true);
    if (!decision.success) return;

    const changed = structuredClone(initial);
    delete changed.objects.pain_taverne;
    changed.entities.tariq.inventory = [];
    const resolved = resolveAction(changed, "tariq", decision.action, {
      createEventId: () => "stale-event",
    });
    expect(resolved).toMatchObject({
      success: false,
      failureCode: "TARGET_NOT_FOUND",
      newWorldState: changed,
    });
  });

  it("refuses an id-bound examination whose target disappeared", () => {
    const initial = createInitialWorldState("Yara");
    const input = inputFor(initial, "player");
    const inspectableObject = input.candidates.find(
      (candidate) =>
        candidate.action.actionType === "examine" &&
        candidate.targetId !== undefined &&
        initial.objects[candidate.targetId] !== undefined,
    );
    expect(inspectableObject).toBeDefined();
    if (!inspectableObject?.targetId) return;
    const decision = decideAutonomousAction(
      { ...input, candidates: [inspectableObject] },
      { seed: "stale-examine" },
    );
    expect(decision.success).toBe(true);
    if (!decision.success) return;

    const changed = structuredClone(initial);
    delete changed.objects[inspectableObject.targetId];
    const before = structuredClone(changed);
    const resolved = resolveAction(changed, "player", decision.action, {
      createEventId: () => "stale-examine",
    });
    expect(resolved).toMatchObject({
      success: false,
      failureCode: "TARGET_NOT_FOUND",
      newWorldState: changed,
    });
    expect(resolved.newWorldState.time).toEqual(before.time);
    expect(resolved.newWorldState.worldVersion).toBe(before.worldVersion);
    expect(changed).toEqual(before);
  });

  it("refuses an object assigned to a colocated owner without inventory index", () => {
    const initial = createInitialWorldState("Yara");
    const input = inputFor(initial, "tariq");
    const bread = input.candidates.find(
      (candidate) => candidate.candidateKey === "examine:pain_taverne",
    );
    expect(bread).toBeDefined();
    if (!bread) return;
    const decision = decideAutonomousAction(
      { ...input, candidates: [bread] },
      { seed: "ghost-owner" },
    );
    expect(decision.success).toBe(true);
    if (!decision.success) return;

    const changed = structuredClone(initial);
    changed.objects.pain_taverne = {
      ...changed.objects.pain_taverne,
      ownerId: "leila",
      locationId: null,
    };
    expect(changed.entities.leila.inventory).not.toContain("pain_taverne");
    const before = structuredClone(changed);
    const resolved = resolveAction(changed, "tariq", decision.action, {
      createEventId: () => "ghost-owner",
    });
    expect(resolved).toMatchObject({
      success: false,
      failureCode: "TARGET_NOT_FOUND",
      newWorldState: changed,
    });
    expect(changed).toEqual(before);
    expect(
      validateAction(
        changed,
        "tariq",
        {
          actionType: "take",
          targetName: "pain",
          details: "",
          rawInput: "",
        },
        "pain_taverne",
      ),
    ).toMatchObject({ possible: false, code: "TARGET_NOT_FOUND" });
  });

  it("never persists malformed autonomous metadata", () => {
    const state = createInitialWorldState("Yara");
    expect(
      resolveAction(
        state,
        "tariq",
        {
          actionType: "sleep",
          targetName: null,
          details: "",
          rawInput: "",
          autonomy: {
            intentKey: "",
            nextCommitmentTurns: 11,
            targetId: "",
            previousLocationId: "",
          },
        },
        { createEventId: () => "invalid-autonomy" },
      ),
    ).toMatchObject({
      success: false,
      failureCode: "INVALID_AUTONOMY_METADATA",
      newWorldState: state,
    });
  });

  it("refuses a targeted autonomous action without a canonical target", () => {
    const state = createInitialWorldState("Yara");
    expect(
      resolveAction(
        state,
        "player",
        {
          actionType: "move",
          targetName: "ferme",
          details: "",
          rawInput: "",
          autonomy: {
            intentKey: "move:ferme_oumou",
            nextCommitmentTurns: 2,
          },
        },
        { createEventId: () => "unbound-target" },
      ),
    ).toMatchObject({
      success: false,
      failureCode: "INVALID_AUTONOMY_METADATA",
      newWorldState: state,
    });
  });
});

describe("controlled determinism and anti-oscillation", () => {
  it("is identical for the same state and seed, including the full trace", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    expect(decideAutonomousAction(input, { seed: "fixed" })).toEqual(
      decideAutonomousAction(input, { seed: "fixed" }),
    );
  });

  it("is independent from record and local-list insertion order", () => {
    const first = createInitialWorldState("Yara");
    const second = structuredClone(first);
    second.locations = Object.fromEntries(
      Object.entries(second.locations).reverse(),
    );
    second.entities = Object.fromEntries(
      Object.entries(second.entities).reverse(),
    );
    second.objects = Object.fromEntries(
      Object.entries(second.objects).reverse(),
    );
    second.locations.place_centrale.connectedLocations.reverse();

    expect(
      decideAutonomousAction(inputFor(second, "player"), { seed: "order" }),
    ).toEqual(
      decideAutonomousAction(inputFor(first, "player"), { seed: "order" }),
    );
  });

  it("uses an explicit stable key tie-break when seed noise is disabled", () => {
    const state = createInitialWorldState("Yara");
    state.locations.place_centrale.presentObjects = [];
    state.entities.player = {
      ...state.entities.player,
      hunger: 100,
      fatigue: 100,
      autonomyProfile: profile(
        { curiosity: 100, ambition: 0, prudence: 0 },
        { kind: "EXPLORE", strength: 100 },
      ),
    };
    const result = decideAutonomousAction(inputFor(state, "player"), {
      seed: "tie",
      maxSeedNoise: 0,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.trace.selectedCandidateKey).toBe("move:ferme_oumou");
    expect(result.trace.tieBreak).toContain("candidateKey");
  });

  it("rejects duplicate stable keys even when their contents differ", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    const candidate = input.candidates.find(
      (entry) => entry.action.actionType === "move",
    );
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const result = decideAutonomousAction(
      {
        ...input,
        candidates: [
          candidate,
          {
            ...candidate,
            targetId: "different-target",
          },
        ],
      },
      { seed: "duplicate", maxSeedNoise: 0 },
    );
    expect(result).toMatchObject({
      success: false,
      code: "DUPLICATE_CANDIDATE_KEY",
      trace: { selectedCandidateKey: null },
    });
  });

  it.each([
    {
      targetId: undefined,
      expectedCode: "UNBOUND_TARGETED_CANDIDATE",
    },
    { targetId: "", expectedCode: "INVALID_AUTONOMY_IDENTITY" },
    { targetId: "   ", expectedCode: "INVALID_AUTONOMY_IDENTITY" },
  ] as const)(
    "rejects an unbound or non-canonical targeted candidate with target $targetId",
    ({ targetId, expectedCode }) => {
      const input = inputFor(createInitialWorldState("Yara"), "player");
      expect(
        decideAutonomousAction(
          {
            ...input,
            candidates: [
              {
                candidateKey: "move:unbound",
                action: {
                  actionType: "move",
                  targetName: "somewhere",
                  details: "",
                  rawInput: "",
                },
                ...(targetId === undefined ? {} : { targetId }),
                source: "CONNECTED_LOCATION",
                eligibility: { eligible: true },
              },
            ],
          },
          { seed: "unbound" },
        ),
      ).toMatchObject({
        success: false,
        code: expectedCode,
        trace: { selectedCandidateKey: null },
      });
    },
  );

  it("sorts equal-score candidate keys identically from reverse order", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    const moves = input.candidates
      .filter((entry) => entry.action.actionType === "move")
      .slice(0, 2);
    expect(moves).toHaveLength(2);
    const first = decideAutonomousAction(
      { ...input, candidates: moves },
      { seed: "reverse", maxSeedNoise: 0 },
    );
    const second = decideAutonomousAction(
      { ...input, candidates: [...moves].reverse() },
      { seed: "reverse", maxSeedNoise: 0 },
    );
    expect(second).toEqual(first);
  });

  it("excludes unsupported scoring models and reports no eligible action", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    const result = decideAutonomousAction(
      {
        ...input,
        candidates: [
          {
            candidateKey: "give:unsupported",
            action: {
              actionType: "give",
              targetName: "nobody",
              details: "",
              rawInput: "",
            },
            source: "INTRINSIC",
            eligibility: { eligible: true },
          },
          {
            candidateKey: "use:unsupported",
            action: {
              actionType: "use",
              targetName: "object",
              details: "",
              rawInput: "",
            },
            targetId: "object",
            source: "INTRINSIC",
            eligibility: { eligible: true },
          },
        ],
      },
      { seed: "unsupported" },
    );
    expect(result).toMatchObject({
      success: false,
      code: "NO_ELIGIBLE_ACTION",
      trace: {
        candidates: expect.arrayContaining([
          expect.objectContaining({
            eligible: false,
            exclusionReasons: ["NO_SCORING_MODEL"],
          }),
        ]),
      },
    });
  });

  it("reports no eligible action for an empty affordance set", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    expect(
      decideAutonomousAction(
        {
          ...input,
          candidates: [
            {
              candidateKey: "sleep:blocked",
              action: {
                actionType: "sleep",
                targetName: null,
                details: "",
                rawInput: "",
              },
              source: "INTRINSIC",
              eligibility: {
                eligible: false,
                code: "BLOCKED",
                reason: "Blocked for coverage of a defensive adapter result.",
              },
            },
          ],
        },
        { seed: "empty" },
      ),
    ).toMatchObject({
      success: false,
      code: "NO_ELIGIBLE_ACTION",
    });
  });

  it.each([
    { maxSeedNoise: -1 },
    { inertiaBonus: 10_001 },
    { commitmentTurns: 1.5 },
    { commitmentTurns: 11 },
  ])("rejects invalid bounded configuration %#", (invalid) => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    expect(() =>
      decideAutonomousAction(input, { seed: "invalid", ...invalid }),
    ).toThrow(RangeError);
  });

  it("allows bounded seed divergence only between credible close options", () => {
    const state = createInitialWorldState("Yara");
    state.entities.player = {
      ...state.entities.player,
      hunger: 100,
      fatigue: 100,
      autonomyProfile: profile(
        { curiosity: 80, ambition: 0, sociability: 0 },
        { kind: "EXPLORE", strength: 80 },
      ),
    };
    state.locations.place_centrale.presentObjects = [];

    const choices = new Set<string>();
    for (let seed = 0; seed < 100; seed += 1) {
      choices.add(selectedKey(state, "player", seed));
    }
    expect(choices.size).toBeGreaterThan(1);
    expect([...choices].every((key) => key.startsWith("move:"))).toBe(true);
  });

  it("keeps a close current intention but lets a vital need interrupt it", () => {
    const state = createInitialWorldState("Yara");
    state.entities.tariq = {
      ...state.entities.tariq,
      hunger: 100,
      fatigue: 100,
      autonomyProfile: profile({ sociability: 70, curiosity: 70 }),
      autonomyDecisionState: {
        intentKey: "speak:leila",
        remainingCommitmentTurns: 2,
      },
    };
    expect(selectedKey(state, "tariq", "stable")).toBe("speak:leila");

    state.entities.tariq = { ...state.entities.tariq, hunger: 0 };
    expect(selectedKey(state, "tariq", "stable")).toBe("eat:pain_taverne");
  });

  it("penalizes an immediate A-B-A reversal for otherwise close options", () => {
    const initial = createInitialWorldState("Yara");
    initial.entities.player = {
      ...initial.entities.player,
      hunger: 100,
      fatigue: 100,
      autonomyProfile: profile({
        curiosity: 20,
        ambition: 0,
        prudence: 100,
      }),
    };
    const firstInput = inputFor(initial, "player");
    const outward = firstInput.candidates.find(
      (candidate) => candidate.candidateKey === "move:ferme_oumou",
    );
    expect(outward).toBeDefined();
    if (!outward) return;
    const firstDecision = decideAutonomousAction(
      { ...firstInput, candidates: [outward] },
      { seed: "route", maxSeedNoise: 0, commitmentTurns: 2 },
    );
    expect(firstDecision.success).toBe(true);
    if (!firstDecision.success) return;
    const moved = resolveAction(initial, "player", firstDecision.action, {
      createEventId: () => "outward",
    });
    expect(moved.success).toBe(true);

    const secondInput = inputFor(moved.newWorldState, "player");
    const returnMove = secondInput.candidates.find(
      (candidate) => candidate.candidateKey === "move:place_centrale",
    );
    const sleep = secondInput.candidates.find(
      (candidate) => candidate.candidateKey === "sleep:self",
    );
    expect(returnMove).toBeDefined();
    expect(sleep).toBeDefined();
    if (!returnMove || !sleep) return;
    const secondDecision = decideAutonomousAction(
      { ...secondInput, candidates: [returnMove, sleep] },
      { seed: "route", maxSeedNoise: 0, commitmentTurns: 2 },
    );
    expect(secondDecision).toMatchObject({
      success: true,
      trace: { selectedCandidateKey: "sleep:self" },
    });
    expect(
      secondDecision.trace.candidates.find(
        (candidate) => candidate.candidateKey === "move:place_centrale",
      )?.reversalPenalty,
    ).toBeGreaterThan(0);
  });

  it("keeps every reachable score finite and bounded", () => {
    for (let value = 0; value <= 100; value += 10) {
      const state = createInitialWorldState("Yara");
      state.entities.tariq = {
        ...state.entities.tariq,
        hunger: value,
        fatigue: 100 - value,
        autonomyProfile: profile({
          prudence: value,
          sociability: 100 - value,
          ambition: value,
          curiosity: 100 - value,
          discipline: value,
        }),
      };
      const result = decideAutonomousAction(inputFor(state, "tariq"), {
        seed: value,
      });
      for (const candidate of result.trace.candidates) {
        if (candidate.finalScore === null) continue;
        expect(Number.isFinite(candidate.finalScore)).toBe(true);
        expect(candidate.finalScore).toBeGreaterThanOrEqual(0);
        expect(candidate.finalScore).toBeLessThanOrEqual(10_000);
      }
    }
  });
});

describe("lazy time and compatibility", () => {
  it("catches up an inactive actor before scoring without mutating the input", () => {
    const state = createInitialWorldState("Yara");
    state.entities.tariq = {
      ...state.entities.tariq,
      hunger: 100,
      fatigue: 100,
      autonomyProfile: profile({ sociability: 100 }),
    };
    state.time = advanceTime(state.time, 3 * 24 * 60);
    const before = structuredClone(state);

    const input = inputFor(state, "tariq");
    expect(input.actor.hunger).toBe(0);
    expect(selectedKey(state, "tariq", "catch-up")).toBe("eat:pain_taverne");
    expect(state).toEqual(before);
  });

  it("uses neutral defaults for legacy entities without new fields", () => {
    const state = createInitialWorldState("Yara");
    delete state.entities.hamid.autonomyProfile;
    delete state.entities.hamid.autonomyDecisionState;
    const input = inputFor(state, "hamid");
    expect(input.actor.profile.traits).toEqual({
      prudence: 50,
      sociability: 50,
      ambition: 50,
      curiosity: 50,
      discipline: 50,
    });
    expect(input.actor.previousDecision).toBeNull();
  });

  it("normalizes a legacy world time without an explicit minute", () => {
    const state = createInitialWorldState("Yara");
    delete state.time.minute;
    expect(inputFor(state, "hamid").actor.worldTime.minute).toBe(0);
  });

  it("preserves a fractional legacy world hour in the decision snapshot", () => {
    const state = createInitialWorldState("Yara");
    state.time.hour = 12.25;
    delete state.time.minute;
    expect(inputFor(state, "hamid").actor.worldTime).toMatchObject({
      hour: 12,
      minute: 15,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 101, 1.5])(
    "rejects invalid trait value %s",
    (invalid) => {
      const state = createInitialWorldState("Yara");
      state.entities.hamid.autonomyProfile = {
        ...profile(),
        traits: { ...profile().traits, curiosity: invalid },
      };
      expect(buildAutonomousDecisionInput(state, "hamid")).toMatchObject({
        success: false,
        code: "INVALID_AUTONOMY_STATE",
      });
    },
  );
});
