import { describe, expect, it } from "vitest";
import type { Entity } from "../domain/entities.js";
import type {
  ScheduledActor,
  ScheduledActorHeapNode,
  WorldSchedulerState,
} from "../domain/scheduler.js";
import type { WorldState } from "../domain/world.js";
import {
  bootstrapWorldScheduler,
  compareScheduledActors,
  completeScheduledActivation,
  ensureWorldScheduler,
  materializeScheduledActivation,
  resolveWorldSchedulerConfig,
  SchedulerInvariantError,
  selectScheduledActivation,
  setScheduledActorLod,
  sleepScheduledActor,
  validateWorldSchedulerState,
  wakeScheduledActor,
} from "../engine/worldScheduler.js";
import { worldTimeToMinutes } from "../engine/timeEngine.js";
import { createInitialWorldState } from "../worldSeed.js";

function worldWithActors(count: number): WorldState {
  const base = createInitialWorldState("Scheduler");
  const template = base.entities.hamid;
  const entities: Record<string, Entity> = {};
  for (let index = count - 1; index >= 0; index -= 1) {
    const id = `actor-${index.toString().padStart(5, "0")}`;
    entities[id] = { ...template, id, name: id };
  }
  return {
    ...base,
    controlledEntityId: "actor-00000",
    entities,
    locations: {
      ...base.locations,
      forge_hamid: {
        ...base.locations.forge_hamid,
        presentEntities: Object.keys(entities),
      },
    },
  };
}

const config = resolveWorldSchedulerConfig({ budgetUnits: 8 });

function findScheduledActor(
  node: ScheduledActorHeapNode | null,
  actorId: string,
): ScheduledActor | undefined {
  if (!node) return undefined;
  if (node.entry.actorId === actorId) return node.entry;
  return (
    findScheduledActor(node.left, actorId) ??
    findScheduledActor(node.right, actorId)
  );
}

describe("deterministic world scheduler", () => {
  it("bootstraps historical saves once with a stable total order", () => {
    const first = worldWithActors(32);
    const second = {
      ...first,
      entities: Object.fromEntries(Object.entries(first.entities).reverse()),
    };
    const firstScheduler = bootstrapWorldScheduler(first, "world-seed");
    const secondScheduler = bootstrapWorldScheduler(second, "world-seed");

    expect(secondScheduler).toEqual(firstScheduler);
    expect(selectScheduledActivation(firstScheduler, config)?.actorId).toBe(
      "actor-00000",
    );
    expect(first).not.toHaveProperty("scheduler");
  });

  it("uses actorId to break equal-minute ties independently of insertion order", () => {
    const entries: ScheduledActor[] = [
      { actorId: "zeta", lod: "LOD1", dueMinute: 20 },
      { actorId: "alpha", lod: "LOD1", dueMinute: 20 },
      { actorId: "later", lod: "LOD0", dueMinute: 21 },
      { actorId: "sleeping", lod: "LOD3", dueMinute: null },
    ];
    expect(
      [...entries].sort(compareScheduledActors).map((entry) => entry.actorId),
    ).toEqual(["alpha", "zeta", "later", "sleeping"]);
    expect(compareScheduledActors(entries[2], entries[3])).toBeLessThan(0);
    expect(
      compareScheduledActors(
        { actorId: "alpha", lod: "LOD3", dueMinute: null },
        { actorId: "zeta", lod: "LOD3", dueMinute: null },
      ),
    ).toBeLessThan(0);
  });

  it("processes thousands of actors once per fair cycle without omission", () => {
    let state = ensureWorldScheduler(worldWithActors(3_000), "large-world");
    const seen = new Set<string>();
    for (let index = 0; index < 3_000; index += 1) {
      const activation = selectScheduledActivation(state.scheduler, config);
      expect(activation).not.toBeNull();
      if (!activation) return;
      expect(seen.has(activation.actorId)).toBe(false);
      seen.add(activation.actorId);
      state = completeScheduledActivation(state, activation, config);
    }
    expect(seen).toHaveLength(3_000);
    expect(selectScheduledActivation(state.scheduler, config)?.actorId).toBe(
      "actor-00000",
    );
  });

  it("materializes integer world time and completes the queue immutably", () => {
    const original = ensureWorldScheduler(worldWithActors(1), "clock");
    const before = structuredClone(original);
    const root = original.scheduler.queue;
    expect(root).not.toBeNull();
    if (!root) return;
    const delayed: WorldSchedulerState = {
      ...original.scheduler,
      queue: {
        ...root,
        entry: {
          ...root.entry,
          dueMinute: worldTimeToMinutes(original.time) + 125,
        },
      },
    };
    const delayedState = { ...original, scheduler: delayed };
    const activation = selectScheduledActivation(delayed, config);
    expect(activation).not.toBeNull();
    if (!activation) return;

    const materialized = materializeScheduledActivation(
      delayedState,
      activation,
      config,
    );
    expect(worldTimeToMinutes(materialized.time)).toBe(activation.dueMinute);
    const completed = completeScheduledActivation(
      materialized,
      activation,
      config,
    );
    expect(completed.scheduler.revision).toBe(1);
    expect(delayedState.scheduler.revision).toBe(0);
    expect(original).toEqual(before);
  });

  it("supports deterministic sleep, wake and LOD changes", () => {
    const scheduler = bootstrapWorldScheduler(worldWithActors(2), "lod");
    const sleeping = sleepScheduledActor(scheduler, "actor-00000", 10);
    expect(findScheduledActor(sleeping.queue, "actor-00000")).toEqual({
      actorId: "actor-00000",
      lod: "LOD3",
      dueMinute: null,
    });
    expect(selectScheduledActivation(sleeping, config)?.actorId).toBe(
      "actor-00001",
    );

    const awake = wakeScheduledActor(sleeping, "actor-00000", "LOD0", 5);
    expect(selectScheduledActivation(awake, config)).toMatchObject({
      actorId: "actor-00000",
      lod: "LOD0",
      dueMinute: 5,
      budgetCost: 8,
    });
    expect(
      findScheduledActor(
        setScheduledActorLod(awake, "actor-00000", "LOD2", 50).queue,
        "actor-00000",
      ),
    ).toMatchObject({ lod: "LOD2", dueMinute: 50 });
    expect(scheduler.queue).not.toEqual(sleeping.queue);
  });

  it("returns no activation when every actor is dormant", () => {
    let scheduler = bootstrapWorldScheduler(worldWithActors(2), "dormant");
    scheduler = sleepScheduledActor(scheduler, "actor-00000", 0);
    scheduler = sleepScheduledActor(scheduler, "actor-00001", 0);
    expect(selectScheduledActivation(scheduler, config)).toBeNull();
  });

  it("accepts an empty world queue and reuses a valid persisted scheduler", () => {
    const empty = worldWithActors(0);
    const scheduler = bootstrapWorldScheduler(empty, "empty");
    expect(scheduler).toMatchObject({ actorCount: 0, queue: null });
    expect(() => validateWorldSchedulerState(scheduler, [])).not.toThrow();

    const persisted = ensureWorldScheduler(worldWithActors(2), "persisted");
    expect(ensureWorldScheduler(persisted, "persisted")).toBe(persisted);
    const activation = selectScheduledActivation(persisted.scheduler, config);
    expect(activation).not.toBeNull();
    if (!activation) return;
    expect(
      completeScheduledActivation(persisted, activation, config).scheduler
        .revision,
    ).toBe(1);
  });

  it.each([
    [{ budgetUnits: 0 }, "budgetUnits"],
    [{ budgetUnits: 7 }, "most expensive"],
    [
      {
        budgetUnits: 8,
        lodProfiles: { LOD0: { cadenceMinutes: 0, budgetCost: 1 } },
      },
      "LOD0",
    ],
    [
      {
        budgetUnits: 8,
        lodProfiles: { LOD1: { cadenceMinutes: 1, budgetCost: 1.5 } },
      },
      "LOD1",
    ],
  ])("rejects unsafe scheduler configuration %#", (value, message) => {
    expect(() => resolveWorldSchedulerConfig(value)).toThrow(message);
  });

  it("rejects corrupt, incomplete, duplicate and non-heap persisted states", () => {
    const world = worldWithActors(2);
    const valid = bootstrapWorldScheduler(world, "validation");
    const root = valid.queue;
    expect(root).not.toBeNull();
    if (!root) return;
    const child: ScheduledActorHeapNode = {
      entry: {
        actorId: "actor-00001",
        lod: "LOD1",
        dueMinute: root.entry.dueMinute,
      },
      rank: 1,
      left: null,
      right: null,
    };
    const variants: WorldSchedulerState[] = [
      { ...valid, schemaVersion: 2 as 1 },
      { ...valid, seed: " " },
      { ...valid, revision: -1 },
      { ...valid, actorCount: -1 },
      {
        ...valid,
        queue: { ...root, entry: { ...root.entry, actorId: " " } },
      },
      {
        ...valid,
        queue: {
          ...root,
          entry: { ...root.entry, lod: "LOD3", dueMinute: 0 },
        },
      },
      {
        ...valid,
        queue: { ...root, entry: { ...root.entry, dueMinute: null } },
      },
      {
        ...valid,
        queue: { ...root, entry: { ...root.entry, dueMinute: -1 } },
      },
      {
        ...valid,
        queue: {
          ...root,
          rank: 1,
          left: { ...child, entry: { ...root.entry } },
          right: null,
        },
      },
      {
        ...valid,
        queue: {
          ...root,
          entry: { ...root.entry, dueMinute: 2 },
          rank: 1,
          left: { ...child, entry: { ...child.entry, dueMinute: 1 } },
          right: null,
        },
      },
      { ...valid, actorCount: 1 },
    ];
    for (const variant of variants) {
      expect(() =>
        validateWorldSchedulerState(variant, Object.keys(world.entities)),
      ).toThrow(SchedulerInvariantError);
    }
  });

  it("rejects non-canonical seeds, seed drift, unknown actors and stale activations", () => {
    const world = worldWithActors(2);
    expect(() => bootstrapWorldScheduler(world, " ")).toThrow("scheduler seed");
    const ensured = ensureWorldScheduler(world, "seed");
    expect(() => ensureWorldScheduler(ensured, "other")).toThrow(
      "requested seed",
    );
    expect(() =>
      setScheduledActorLod(ensured.scheduler, "missing", "LOD1", 0),
    ).toThrow("not scheduled");
    expect(() =>
      setScheduledActorLod(ensured.scheduler, "actor-00000", "LOD1", -1),
    ).toThrow("wakeMinute");
    const activation = selectScheduledActivation(ensured.scheduler, config);
    expect(activation).not.toBeNull();
    if (!activation) return;
    expect(() =>
      materializeScheduledActivation(
        ensured,
        { ...activation, schedulerRevision: 99 },
        config,
      ),
    ).toThrow("no longer matches");
  });
});
