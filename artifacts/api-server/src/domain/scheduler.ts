import type { EntityId } from "./world.js";

export const SIMULATION_LODS = ["LOD0", "LOD1", "LOD2", "LOD3"] as const;
export type SimulationLod = (typeof SIMULATION_LODS)[number];

export interface ScheduledActor {
  actorId: EntityId;
  lod: SimulationLod;
  /** Absolute world minute. Null means explicitly dormant. */
  dueMinute: number | null;
}

export interface ScheduledActorHeapNode {
  entry: ScheduledActor;
  /** Null-path rank of this leftist heap node. */
  rank: number;
  left: ScheduledActorHeapNode | null;
  right: ScheduledActorHeapNode | null;
}

export interface WorldSchedulerState {
  schemaVersion: 1;
  seed: string;
  revision: number;
  actorCount: number;
  /**
   * Persistent leftist min-heap ordered by dueMinute, then actorId.
   * Path-copying keeps pop/reinsert immutable in O(log n).
   */
  queue: ScheduledActorHeapNode | null;
}

export interface SimulationLodProfile {
  cadenceMinutes: number;
  budgetCost: number;
}

export type SimulationLodProfiles = Record<
  Exclude<SimulationLod, "LOD3">,
  SimulationLodProfile
>;

export interface WorldSchedulerConfig {
  budgetUnits: number;
  lodProfiles?: Partial<SimulationLodProfiles>;
}

export interface ScheduledActivation {
  actorId: EntityId;
  lod: Exclude<SimulationLod, "LOD3">;
  dueMinute: number;
  budgetCost: number;
  schedulerRevision: number;
}

export const DEFAULT_SIMULATION_LOD_PROFILES: SimulationLodProfiles = {
  LOD0: { cadenceMinutes: 15, budgetCost: 8 },
  LOD1: { cadenceMinutes: 60, budgetCost: 4 },
  LOD2: { cadenceMinutes: 360, budgetCost: 1 },
};
