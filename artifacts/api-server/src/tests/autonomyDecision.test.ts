import { describe, expect, it } from "vitest";
import type { AutonomyProfile } from "../domain/autonomy.js";
import type { GameEvent } from "../domain/events.js";
import type { WorldState } from "../domain/world.js";
import {
  buildAutonomousDecisionInput,
  type AutonomousDecisionInput,
} from "../engine/autonomyContext.js";
import { decideAutonomousAction } from "../engine/autonomyDecision.js";
import { resolveAction } from "../engine/actionResolver.js";
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
    state.locations.taverne_du_loup.connectedLocations.push(
      "missing-location",
      "place_centrale",
    );
    state.locations.taverne_du_loup.presentEntities.push("missing-entity");
    state.locations.taverne_du_loup.presentObjects.push("missing-object");
    state.entities.tariq.inventory.push("missing-inventory-object");

    const input = inputFor(state, "tariq");
    expect(JSON.stringify(input.candidates)).not.toContain("missing-");
    expect(
      input.candidates.filter(
        (candidate) => candidate.candidateKey === "move:place_centrale",
      ),
    ).toHaveLength(2);
  });
});

describe("candidate credibility and utility", () => {
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

  it("records invalid visible drafts as exclusions instead of selecting them", () => {
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
      decision.trace.candidates.filter(
        (candidate) =>
          candidate.candidateKey.includes("lantern") ||
          candidate.candidateKey.includes("lanterne"),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eligible: false,
          exclusionReasons: [expect.stringContaining("TARGET_AMBIGUOUS")],
        }),
      ]),
    );
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

  it("keeps duplicate stable keys deterministic in defensive input", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    const candidate = input.candidates.find(
      (entry) => entry.action.actionType === "move",
    );
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const result = decideAutonomousAction(
      { ...input, candidates: [candidate, { ...candidate }] },
      { seed: "duplicate", maxSeedNoise: 0 },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.trace.selectedCandidateKey).toBe(candidate.candidateKey);
  });

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
        ],
      },
      { seed: "unsupported" },
    );
    expect(result).toMatchObject({
      success: false,
      code: "NO_ELIGIBLE_ACTION",
      trace: {
        candidates: [
          {
            eligible: false,
            exclusionReasons: ["NO_SCORING_MODEL"],
          },
        ],
      },
    });
  });

  it("reports no eligible action for an empty affordance set", () => {
    const input = inputFor(createInitialWorldState("Yara"), "player");
    expect(
      decideAutonomousAction({ ...input, candidates: [] }, { seed: "empty" }),
    ).toMatchObject({
      success: false,
      code: "NO_ELIGIBLE_ACTION",
    });
  });

  it.each([
    { maxSeedNoise: -1 },
    { inertiaBonus: 10_001 },
    { commitmentTurns: 1.5 },
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
