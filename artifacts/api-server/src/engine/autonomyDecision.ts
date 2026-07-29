import type { StructuredAction } from "../domain/actions.js";
import {
  MAX_COMMITMENT_TURNS,
  type PersistentGoalKind,
} from "../domain/autonomy.js";
import type {
  AutonomousDecisionInput,
  PreparedAutonomousCandidate,
} from "./autonomyContext.js";

const SCORE_MAX = 10_000;
const CRITICAL_URGENCY = 8_500;
const DEFAULT_SEED_NOISE = 120;
const DEFAULT_INERTIA_BONUS = 600;
const DEFAULT_COMMITMENT_TURNS = 2;

export interface UtilityConsideration {
  name: string;
  value: number;
  weight: number;
}

export interface AutonomousCandidateTrace {
  candidateKey: string;
  action: StructuredAction;
  targetId?: string;
  source: PreparedAutonomousCandidate["source"];
  eligible: boolean;
  exclusionReasons: string[];
  priority: "CRITICAL" | "NORMAL" | "EXCLUDED";
  considerations: UtilityConsideration[];
  baseScore: number | null;
  inertiaBonus: number;
  reversalPenalty: number;
  seedNoise: number;
  finalScore: number | null;
}

export interface AutonomousDecisionTrace {
  actorId: string;
  seed: string;
  candidates: AutonomousCandidateTrace[];
  selectedCandidateKey: string | null;
  tieBreak: string;
  reason: string;
}

export type AutonomousDecisionResult =
  | {
      success: true;
      action: StructuredAction;
      trace: AutonomousDecisionTrace;
    }
  | {
      success: false;
      code: "NO_ELIGIBLE_ACTION" | "DUPLICATE_CANDIDATE_KEY";
      trace: AutonomousDecisionTrace;
    };

export interface AutonomousDecisionConfig {
  seed: string | number;
  maxSeedNoise?: number;
  inertiaBonus?: number;
  commitmentTurns?: number;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(SCORE_MAX, Math.trunc(value)));
}

function satisfaction(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return SCORE_MAX;
  return clampScore(Math.round(value * 100));
}

function urgency(value: number | null): number {
  return SCORE_MAX - satisfaction(value);
}

function trait(value: number): number {
  return clampScore(value * 100);
}

function goalScore(
  actual: PersistentGoalKind,
  expected: PersistentGoalKind,
  strength: number,
): number {
  return actual === expected ? trait(strength) : 0;
}

function weightedScore(considerations: UtilityConsideration[]): number {
  const totalWeight = considerations.reduce(
    (total, consideration) => total + consideration.weight,
    0,
  );
  const weighted = considerations.reduce(
    (total, consideration) =>
      total + clampScore(consideration.value) * consideration.weight,
    0,
  );
  return clampScore(Math.round(weighted / totalWeight));
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deterministicNoise(
  seed: string,
  candidateKey: string,
  maximum: number,
): number {
  if (maximum === 0) return 0;
  const width = maximum * 2 + 1;
  return (hash32(`${seed}\u0000${candidateKey}`) % width) - maximum;
}

function compareText(left: string, right: string): number {
  return Number(left > right) - Number(left < right);
}

function considerationsFor(
  input: AutonomousDecisionInput,
  candidate: PreparedAutonomousCandidate,
): UtilityConsideration[] {
  const { traits, persistentGoal } = input.actor.profile;
  const actionType = candidate.action.actionType;
  if (
    actionType === "unknown" ||
    actionType === "give" ||
    actionType === "attack" ||
    actionType === "use"
  ) {
    return [];
  }
  switch (actionType) {
    case "eat":
      return [
        {
          name: "hungerUrgency",
          value: urgency(input.actor.hunger),
          weight: 7,
        },
        { name: "discipline", value: trait(traits.discipline), weight: 1 },
        {
          name: "persistentRestGoal",
          value: goalScore(
            persistentGoal.kind,
            "REST",
            persistentGoal.strength,
          ),
          weight: 2,
        },
      ];
    case "sleep":
      return [
        {
          name: "fatigueUrgency",
          value: urgency(input.actor.fatigue),
          weight: 7,
        },
        { name: "prudence", value: trait(traits.prudence), weight: 1 },
        {
          name: "persistentRestGoal",
          value: goalScore(
            persistentGoal.kind,
            "REST",
            persistentGoal.strength,
          ),
          weight: 2,
        },
      ];
    case "speak":
      return [
        { name: "sociability", value: trait(traits.sociability), weight: 7 },
        {
          name: "persistentSocialGoal",
          value: goalScore(
            persistentGoal.kind,
            "SOCIALIZE",
            persistentGoal.strength,
          ),
          weight: 3,
        },
      ];
    case "move":
      return [
        { name: "curiosity", value: trait(traits.curiosity), weight: 5 },
        { name: "ambition", value: trait(traits.ambition), weight: 2 },
        {
          name: "persistentExploreGoal",
          value: goalScore(
            persistentGoal.kind,
            "EXPLORE",
            persistentGoal.strength,
          ),
          weight: 3,
        },
      ];
    case "examine":
      return [
        { name: "curiosity", value: trait(traits.curiosity), weight: 7 },
        { name: "discipline", value: trait(traits.discipline), weight: 1 },
        {
          name: "persistentExploreGoal",
          value: goalScore(
            persistentGoal.kind,
            "EXPLORE",
            persistentGoal.strength,
          ),
          weight: 2,
        },
      ];
    case "take":
      return [
        { name: "ambition", value: trait(traits.ambition), weight: 6 },
        { name: "curiosity", value: trait(traits.curiosity), weight: 2 },
        {
          name: "persistentAcquireGoal",
          value: goalScore(
            persistentGoal.kind,
            "ACQUIRE",
            persistentGoal.strength,
          ),
          weight: 2,
        },
      ];
  }
}

function priorityFor(
  input: AutonomousDecisionInput,
  actionType: StructuredAction["actionType"],
): "CRITICAL" | "NORMAL" {
  if (actionType === "eat" && urgency(input.actor.hunger) >= CRITICAL_URGENCY) {
    return "CRITICAL";
  }
  if (
    actionType === "sleep" &&
    urgency(input.actor.fatigue) >= CRITICAL_URGENCY
  ) {
    return "CRITICAL";
  }
  return "NORMAL";
}

function boundedConfiguration(
  value: number | undefined,
  fallback: number,
  maximum = SCORE_MAX,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError("Autonomous decision configuration is out of bounds.");
  }
  return value;
}

export function decideAutonomousAction(
  input: AutonomousDecisionInput,
  config: AutonomousDecisionConfig,
): AutonomousDecisionResult {
  const seed = String(config.seed);
  const maxSeedNoise = boundedConfiguration(
    config.maxSeedNoise,
    DEFAULT_SEED_NOISE,
  );
  const inertiaValue = boundedConfiguration(
    config.inertiaBonus,
    DEFAULT_INERTIA_BONUS,
  );
  const commitmentTurns = boundedConfiguration(
    config.commitmentTurns,
    DEFAULT_COMMITMENT_TURNS,
    MAX_COMMITMENT_TURNS,
  );

  const orderedCandidates = [...input.candidates].sort((left, right) =>
    compareText(left.candidateKey, right.candidateKey),
  );
  const duplicateKeys = orderedCandidates
    .filter(
      (candidate, index) =>
        index > 0 &&
        candidate.candidateKey === orderedCandidates[index - 1]?.candidateKey,
    )
    .map((candidate) => candidate.candidateKey);
  if (duplicateKeys.length > 0) {
    return {
      success: false,
      code: "DUPLICATE_CANDIDATE_KEY",
      trace: {
        actorId: input.actor.actorId,
        seed,
        candidates: [],
        selectedCandidateKey: null,
        tieBreak: "Duplicate candidate keys are rejected.",
        reason: `Duplicate candidate keys: ${[...new Set(duplicateKeys)].join(
          ", ",
        )}.`,
      },
    };
  }

  const traces = orderedCandidates.map(
    (candidate): AutonomousCandidateTrace => {
      if (!candidate.eligibility.eligible) {
        return {
          candidateKey: candidate.candidateKey,
          action: candidate.action,
          ...(candidate.targetId === undefined
            ? {}
            : { targetId: candidate.targetId }),
          source: candidate.source,
          eligible: false,
          exclusionReasons: [
            `${candidate.eligibility.code}: ${candidate.eligibility.reason}`,
          ],
          priority: "EXCLUDED",
          considerations: [],
          baseScore: null,
          inertiaBonus: 0,
          reversalPenalty: 0,
          seedNoise: 0,
          finalScore: null,
        };
      }
      const considerations = considerationsFor(input, candidate);
      if (considerations.length === 0) {
        return {
          candidateKey: candidate.candidateKey,
          action: candidate.action,
          ...(candidate.targetId === undefined
            ? {}
            : { targetId: candidate.targetId }),
          source: candidate.source,
          eligible: false,
          exclusionReasons: ["NO_SCORING_MODEL"],
          priority: "EXCLUDED",
          considerations: [],
          baseScore: null,
          inertiaBonus: 0,
          reversalPenalty: 0,
          seedNoise: 0,
          finalScore: null,
        };
      }
      const priority = priorityFor(input, candidate.action.actionType);
      const baseScore = weightedScore(considerations);
      const inertiaBonus =
        priority === "NORMAL" &&
        input.actor.previousDecision?.intentKey === candidate.candidateKey &&
        input.actor.previousDecision.remainingCommitmentTurns > 0
          ? inertiaValue
          : 0;
      const reversalPenalty =
        priority === "NORMAL" &&
        candidate.action.actionType === "move" &&
        candidate.targetId !== undefined &&
        input.actor.previousDecision?.intentKey.startsWith("move:") === true &&
        input.actor.previousDecision.previousLocationId ===
          candidate.targetId &&
        input.actor.previousDecision.remainingCommitmentTurns > 0
          ? inertiaValue
          : 0;
      const seedNoise =
        priority === "NORMAL"
          ? deterministicNoise(seed, candidate.candidateKey, maxSeedNoise)
          : 0;
      return {
        candidateKey: candidate.candidateKey,
        action: candidate.action,
        ...(candidate.targetId === undefined
          ? {}
          : { targetId: candidate.targetId }),
        source: candidate.source,
        eligible: true,
        exclusionReasons: [],
        priority,
        considerations,
        baseScore,
        inertiaBonus,
        reversalPenalty,
        seedNoise,
        finalScore: clampScore(
          baseScore + inertiaBonus + seedNoise - reversalPenalty,
        ),
      };
    },
  );

  const eligible = traces.filter(
    (trace): trace is AutonomousCandidateTrace & { finalScore: number } =>
      trace.eligible && trace.finalScore !== null,
  );
  const critical = eligible.filter((trace) => trace.priority === "CRITICAL");
  const contenders = critical.length > 0 ? critical : eligible;
  contenders.sort(
    (left, right) =>
      right.finalScore - left.finalScore ||
      compareText(left.candidateKey, right.candidateKey),
  );
  const selected = contenders[0];
  if (!selected) {
    return {
      success: false,
      code: "NO_ELIGIBLE_ACTION",
      trace: {
        actorId: input.actor.actorId,
        seed,
        candidates: traces,
        selectedCandidateKey: null,
        tieBreak: "No eligible candidate.",
        reason: "Every generated candidate was excluded.",
      },
    };
  }

  const previous = input.actor.previousDecision;
  const nextCommitmentTurns =
    previous?.intentKey === selected.candidateKey
      ? Math.max(0, previous.remainingCommitmentTurns - 1)
      : commitmentTurns;
  const tied = contenders.filter(
    (trace) => trace.finalScore === selected.finalScore,
  );
  return {
    success: true,
    action: {
      ...selected.action,
      autonomy: {
        intentKey: selected.candidateKey,
        nextCommitmentTurns,
        ...(selected.targetId === undefined
          ? {}
          : { targetId: selected.targetId }),
        ...(selected.action.actionType === "move"
          ? { previousLocationId: input.actor.locationId }
          : {}),
      },
    },
    trace: {
      actorId: input.actor.actorId,
      seed,
      candidates: traces,
      selectedCandidateKey: selected.candidateKey,
      tieBreak:
        tied.length > 1
          ? `Equal scores resolved by candidateKey: ${tied
              .map((trace) => trace.candidateKey)
              .sort(compareText)
              .join(", ")}.`
          : "Highest bounded utility score.",
      reason:
        selected.priority === "CRITICAL"
          ? "A critical need excludes normal-priority alternatives."
          : "Selected among normal-priority eligible candidates.",
    },
  };
}
