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
  source: CandidateSource;
  eligibility:
    { eligible: true } | { eligible: false; code: string; reason: string };
}

export interface AutonomousActorSnapshot {
  actorId: EntityId;
  actorName: string;
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
  | { success: true; input: AutonomousDecisionInput; activeState: WorldState }
  | {
      success: false;
      code: AutonomousContextFailureCode;
      reason: string;
    };

interface CandidateDraft {
  candidateKey: string;
  action: StructuredAction;
  source: CandidateSource;
}

function action(
  actionType: StructuredAction["actionType"],
  targetName: string | null,
): StructuredAction {
  return { actionType, targetName, details: "", rawInput: "" };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
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

  for (const locationId of [...location.connectedLocations].sort(compareText)) {
    const target = state.locations[locationId];
    if (!target) continue;
    drafts.push({
      candidateKey: `move:${target.id}`,
      action: action("move", target.name),
      source: "CONNECTED_LOCATION",
    });
  }

  for (const entityId of [...location.presentEntities].sort(compareText)) {
    if (entityId === actorId) continue;
    const target = state.entities[entityId];
    if (!target) continue;
    drafts.push({
      candidateKey: `speak:${target.id}`,
      action: action("speak", target.name),
      source: "PRESENT_ENTITY",
    });
  }

  for (const objectId of [...location.presentObjects].sort(compareText)) {
    const object = state.objects[objectId];
    if (!object) continue;
    drafts.push(
      {
        candidateKey: `take:${object.id}`,
        action: action("take", object.name),
        source: "PRESENT_OBJECT",
      },
      {
        candidateKey: `examine:${object.id}`,
        action: action("examine", object.name),
        source: "PRESENT_OBJECT",
      },
    );
  }

  for (const objectId of [...actor.inventory].sort(compareText)) {
    const object = state.objects[objectId];
    if (!object) continue;
    drafts.push(
      {
        candidateKey: `eat:${object.id}`,
        action: action("eat", object.name),
        source: "OWN_INVENTORY",
      },
      {
        candidateKey: `examine:${object.id}`,
        action: action("examine", object.name),
        source: "OWN_INVENTORY",
      },
    );
  }

  return drafts
    .sort((left, right) => compareText(left.candidateKey, right.candidateKey))
    .map((draft) => {
      const validation = validateAction(state, actorId, draft.action);
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
      activeState,
      input: {
        actor: {
          actorId,
          actorName: actor.name,
          hunger: actor.hunger ?? null,
          fatigue: actor.fatigue ?? null,
          health: actor.health ?? null,
          profile: resolveAutonomyProfile(actor.autonomyProfile),
          previousDecision: resolveAutonomyDecisionState(
            actor.autonomyDecisionState,
          ),
          worldTime: {
            ...activeState.time,
            minute: activeState.time.minute ?? 0,
          },
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
