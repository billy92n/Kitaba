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
  | "ACTION_NOT_ALLOWED";

export interface ActionFailure {
  possible: false;
  code: ActionFailureCode;
  reason: string;
  actor: Entity | null;
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
  | (BaseContext & { kind: "SLEEP" | "GIVE" | "USE"; target: null });

export interface ActionValidationSuccess {
  possible: true;
  context: ValidatedActionContext;
}

export type ValidationResult = ActionValidationSuccess | ActionFailure;

function fail(
  code: ActionFailureCode,
  reason: string,
  actor: Entity | null,
): ActionFailure {
  return { possible: false, code, reason, actor };
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
      if (!target) {
        return fail(
          "TARGET_NOT_FOUND",
          `Vous ne savez pas comment aller à "${action.targetName ?? "?"}".`,
          actor,
        );
      }
      if (target.id === actor.locationId) {
        return fail(
          "ACTION_NOT_ALLOWED",
          `Vous êtes déjà à ${target.name}.`,
          actor,
        );
      }
      if (!location.connectedLocations.includes(target.id)) {
        return fail(
          "ACTION_NOT_ALLOWED",
          `${target.name} n'est pas directement accessible depuis ${location.name}.`,
          actor,
        );
      }
      return { possible: true, context: { ...base, kind: "MOVE", target } };
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
      return target
        ? { possible: true, context: { ...base, kind: "SPEAK", target } }
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
      if (!resolved) {
        return fail(
          "TARGET_NOT_FOUND",
          `Vous ne voyez pas "${action.targetName ?? "cet objet"}" ici.`,
          actor,
        );
      }
      if (resolved.availability === "ACTOR_INVENTORY") {
        return fail(
          "ACTION_NOT_ALLOWED",
          `Vous avez déjà ${resolved.object.name} dans vos affaires.`,
          actor,
        );
      }
      return {
        possible: true,
        context: {
          ...base,
          kind: "TAKE",
          target: resolved.object,
          availability: resolved.availability,
        },
      };
    }
    case "examine":
      return {
        possible: true,
        context: {
          ...base,
          kind: "EXAMINE",
          target: findInspectable(state, actorId, action.targetName),
        },
      };
    case "eat": {
      const resolved = resolveObjectInActorContext(
        state,
        actorId,
        action.targetName,
      );
      if (!resolved) {
        return fail(
          "TARGET_NOT_FOUND",
          `Vous n'avez pas "${action.targetName ?? "de quoi manger"}" sur vous.`,
          actor,
        );
      }
      if (resolved.availability !== "ACTOR_INVENTORY") {
        return fail(
          "ACTION_NOT_ALLOWED",
          `${resolved.object.name} ne vous appartient pas.`,
          actor,
        );
      }
      return {
        possible: true,
        context: {
          ...base,
          kind: "EAT",
          target: resolved.object,
          availability: resolved.availability,
        },
      };
    }
    case "sleep":
      return {
        possible: true,
        context: { ...base, kind: "SLEEP", target: null },
      };
    case "give":
      return action.targetName
        ? { possible: true, context: { ...base, kind: "GIVE", target: null } }
        : fail(
            "TARGET_NOT_FOUND",
            "À qui voulez-vous donner, et quoi ?",
            actor,
          );
    case "use":
      return {
        possible: true,
        context: { ...base, kind: "USE", target: null },
      };
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
