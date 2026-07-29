import {
  actionRequiresCanonicalTarget,
  type StructuredAction,
} from "../domain/actions.js";
import { resolveAutonomousActionMetadata } from "../domain/autonomy.js";
import type { Entity } from "../domain/entities.js";
import type {
  EntityId,
  WorldLocation,
  WorldObject,
  WorldState,
} from "../domain/world.js";
import {
  findEntityAtLocation,
  findInspectable,
  findLocationByQuery,
  resolveObjectInActorContext,
  type ObjectAvailability,
  type ResolvedInspectable,
} from "./targetResolution.js";

export type ActionFailureCode =
  | "ACTOR_NOT_FOUND"
  | "ACTOR_LOCATION_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "TARGET_AMBIGUOUS"
  | "OBJECT_NOT_EDIBLE"
  | "INVALID_AUTONOMY_METADATA"
  | "ACTION_NOT_IMPLEMENTED"
  | "ACTION_NOT_ALLOWED";

export interface ActionFailure {
  possible: false;
  code: ActionFailureCode;
  reason: string;
  actor: Entity | null;
  candidateIds?: string[];
}

interface BaseContext {
  actor: Entity;
  location: WorldLocation;
  action: StructuredAction;
}

export type ValidatedActionContext =
  | (BaseContext & { kind: "MOVE"; target: WorldLocation })
  | (BaseContext & { kind: "SPEAK"; target: Entity })
  | (BaseContext & {
      kind: "TAKE" | "EAT";
      target: WorldObject;
      availability: ObjectAvailability;
    })
  | (BaseContext & { kind: "EXAMINE"; target: ResolvedInspectable | null })
  | (BaseContext & { kind: "SLEEP"; target: null });

export interface ActionValidationSuccess {
  possible: true;
  context: ValidatedActionContext;
}

export type ValidationResult = ActionValidationSuccess | ActionFailure;

function fail(
  code: ActionFailureCode,
  reason: string,
  actor: Entity | null,
  candidateIds?: string[],
): ActionFailure {
  return { possible: false, code, reason, actor, candidateIds };
}

function ambiguous(actor: Entity, candidateIds: string[]): ActionFailure {
  return fail(
    "TARGET_AMBIGUOUS",
    "La cible demandée est ambiguë.",
    actor,
    candidateIds,
  );
}

function exactObjectAvailability(
  state: WorldState,
  actor: Entity,
  targetId: string,
): { object: WorldObject; availability: ObjectAvailability } | null {
  const object = state.objects[targetId];
  if (!object) return null;
  if (object.ownerId === actor.id && actor.inventory.includes(object.id)) {
    return { object, availability: "ACTOR_INVENTORY" };
  }
  if (
    object.ownerId === null &&
    object.locationId === actor.locationId &&
    state.locations[actor.locationId]?.presentObjects.includes(object.id)
  ) {
    return { object, availability: "GROUND" };
  }
  if (
    object.ownerId !== null &&
    object.ownerId !== actor.id &&
    state.entities[object.ownerId]?.locationId === actor.locationId &&
    state.entities[object.ownerId]?.inventory.includes(object.id) === true
  ) {
    return { object, availability: "OTHER_INVENTORY" };
  }
  return null;
}

function exactInspectable(
  state: WorldState,
  actor: Entity,
  targetId: string,
): ResolvedInspectable | null {
  const object = exactObjectAvailability(state, actor, targetId);
  if (object) {
    return {
      kind: "OBJECT",
      id: object.object.id,
      name: object.object.name,
      description: object.object.description,
    };
  }
  const entity = state.entities[targetId];
  if (
    entity &&
    entity.id !== actor.id &&
    entity.locationId === actor.locationId &&
    state.locations[actor.locationId]?.presentEntities.includes(entity.id)
  ) {
    return {
      kind: "ENTITY",
      id: entity.id,
      name: entity.name,
      description: entity.description,
    };
  }
  const location = state.locations[targetId];
  if (
    location &&
    (location.id === actor.locationId ||
      state.locations[actor.locationId]?.connectedLocations.includes(
        location.id,
      ))
  ) {
    return {
      kind: "LOCATION",
      id: location.id,
      name: location.name,
      description: location.description,
    };
  }
  return null;
}

export function validateAction(
  state: WorldState,
  actorId: EntityId,
  action: StructuredAction,
  resolvedTargetId?: string,
): ValidationResult {
  const actor = state.entities[actorId];
  if (!actor)
    return fail("ACTOR_NOT_FOUND", `Acteur introuvable : ${actorId}.`, null);
  const location = state.locations[actor.locationId];
  if (!location) {
    return fail(
      "ACTOR_LOCATION_NOT_FOUND",
      `L'acteur ${actorId} n'a pas de lieu valide.`,
      actor,
    );
  }
  const base = { actor, location, action };
  if (action.autonomy !== undefined) {
    try {
      resolveAutonomousActionMetadata(action.autonomy);
    } catch {
      return fail(
        "INVALID_AUTONOMY_METADATA",
        "Autonomous action metadata is invalid.",
        actor,
      );
    }
    if (
      actionRequiresCanonicalTarget(action.actionType) &&
      action.autonomy.targetId === undefined
    ) {
      return fail(
        "INVALID_AUTONOMY_METADATA",
        "A targeted autonomous action requires a canonical target.",
        actor,
      );
    }
  }

  switch (action.actionType) {
    case "move": {
      const target =
        resolvedTargetId !== undefined
          ? state.locations[resolvedTargetId]
            ? {
                status: "FOUND" as const,
                target: state.locations[resolvedTargetId],
              }
            : { status: "MISSING" as const }
          : findLocationByQuery(state, action.targetName);
      if (target.status === "MISSING") {
        return fail(
          "TARGET_NOT_FOUND",
          `Vous ne savez pas comment aller à "${action.targetName ?? "?"}".`,
          actor,
        );
      }
      if (target.status === "AMBIGUOUS") {
        return ambiguous(actor, target.candidateIds);
      }
      if (target.target.id === actor.locationId) {
        return fail(
          "ACTION_NOT_ALLOWED",
          `Vous êtes déjà à ${target.target.name}.`,
          actor,
        );
      }
      if (!location.connectedLocations.includes(target.target.id)) {
        return fail(
          "ACTION_NOT_ALLOWED",
          `${target.target.name} n'est pas directement accessible depuis ${location.name}.`,
          actor,
        );
      }
      return {
        possible: true,
        context: { ...base, kind: "MOVE", target: target.target },
      };
    }
    case "speak": {
      if (!action.targetName) {
        return fail("TARGET_NOT_FOUND", "À qui voulez-vous parler ?", actor);
      }
      const exactTarget =
        resolvedTargetId !== undefined
          ? state.entities[resolvedTargetId]
          : undefined;
      const target =
        resolvedTargetId !== undefined
          ? exactTarget &&
            exactTarget.id !== actorId &&
            exactTarget.locationId === actor.locationId &&
            location.presentEntities.includes(exactTarget.id)
            ? { status: "FOUND" as const, target: exactTarget }
            : { status: "MISSING" as const }
          : findEntityAtLocation(
              state,
              actorId,
              actor.locationId,
              action.targetName,
            );
      if (target.status === "AMBIGUOUS") {
        return ambiguous(actor, target.candidateIds);
      }
      return target.status === "FOUND"
        ? {
            possible: true,
            context: { ...base, kind: "SPEAK", target: target.target },
          }
        : fail(
            "TARGET_NOT_FOUND",
            `Personne du nom de "${action.targetName}" n'est ici.`,
            actor,
          );
    }
    case "take": {
      const exactTarget =
        resolvedTargetId !== undefined
          ? exactObjectAvailability(state, actor, resolvedTargetId)
          : null;
      const resolved =
        resolvedTargetId !== undefined
          ? exactTarget
            ? { status: "FOUND" as const, target: exactTarget }
            : { status: "MISSING" as const }
          : resolveObjectInActorContext(state, actorId, action.targetName);
      if (resolved.status === "MISSING") {
        return fail(
          "TARGET_NOT_FOUND",
          `Vous ne voyez pas "${action.targetName ?? "cet objet"}" ici.`,
          actor,
        );
      }
      if (resolved.status === "AMBIGUOUS") {
        return ambiguous(actor, resolved.candidateIds);
      }
      if (resolved.target.availability === "ACTOR_INVENTORY") {
        return fail(
          "ACTION_NOT_ALLOWED",
          `Vous avez déjà ${resolved.target.object.name} dans vos affaires.`,
          actor,
        );
      }
      return {
        possible: true,
        context: {
          ...base,
          kind: "TAKE",
          target: resolved.target.object,
          availability: resolved.target.availability,
        },
      };
    }
    case "examine": {
      const exactTarget =
        resolvedTargetId !== undefined
          ? exactInspectable(state, actor, resolvedTargetId)
          : null;
      const target =
        resolvedTargetId !== undefined
          ? exactTarget
            ? { status: "FOUND" as const, target: exactTarget }
            : { status: "MISSING" as const }
          : findInspectable(state, actorId, action.targetName);
      if (target.status === "AMBIGUOUS") {
        return ambiguous(actor, target.candidateIds);
      }
      if (resolvedTargetId !== undefined && target.status === "MISSING") {
        return fail(
          "TARGET_NOT_FOUND",
          `La cible inspectable "${action.targetName ?? resolvedTargetId}" n'est plus accessible.`,
          actor,
        );
      }
      return {
        possible: true,
        context: {
          ...base,
          kind: "EXAMINE",
          target: target.status === "FOUND" ? target.target : null,
        },
      };
    }
    case "eat": {
      const exactTarget =
        resolvedTargetId !== undefined
          ? exactObjectAvailability(state, actor, resolvedTargetId)
          : null;
      const resolved =
        resolvedTargetId !== undefined
          ? exactTarget
            ? { status: "FOUND" as const, target: exactTarget }
            : { status: "MISSING" as const }
          : resolveObjectInActorContext(state, actorId, action.targetName);
      if (resolved.status === "MISSING") {
        return fail(
          "TARGET_NOT_FOUND",
          `Vous n'avez pas "${action.targetName ?? "de quoi manger"}" sur vous.`,
          actor,
        );
      }
      if (resolved.status === "AMBIGUOUS") {
        return ambiguous(actor, resolved.candidateIds);
      }
      if (resolved.target.availability !== "ACTOR_INVENTORY") {
        return fail(
          "ACTION_NOT_ALLOWED",
          `${resolved.target.object.name} ne vous appartient pas.`,
          actor,
        );
      }
      if (resolved.target.object.properties.edible !== true) {
        return fail(
          "OBJECT_NOT_EDIBLE",
          `${resolved.target.object.name} n'est pas comestible.`,
          actor,
        );
      }
      return {
        possible: true,
        context: {
          ...base,
          kind: "EAT",
          target: resolved.target.object,
          availability: resolved.target.availability,
        },
      };
    }
    case "sleep":
      return {
        possible: true,
        context: { ...base, kind: "SLEEP", target: null },
      };
    case "give":
    case "use":
      return fail(
        "ACTION_NOT_IMPLEMENTED",
        `L'action ${action.actionType} n'est pas encore implémentée.`,
        actor,
      );
    case "attack":
      return fail(
        "ACTION_NOT_ALLOWED",
        "La violence n'est pas implémentée dans cette version du monde.",
        actor,
      );
    case "unknown":
      return fail(
        "ACTION_NOT_ALLOWED",
        "Vous ne savez pas comment faire cela.",
        actor,
      );
  }
}
