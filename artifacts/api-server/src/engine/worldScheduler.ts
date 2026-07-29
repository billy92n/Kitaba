import {
  DEFAULT_SIMULATION_LOD_PROFILES,
  SIMULATION_LODS,
  type ScheduledActivation,
  type ScheduledActor,
  type ScheduledActorHeapNode,
  type SimulationLod,
  type SimulationLodProfiles,
  type WorldSchedulerConfig,
  type WorldSchedulerState,
} from "../domain/scheduler.js";
import { isCanonicalAutonomyIdentity } from "../domain/autonomy.js";
import type { EntityId, WorldState } from "../domain/world.js";
import { advanceTime, worldTimeToMinutes } from "./timeEngine.js";

export type SchedulerFailureCode =
  | "INVALID_SCHEDULER_CONFIG"
  | "INVALID_SCHEDULER_STATE"
  | "SCHEDULER_SEED_MISMATCH"
  | "SCHEDULER_ACTIVATION_MISMATCH"
  | "ACTOR_NOT_SCHEDULED";

export class SchedulerInvariantError extends Error {
  constructor(
    readonly code: SchedulerFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "SchedulerInvariantError";
  }
}

export interface ResolvedWorldSchedulerConfig {
  budgetUnits: number;
  lodProfiles: SimulationLodProfiles;
}

function compareText(left: string, right: string): number {
  return Number(left > right) - Number(left < right);
}

export function compareScheduledActors(
  left: ScheduledActor,
  right: ScheduledActor,
): number {
  if (left.dueMinute === null && right.dueMinute !== null) return 1;
  if (left.dueMinute !== null && right.dueMinute === null) return -1;
  if (left.dueMinute !== right.dueMinute) {
    return (left.dueMinute as number) - (right.dueMinute as number);
  }
  return compareText(left.actorId, right.actorId);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function resolveLodProfile(
  lod: keyof SimulationLodProfiles,
  configured: SimulationLodProfiles[keyof SimulationLodProfiles] | undefined,
): SimulationLodProfiles[keyof SimulationLodProfiles] {
  const value = configured ?? DEFAULT_SIMULATION_LOD_PROFILES[lod];
  if (
    !isPositiveInteger(value.cadenceMinutes) ||
    !isPositiveInteger(value.budgetCost)
  ) {
    throw new SchedulerInvariantError(
      "INVALID_SCHEDULER_CONFIG",
      `${lod} requires positive integer cadenceMinutes and budgetCost.`,
    );
  }
  return { ...value };
}

export function resolveWorldSchedulerConfig(
  config: WorldSchedulerConfig,
): ResolvedWorldSchedulerConfig {
  if (!isPositiveInteger(config.budgetUnits)) {
    throw new SchedulerInvariantError(
      "INVALID_SCHEDULER_CONFIG",
      "budgetUnits must be a positive safe integer.",
    );
  }
  const lodProfiles: SimulationLodProfiles = {
    LOD0: resolveLodProfile("LOD0", config.lodProfiles?.LOD0),
    LOD1: resolveLodProfile("LOD1", config.lodProfiles?.LOD1),
    LOD2: resolveLodProfile("LOD2", config.lodProfiles?.LOD2),
  };
  const maximumCost = Math.max(
    ...Object.values(lodProfiles).map((profile) => profile.budgetCost),
  );
  if (config.budgetUnits < maximumCost) {
    throw new SchedulerInvariantError(
      "INVALID_SCHEDULER_CONFIG",
      "budgetUnits must cover the most expensive active LOD.",
    );
  }
  return { budgetUnits: config.budgetUnits, lodProfiles };
}

function heapRank(node: ScheduledActorHeapNode | null): number {
  return node?.rank ?? 0;
}

function singletonHeap(entry: ScheduledActor): ScheduledActorHeapNode {
  return { entry: { ...entry }, rank: 1, left: null, right: null };
}

function mergeHeaps(
  first: ScheduledActorHeapNode | null,
  second: ScheduledActorHeapNode | null,
): ScheduledActorHeapNode | null {
  if (!first) return second;
  if (!second) return first;
  const [root, other] =
    compareScheduledActors(first.entry, second.entry) <= 0
      ? [first, second]
      : [second, first];
  const merged = mergeHeaps(root.right, other);
  const left = heapRank(root.left) >= heapRank(merged) ? root.left : merged;
  const right = heapRank(root.left) >= heapRank(merged) ? merged : root.left;
  return {
    entry: root.entry,
    rank: heapRank(right) + 1,
    left,
    right,
  };
}

function pushHeap(
  queue: ScheduledActorHeapNode | null,
  entry: ScheduledActor,
): ScheduledActorHeapNode {
  return mergeHeaps(queue, singletonHeap(entry)) as ScheduledActorHeapNode;
}

function popHeap(queue: ScheduledActorHeapNode): {
  entry: ScheduledActor;
  queue: ScheduledActorHeapNode | null;
} {
  return { entry: queue.entry, queue: mergeHeaps(queue.left, queue.right) };
}

function heapFromEntries(
  entries: readonly ScheduledActor[],
): ScheduledActorHeapNode | null {
  let queue: ScheduledActorHeapNode | null = null;
  for (const entry of entries) queue = pushHeap(queue, entry);
  return queue;
}

function heapEntries(queue: ScheduledActorHeapNode | null): ScheduledActor[] {
  if (!queue) return [];
  return [queue.entry, ...heapEntries(queue.left), ...heapEntries(queue.right)];
}

function isSimulationLod(value: unknown): value is SimulationLod {
  return SIMULATION_LODS.some((lod) => lod === value);
}

export function bootstrapWorldScheduler(
  state: WorldState,
  seed: string,
  initialLod: Exclude<SimulationLod, "LOD3"> = "LOD1",
): WorldSchedulerState {
  if (!isCanonicalAutonomyIdentity(seed)) {
    throw new SchedulerInvariantError(
      "INVALID_SCHEDULER_STATE",
      "The scheduler seed must be canonical.",
    );
  }
  const dueMinute = worldTimeToMinutes(state.time);
  return {
    schemaVersion: 1,
    seed,
    revision: 0,
    actorCount: Object.keys(state.entities).length,
    queue: heapFromEntries(
      Object.keys(state.entities)
        .sort(compareText)
        .map((actorId) => ({
          actorId,
          lod: initialLod,
          dueMinute,
        })),
    ),
  };
}

export function validateWorldSchedulerState(
  scheduler: WorldSchedulerState,
  entityIds: readonly EntityId[],
): void {
  if (
    scheduler.schemaVersion !== 1 ||
    !isCanonicalAutonomyIdentity(scheduler.seed) ||
    !Number.isSafeInteger(scheduler.revision) ||
    scheduler.revision < 0 ||
    !Number.isSafeInteger(scheduler.actorCount) ||
    scheduler.actorCount < 0
  ) {
    throw new SchedulerInvariantError(
      "INVALID_SCHEDULER_STATE",
      "The scheduler envelope is invalid.",
    );
  }
  const expected = [...entityIds].sort(compareText);
  const seen = new Set<string>();
  const stack: Array<{
    node: ScheduledActorHeapNode;
    parent: ScheduledActorHeapNode | null;
  }> = scheduler.queue ? [{ node: scheduler.queue, parent: null }] : [];
  while (stack.length > 0) {
    const current = stack.pop() as {
      node: ScheduledActorHeapNode;
      parent: ScheduledActorHeapNode | null;
    };
    const { node, parent } = current;
    const entry = node.entry;
    if (
      !isCanonicalAutonomyIdentity(entry.actorId) ||
      !isSimulationLod(entry.lod) ||
      (entry.lod === "LOD3" && entry.dueMinute !== null) ||
      (entry.lod !== "LOD3" &&
        (entry.dueMinute === null ||
          !Number.isSafeInteger(entry.dueMinute) ||
          entry.dueMinute < 0)) ||
      seen.has(entry.actorId)
    ) {
      throw new SchedulerInvariantError(
        "INVALID_SCHEDULER_STATE",
        `Invalid scheduler entry for ${entry.actorId}.`,
      );
    }
    seen.add(entry.actorId);
    if (
      !Number.isSafeInteger(node.rank) ||
      node.rank !== heapRank(node.right) + 1 ||
      heapRank(node.left) < heapRank(node.right) ||
      (parent !== null && compareScheduledActors(parent.entry, entry) > 0)
    ) {
      throw new SchedulerInvariantError(
        "INVALID_SCHEDULER_STATE",
        "The scheduler queue is not a valid leftist heap.",
      );
    }
    if (node.left) stack.push({ node: node.left, parent: node });
    if (node.right) stack.push({ node: node.right, parent: node });
  }
  const actual = [...seen].sort(compareText);
  if (
    scheduler.actorCount !== actual.length ||
    actual.length !== expected.length ||
    actual.some((id, index) => id !== expected[index])
  ) {
    throw new SchedulerInvariantError(
      "INVALID_SCHEDULER_STATE",
      "The scheduler must contain every world entity exactly once.",
    );
  }
}

export function ensureWorldScheduler(
  state: WorldState,
  seed: string,
): WorldState & { scheduler: WorldSchedulerState } {
  const scheduler = state.scheduler ?? bootstrapWorldScheduler(state, seed);
  if (scheduler.seed !== seed) {
    throw new SchedulerInvariantError(
      "SCHEDULER_SEED_MISMATCH",
      "The requested seed differs from the persisted scheduler seed.",
    );
  }
  validateWorldSchedulerState(scheduler, Object.keys(state.entities));
  return state.scheduler
    ? (state as WorldState & { scheduler: WorldSchedulerState })
    : { ...state, scheduler };
}

export function selectScheduledActivation(
  scheduler: WorldSchedulerState,
  config: ResolvedWorldSchedulerConfig,
): ScheduledActivation | null {
  const next = scheduler.queue?.entry;
  if (!next || next.dueMinute === null || next.lod === "LOD3") return null;
  return {
    actorId: next.actorId,
    lod: next.lod,
    dueMinute: next.dueMinute,
    budgetCost: config.lodProfiles[next.lod].budgetCost,
    schedulerRevision: scheduler.revision,
  };
}

function assertActivation(
  scheduler: WorldSchedulerState,
  activation: ScheduledActivation,
  config: ResolvedWorldSchedulerConfig,
): void {
  const expected = selectScheduledActivation(scheduler, config);
  if (
    !expected ||
    expected.actorId !== activation.actorId ||
    expected.lod !== activation.lod ||
    expected.dueMinute !== activation.dueMinute ||
    expected.budgetCost !== activation.budgetCost ||
    expected.schedulerRevision !== activation.schedulerRevision
  ) {
    throw new SchedulerInvariantError(
      "SCHEDULER_ACTIVATION_MISMATCH",
      "The activation no longer matches the persisted scheduler head.",
    );
  }
}

export function materializeScheduledActivation(
  state: WorldState & { scheduler: WorldSchedulerState },
  activation: ScheduledActivation,
  config: ResolvedWorldSchedulerConfig,
): WorldState & { scheduler: WorldSchedulerState } {
  assertActivation(state.scheduler, activation, config);
  const currentMinute = worldTimeToMinutes(state.time);
  if (activation.dueMinute <= currentMinute) return state;
  return {
    ...state,
    time: advanceTime(state.time, activation.dueMinute - currentMinute),
  };
}

export function completeScheduledActivation(
  state: WorldState & { scheduler: WorldSchedulerState },
  activation: ScheduledActivation,
  config: ResolvedWorldSchedulerConfig,
): WorldState & { scheduler: WorldSchedulerState } {
  assertActivation(state.scheduler, activation, config);
  const removed = popHeap(state.scheduler.queue as ScheduledActorHeapNode);
  const queue = pushHeap(removed.queue, {
    actorId: activation.actorId,
    lod: activation.lod,
    dueMinute:
      worldTimeToMinutes(state.time) +
      config.lodProfiles[activation.lod].cadenceMinutes,
  });
  return {
    ...state,
    scheduler: {
      ...state.scheduler,
      revision: state.scheduler.revision + 1,
      queue,
    },
  };
}

export function setScheduledActorLod(
  scheduler: WorldSchedulerState,
  actorId: EntityId,
  lod: SimulationLod,
  wakeMinute: number,
): WorldSchedulerState {
  const entries = heapEntries(scheduler.queue);
  const existing = entries.find((entry) => entry.actorId === actorId);
  if (!existing) {
    throw new SchedulerInvariantError(
      "ACTOR_NOT_SCHEDULED",
      `Actor ${actorId} is not scheduled.`,
    );
  }
  if (!Number.isSafeInteger(wakeMinute) || wakeMinute < 0) {
    throw new SchedulerInvariantError(
      "INVALID_SCHEDULER_STATE",
      "wakeMinute must be a non-negative safe integer.",
    );
  }
  const queue = entries.map((entry) =>
    entry.actorId === actorId
      ? {
          actorId,
          lod,
          dueMinute: lod === "LOD3" ? null : wakeMinute,
        }
      : { ...entry },
  );
  return { ...scheduler, queue: heapFromEntries(queue) };
}

export function sleepScheduledActor(
  scheduler: WorldSchedulerState,
  actorId: EntityId,
  currentMinute: number,
): WorldSchedulerState {
  return setScheduledActorLod(scheduler, actorId, "LOD3", currentMinute);
}

export function wakeScheduledActor(
  scheduler: WorldSchedulerState,
  actorId: EntityId,
  lod: Exclude<SimulationLod, "LOD3">,
  currentMinute: number,
): WorldSchedulerState {
  return setScheduledActorLod(scheduler, actorId, lod, currentMinute);
}
