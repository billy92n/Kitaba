import type { StructuredAction } from "../domain/actions.js";
import {
  resolveAutonomyDecisionState,
  resolveAutonomyProfile,
  type AutonomyDecisionState,
  type AutonomyProfile,
} from "../domain/autonomy.js";
import type { GameEvent } from "../domain/events.js";
import type { ActionOutcome } from "../domain/knowledge.js";
import type { Entity } from "../domain/entities.js";
import type {
  EntityId,
  WorldLocation,
  WorldState,
  WorldTime,
} from "../domain/world.js";
import { normalizeWorldTime } from "../domain/world.js";
import { validateAction } from "./actionValidator.js";
import { resolveObservedAction } from "./perceptionEngine.js";
import { catchUpEntity } from "./timeEngine.js";

export type CandidateSource =
  | "CONNECTED_LOCATION"
  | "PRESENT_ENTITY"
  | "PRESENT_OBJECT"
  | "OWN_INVENTORY"
  | "INTRINSIC";

export interface PreparedAutonomousCandidate {
  candidateKey: string;
  action: StructuredAction;
  targetId?: string;
  source: CandidateSource;
  eligibility:
    { eligible: true } | { eligible: false; code: string; reason: string };
}

export interface AutonomousActorSnapshot {
  actorId: EntityId;
  actorName: string;
  locationId: string;
  hunger: number | null;
  fatigue: number | null;
  health: number | null;
  profile: AutonomyProfile;
  previousDecision: AutonomyDecisionState | null;
  worldTime: Required<WorldTime>;
  observedAction: ActionOutcome | null;
}

export interface AutonomousDecisionInput {
  actor: AutonomousActorSnapshot;
  candidates: PreparedAutonomousCandidate[];
}

export type AutonomousContextFailureCode =
  "ACTOR_NOT_FOUND" | "ACTOR_LOCATION_NOT_FOUND" | "INVALID_AUTONOMY_STATE";

export type AutonomousContextResult =
  | { success: true; input: AutonomousDecisionInput }
  | {
      success: false;
      code: AutonomousContextFailureCode;
      reason: string;
    };

interface CandidateDraft {
  candidateKey: string;
  action: StructuredAction;
  targetId?: string;
  source: CandidateSource;
}

function action(
  actionType: StructuredAction["actionType"],
  targetName: string | null,
): StructuredAction {
  return { actionType, targetName, details: "", rawInput: "" };
}

function compareText(left: string, right: string): number {
  return Number(left > right) - Number(left < right);
}

function prepareCandidates(
  state: WorldState,
  actorId: EntityId,
  actor: Entity,
  location: WorldLocation,
): PreparedAutonomousCandidate[] {
  const drafts: CandidateDraft[] = [
    {
      candidateKey: "sleep:self",
      action: action("sleep", null),
      source: "INTRINSIC",
    },
  ];

  for (const locationId of [...new Set(location.connectedLocations)].sort(
    compareText,
  )) {
    const target = state.locations[locationId];
    if (!target) continue;
    drafts.push({
      candidateKey: `move:${target.id}`,
      action: action("move", target.name),
      targetId: target.id,
      source: "CONNECTED_LOCATION",
    });
  }

  for (const entityId of [...new Set(location.presentEntities)].sort(
    compareText,
  )) {
    if (entityId === actorId) continue;
    const target = state.entities[entityId];
    if (!target || target.locationId !== actor.locationId) continue;
    drafts.push({
      candidateKey: `speak:${target.id}`,
      action: action("speak", target.name),
      targetId: target.id,
      source: "PRESENT_ENTITY",
    });
  }

  for (const objectId of [...new Set(location.presentObjects)].sort(
    compareText,
  )) {
    const object = state.objects[objectId];
    if (
      !object ||
      object.locationId !== actor.locationId ||
      object.ownerId !== null
    ) {
      continue;
    }
    drafts.push(
      {
        candidateKey: `take:${object.id}`,
        action: action("take", object.name),
        targetId: object.id,
        source: "PRESENT_OBJECT",
      },
      {
        candidateKey: `examine:${object.id}`,
        action: action("examine", object.name),
        targetId: object.id,
        source: "PRESENT_OBJECT",
      },
    );
  }

  for (const objectId of [...new Set(actor.inventory)].sort(compareText)) {
    const object = state.objects[objectId];
    if (!object || object.ownerId !== actorId) continue;
    drafts.push(
      {
        candidateKey: `eat:${object.id}`,
        action: action("eat", object.name),
        targetId: object.id,
        source: "OWN_INVENTORY",
      },
      {
        candidateKey: `examine:${object.id}`,
        action: action("examine", object.name),
        targetId: object.id,
        source: "OWN_INVENTORY",
      },
    );
  }

  return drafts
    .sort((left, right) => compareText(left.candidateKey, right.candidateKey))
    .map((draft) => {
      const validation = validateAction(
        state,
        actorId,
        draft.action,
        draft.targetId,
      );
      return {
        ...draft,
        eligibility: validation.possible
          ? { eligible: true as const }
          : {
              eligible: false as const,
              code: validation.code,
              reason: validation.reason,
            },
      };
    });
}

export function buildAutonomousDecisionInput(
  state: WorldState,
  actorId: EntityId,
  observedEvent?: GameEvent,
): AutonomousContextResult {
  const storedActor = state.entities[actorId];
  if (!storedActor) {
    return {
      success: false,
      code: "ACTOR_NOT_FOUND",
      reason: `Actor not found: ${actorId}.`,
    };
  }
  if (!state.locations[storedActor.locationId]) {
    return {
      success: false,
      code: "ACTOR_LOCATION_NOT_FOUND",
      reason: `Actor ${actorId} has no valid location.`,
    };
  }

  try {
    const actor = catchUpEntity(storedActor, state.time);
    const activeState =
      actor === storedActor
        ? state
        : {
            ...state,
            entities: { ...state.entities, [actorId]: actor },
          };
    return {
      success: true,
      input: {
        actor: {
          actorId,
          actorName: actor.name,
          locationId: actor.locationId,
          hunger: actor.hunger ?? null,
          fatigue: actor.fatigue ?? null,
          health: actor.health ?? null,
          profile: resolveAutonomyProfile(actor.autonomyProfile),
          previousDecision: resolveAutonomyDecisionState(
            actor.autonomyDecisionState,
          ),
          worldTime: normalizeWorldTime(activeState.time),
          observedAction: observedEvent
            ? resolveObservedAction(activeState, actorId, observedEvent)
            : null,
        },
        candidates: prepareCandidates(
          activeState,
          actorId,
          actor,
          activeState.locations[actor.locationId],
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      code: "INVALID_AUTONOMY_STATE",
      reason: String(error),
    };
  }
}
