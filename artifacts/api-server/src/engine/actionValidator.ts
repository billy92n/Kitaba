import type { StructuredAction } from "../domain/actions.js";
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

export function validateAction(
  state: WorldState,
  actorId: EntityId,
  action: StructuredAction,
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

  switch (action.actionType) {
    case "move": {
      const target = findLocationByQuery(state, action.targetName);
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
      const target = findEntityAtLocation(
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
      const resolved = resolveObjectInActorContext(
        state,
        actorId,
        action.targetName,
      );
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
      const target = findInspectable(state, actorId, action.targetName);
      if (target.status === "AMBIGUOUS") {
        return ambiguous(actor, target.candidateIds);
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
      const resolved = resolveObjectInActorContext(
        state,
        actorId,
        action.targetName,
      );
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
