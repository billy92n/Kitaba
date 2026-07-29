// Applique uniquement le contexte rÃ©solu par la validation : aucune cible n'est recherchÃ©e ici.

import type { WorldState } from "../domain/world.js";
import type { Entity } from "../domain/entities.js";
import type { ValidatedActionContext } from "./actionValidator.js";

export interface ConsequenceResult {
  newWorldState: WorldState;
  observableFacts: string[];
  consequences: string[];
  targetId: string | null;
  actorAfter: Entity;
}

export function applyConsequences(
  state: WorldState,
  context: ValidatedActionContext,
): ConsequenceResult {
  const { actor } = context;

  switch (context.kind) {
    case "MOVE": {
      const source = context.location;
      const target = context.target;
      return {
        newWorldState: {
          ...state,
          entities: {
            ...state.entities,
            [actor.id]: { ...actor, locationId: target.id },
          },
          locations: {
            ...state.locations,
            [source.id]: {
              ...source,
              presentEntities: source.presentEntities.filter(
                (id) => id !== actor.id,
              ),
            },
            [target.id]: {
              ...target,
              presentEntities: [
                ...target.presentEntities.filter((id) => id !== actor.id),
                actor.id,
              ],
            },
          },
        },
        observableFacts: [`Vous entrez dans ${target.name}.`],
        consequences: [
          `entity:${actor.id}:locationId:${source.id}â†’${target.id}`,
        ],
        targetId: target.id,
        actorAfter: { ...actor, locationId: target.id },
      };
    }
    case "SPEAK":
      return {
        newWorldState: state,
        observableFacts: [`${context.target.name} vous rÃ©pond briÃ¨vement.`],
        consequences: [],
        targetId: context.target.id,
        actorAfter: actor,
      };
    case "TAKE": {
      const object = context.target;
      const previousOwner = object.ownerId
        ? state.entities[object.ownerId]
        : undefined;
      const previousLocation = object.locationId
        ? state.locations[object.locationId]
        : undefined;
      const entities = {
        ...state.entities,
        ...(previousOwner
          ? {
              [previousOwner.id]: {
                ...previousOwner,
                inventory: previousOwner.inventory.filter(
                  (id) => id !== object.id,
                ),
              },
            }
          : {}),
        [actor.id]: {
          ...actor,
          inventory: [
            ...actor.inventory.filter((id) => id !== object.id),
            object.id,
          ],
        },
      };
      return {
        newWorldState: {
          ...state,
          entities,
          objects: {
            ...state.objects,
            [object.id]: { ...object, locationId: null, ownerId: actor.id },
          },
          ...(previousLocation
            ? {
                locations: {
                  ...state.locations,
                  [previousLocation.id]: {
                    ...previousLocation,
                    presentObjects: previousLocation.presentObjects.filter(
                      (id) => id !== object.id,
                    ),
                  },
                },
              }
            : {}),
        },
        observableFacts: [`${object.name} est maintenant dans vos affaires.`],
        consequences: [
          `object:${object.id}:owner:${object.ownerId ?? object.locationId ?? "sol"}â†’${actor.id}`,
        ],
        targetId: object.id,
        actorAfter: entities[actor.id],
      };
    }
    case "EXAMINE":
      return {
        newWorldState: state,
        observableFacts: [
          context.target?.description ??
            `Vous ne voyez rien de particulier concernant "${context.action.targetName ?? "cela"}".`,
        ],
        consequences: [],
        targetId: context.target?.id ?? null,
        actorAfter: actor,
      };
    case "EAT": {
      const object = context.target;
      const { [object.id]: consumedObject, ...remainingObjects } =
        state.objects;
      void consumedObject;
      return {
        newWorldState: {
          ...state,
          entities: {
            ...state.entities,
            [actor.id]: {
              ...actor,
              inventory: actor.inventory.filter((id) => id !== object.id),
              hunger: Math.min(100, (actor.hunger ?? 50) + 30),
            },
          },
          objects: remainingObjects,
        },
        observableFacts: [`Vous mangez ${object.name}. Votre faim diminue.`],
        consequences: [
          `object:${object.id}:consumed`,
          `entity:${actor.id}:hunger:+30`,
        ],
        targetId: object.id,
        actorAfter: {
          ...actor,
          inventory: actor.inventory.filter((id) => id !== object.id),
          hunger: Math.min(100, (actor.hunger ?? 50) + 30),
        },
      };
    }
    case "SLEEP": {
      const fatigueBefore = actor.fatigue ?? 50;
      const fatigueAfter = Math.min(100, fatigueBefore + 60);
      return {
        newWorldState: {
          ...state,
          entities: {
            ...state.entities,
            [actor.id]: { ...actor, fatigue: fatigueAfter },
          },
        },
        observableFacts: [
          "Vous dormez plusieurs heures. Votre fatigue se dissipe.",
        ],
        consequences: [
          `entity:${actor.id}:fatigue:${fatigueBefore}â†’${fatigueAfter}`,
        ],
        targetId: null,
        actorAfter: { ...actor, fatigue: fatigueAfter },
      };
    }
  }
}

