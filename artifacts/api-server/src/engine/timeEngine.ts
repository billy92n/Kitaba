// Avance l'horloge mondiale et applique le déclin passif uniquement à l'acteur.
// Ne produit jamais de narration.

import type { ActionType } from "../domain/actions.js";
import type { WorldState, WorldTime } from "../domain/world.js";
import type { Entity } from "../domain/entities.js";

// Coût en temps et en stats par type d'action (en heures)
const ACTION_TIME_COST: Record<ActionType, number> = {
  move: 0.25,
  speak: 0.25,
  take: 0.1,
  examine: 0.1,
  give: 0.1,
  eat: 0.25,
  sleep: 6,
  attack: 0.25,
  use: 0.1,
  unknown: 0,
};

// Coût en stats par heure écoulée
const HUNGER_DECAY_PER_HOUR = 2.5; // -2.5 points de faim par heure
const FATIGUE_DECAY_PER_HOUR = 1.5; // -1.5 points d'énergie par heure

// Avance le temps du monde en ajoutant les heures écoulées
export function advanceTime(time: WorldTime, hours: number): WorldTime {
  const SEASONS: WorldTime["season"][] = [
    "printemps",
    "été",
    "automne",
    "hiver",
  ];
  const DAYS_PER_SEASON = 30;
  const HOURS_PER_DAY = 24;

  let { year, season, day, hour } = time;
  hour += hours;

  while (hour >= HOURS_PER_DAY) {
    hour -= HOURS_PER_DAY;
    day += 1;
    if (day > DAYS_PER_SEASON) {
      day = 1;
      const seasonIdx = SEASONS.indexOf(season);
      if (seasonIdx === SEASONS.length - 1) {
        season = SEASONS[0];
        year += 1;
      } else {
        season = SEASONS[seasonIdx + 1];
      }
    }
  }

  return { year, season, day, hour: Math.round(hour * 2) / 2 }; // arrondi à 0.5h
}

// Applique les dégradations passives des stats d'une entité.
export function applyPassiveDecay(entity: Entity, hours: number): Entity {
  if (entity.hunger === undefined && entity.fatigue === undefined)
    return entity;
  return {
    ...entity,
    hunger:
      entity.hunger !== undefined
        ? Math.max(0, entity.hunger - HUNGER_DECAY_PER_HOUR * hours)
        : undefined,
    fatigue:
      entity.fatigue !== undefined
        ? Math.max(0, entity.fatigue - FATIGUE_DECAY_PER_HOUR * hours)
        : undefined,
  };
}

// Retourne le coût en heures d'un type d'action
export function getTimeCost(actionType: ActionType): number {
  return ACTION_TIME_COST[actionType];
}

// Applique le temps et le déclin sur le WorldState après une action
export function applyTimeAndDecay(
  state: WorldState,
  actor: Entity,
  actionType: ActionType,
): WorldState {
  const hours = getTimeCost(actionType);
  if (hours === 0) return state;

  const newTime = advanceTime(state.time, hours);
  const updatedEntity = applyPassiveDecay(actor, hours);
  return {
    ...state,
    time: newTime,
    entities: {
      ...state.entities,
      [actor.id]: updatedEntity,
    },
  };
}
