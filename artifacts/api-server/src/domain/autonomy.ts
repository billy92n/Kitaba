export const TRAIT_NAMES = [
  "prudence",
  "sociability",
  "ambition",
  "curiosity",
  "discipline",
] as const;

export type TraitName = (typeof TRAIT_NAMES)[number];

export const PERSISTENT_GOAL_KINDS = [
  "NONE",
  "EXPLORE",
  "SOCIALIZE",
  "REST",
  "ACQUIRE",
] as const;

export type PersistentGoalKind = (typeof PERSISTENT_GOAL_KINDS)[number];

export interface AutonomyProfile {
  /** Integer scale from 0 (absent) to 100 (dominant). */
  traits: Record<TraitName, number>;
  persistentGoal: {
    kind: PersistentGoalKind;
    /** Integer strength from 0 to 100. */
    strength: number;
  };
}

export interface AutonomyDecisionState {
  intentKey: string;
  /** Number of future decisions receiving the bounded inertia bonus. */
  remainingCommitmentTurns: number;
}

export interface AutonomousActionMetadata {
  intentKey: string;
  nextCommitmentTurns: number;
}

export const DEFAULT_AUTONOMY_PROFILE: AutonomyProfile = {
  traits: {
    prudence: 50,
    sociability: 50,
    ambition: 50,
    curiosity: 50,
    discipline: 50,
  },
  persistentGoal: { kind: "NONE", strength: 0 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPersistentGoalKind(value: unknown): value is PersistentGoalKind {
  return PERSISTENT_GOAL_KINDS.some((kind) => kind === value);
}

function boundedInteger(
  value: unknown,
  label: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new RangeError(`${label} must be an integer between 0 and 100.`);
  }
  return value;
}

export function resolveAutonomyProfile(value: unknown): AutonomyProfile {
  if (value === undefined) {
    return {
      traits: { ...DEFAULT_AUTONOMY_PROFILE.traits },
      persistentGoal: { ...DEFAULT_AUTONOMY_PROFILE.persistentGoal },
    };
  }
  if (!isRecord(value)) {
    throw new TypeError("autonomyProfile must be an object.");
  }

  const traitsValue = value.traits;
  if (traitsValue !== undefined && !isRecord(traitsValue)) {
    throw new TypeError("autonomyProfile.traits must be an object.");
  }
  const traitsRecord = isRecord(traitsValue) ? traitsValue : {};
  const traits: Record<TraitName, number> = {
    prudence: boundedInteger(
      traitsRecord.prudence,
      "autonomyProfile.traits.prudence",
      DEFAULT_AUTONOMY_PROFILE.traits.prudence,
    ),
    sociability: boundedInteger(
      traitsRecord.sociability,
      "autonomyProfile.traits.sociability",
      DEFAULT_AUTONOMY_PROFILE.traits.sociability,
    ),
    ambition: boundedInteger(
      traitsRecord.ambition,
      "autonomyProfile.traits.ambition",
      DEFAULT_AUTONOMY_PROFILE.traits.ambition,
    ),
    curiosity: boundedInteger(
      traitsRecord.curiosity,
      "autonomyProfile.traits.curiosity",
      DEFAULT_AUTONOMY_PROFILE.traits.curiosity,
    ),
    discipline: boundedInteger(
      traitsRecord.discipline,
      "autonomyProfile.traits.discipline",
      DEFAULT_AUTONOMY_PROFILE.traits.discipline,
    ),
  };

  const goalValue = value.persistentGoal;
  if (goalValue !== undefined && !isRecord(goalValue)) {
    throw new TypeError("autonomyProfile.persistentGoal must be an object.");
  }
  const goalRecord = isRecord(goalValue) ? goalValue : {};
  const kindValue =
    goalRecord.kind ?? DEFAULT_AUTONOMY_PROFILE.persistentGoal.kind;
  if (!isPersistentGoalKind(kindValue)) {
    throw new RangeError("autonomyProfile.persistentGoal.kind is invalid.");
  }

  return {
    traits,
    persistentGoal: {
      kind: kindValue,
      strength: boundedInteger(
        goalRecord.strength,
        "autonomyProfile.persistentGoal.strength",
        kindValue === "NONE" ? 0 : 50,
      ),
    },
  };
}

export function resolveAutonomyDecisionState(
  value: unknown,
): AutonomyDecisionState | null {
  if (value === undefined) return null;
  if (
    !isRecord(value) ||
    typeof value.intentKey !== "string" ||
    value.intentKey.length === 0 ||
    typeof value.remainingCommitmentTurns !== "number" ||
    !Number.isInteger(value.remainingCommitmentTurns) ||
    value.remainingCommitmentTurns < 0 ||
    value.remainingCommitmentTurns > 10
  ) {
    throw new TypeError("autonomyDecisionState is invalid.");
  }
  return {
    intentKey: value.intentKey,
    remainingCommitmentTurns: value.remainingCommitmentTurns,
  };
}
