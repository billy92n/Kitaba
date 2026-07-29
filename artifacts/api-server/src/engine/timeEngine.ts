// Avance l'horloge mondiale en minutes entières et décline uniquement l'acteur.

import type { ActionType } from "../domain/actions.js";
import type { Entity } from "../domain/entities.js";
import {
  normalizeWorldTime,
  type WorldState,
  type WorldTime,
} from "../domain/world.js";

const ACTION_TIME_COST_MINUTES: Record<ActionType, number> = {
  move: 15,
  speak: 15,
  take: 6,
  examine: 6,
  give: 6,
  eat: 15,
  sleep: 360,
  attack: 15,
  use: 6,
  unknown: 0,
};

const HUNGER_DECAY_PER_HOUR = 2.5;
const FATIGUE_DECAY_PER_HOUR = 1.5;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const DAYS_PER_SEASON = 30;
const SEASONS: WorldTime["season"][] = ["printemps", "été", "automne", "hiver"];
const MINUTES_PER_SEASON = DAYS_PER_SEASON * MINUTES_PER_DAY;
const MINUTES_PER_YEAR = SEASONS.length * MINUTES_PER_SEASON;

export function advanceTime(
  time: WorldTime,
  minutes: number,
): Required<WorldTime> {
  const normalized = normalizeWorldTime(time);
  let { year, season, day } = normalized;
  let minuteOfDay =
    normalized.hour * MINUTES_PER_HOUR + normalized.minute + minutes;

  while (minuteOfDay >= MINUTES_PER_DAY) {
    minuteOfDay -= MINUTES_PER_DAY;
    day += 1;
    if (day > DAYS_PER_SEASON) {
      day = 1;
      const seasonIndex = SEASONS.indexOf(season);
      if (seasonIndex === SEASONS.length - 1) {
        season = SEASONS[0];
        year += 1;
      } else {
        season = SEASONS[seasonIndex + 1];
      }
    }
  }

  return {
    year,
    season,
    day,
    hour: Math.floor(minuteOfDay / MINUTES_PER_HOUR),
    minute: minuteOfDay % MINUTES_PER_HOUR,
  };
}

export function applyPassiveDecay(entity: Entity, minutes: number): Entity {
  if (entity.hunger === undefined && entity.fatigue === undefined)
    return entity;
  const hours = minutes / MINUTES_PER_HOUR;
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

export function worldTimeToMinutes(time: WorldTime): number {
  const normalized = normalizeWorldTime(time);
  return (
    (normalized.year - 1) * MINUTES_PER_YEAR +
    SEASONS.indexOf(normalized.season) * MINUTES_PER_SEASON +
    (normalized.day - 1) * MINUTES_PER_DAY +
    normalized.hour * MINUTES_PER_HOUR +
    normalized.minute
  );
}

export function elapsedWorldMinutes(from: WorldTime, to: WorldTime): number {
  return Math.max(0, worldTimeToMinutes(to) - worldTimeToMinutes(from));
}

/**
 * Matérialise en O(1) les effets passifs accumulés depuis la dernière
 * activation. Une sauvegarde historique sans curseur commence son suivi à
 * l'instant courant afin d'éviter une migration destructive implicite.
 */
export function catchUpEntity(entity: Entity, worldTime: WorldTime): Entity {
  const currentTime = normalizeWorldTime(worldTime);
  if (!entity.lastSimulationTime) {
    return { ...entity, lastSimulationTime: currentTime };
  }
  const elapsed = elapsedWorldMinutes(entity.lastSimulationTime, currentTime);
  if (elapsed === 0) return entity;
  return {
    ...applyPassiveDecay(entity, elapsed),
    lastSimulationTime: currentTime,
  };
}

export function getTimeCostMinutes(actionType: ActionType): number {
  return ACTION_TIME_COST_MINUTES[actionType];
}

export function applyTimeAndDecay(
  state: WorldState,
  actor: Entity,
  actionType: ActionType,
): WorldState {
  const minutes = getTimeCostMinutes(actionType);
  if (minutes === 0) return state;
  const nextTime = advanceTime(state.time, minutes);
  return {
    ...state,
    time: nextTime,
    entities: {
      ...state.entities,
      [actor.id]: {
        ...applyPassiveDecay(actor, minutes),
        lastSimulationTime: nextTime,
      },
    },
  };
}
