// worldSeed.ts — Données initiales fixes du monde de Kitaba.
// Le personnage contrôlé par le joueur utilise exactement le même modèle Entity qu'un PNJ.
// La distinction se fait uniquement via WorldState.controlledEntityId.

import type { WorldState, WorldTime } from "./domain/world.js";
import type { Entity } from "./domain/entities.js";
import type { Relation } from "./domain/relations.js";
import { DEFAULT_AUTONOMY_PROFILE } from "./domain/autonomy.js";

export function createInitialWorldState(playerName: string): WorldState {
  const playerId = "player";
  const initialTime: Required<WorldTime> = {
    year: 1,
    season: "automne",
    day: 3,
    hour: 9,
    minute: 0,
  };

  const playerEntity: Entity = {
    id: playerId,
    name: playerName,
    occupation: "Voyageur",
    locationId: "place_centrale",
    description: `Un voyageur nouvellement arrivé à Salma. Son regard est curieux, ses pas encore hésitants sur les pavés du village.`,
    mood: "curieux",
    inventory: [],
    // Stats vitales — optionnelles pour les PNJ, présentes ici car entité contrôlée
    hunger: 70,
    fatigue: 85,
    health: 95,
    knowledge: [
      "Le village s'appelle Salma.",
      "Il y a une taverne, une forge et une ferme ici.",
    ],
    memories: [],
    objectives: [],
  };

  const npcs: Record<string, Entity> = {
    hamid: {
      id: "hamid",
      name: "Hamid",
      occupation: "Forgeron",
      locationId: "forge_hamid",
      description:
        "Un homme trapu aux mains calleuses et au regard direct. Forgeron de père en fils, il est respecté de tous à Salma. Il parle peu mais chaque mot compte.",
      mood: "concentré",
      inventory: [],
    },
    oumou: {
      id: "oumou",
      name: "Oumou",
      occupation: "Paysanne",
      locationId: "ferme_oumou",
      description:
        "Une femme d'une cinquantaine d'années, vive et chaleureuse. Elle connaît tout le monde et n'hésite pas à partager nouvelles et conseils. Sa ferme est la plus productive du village.",
      mood: "affable",
      inventory: ["panier_legumes"],
    },
    tariq: {
      id: "tariq",
      name: "Tariq",
      occupation: "Aubergiste",
      locationId: "taverne_du_loup",
      description:
        "Un homme jovial au ventre généreux et à la barbe fournie. Il tient la Taverne du Loup Gris depuis vingt ans et connaît plus de secrets que n'importe quel curé.",
      mood: "jovial",
      inventory: ["pain_taverne"],
    },
    leila: {
      id: "leila",
      name: "Leila",
      occupation: "Marchande",
      locationId: "taverne_du_loup",
      description:
        "Une femme élégante venue de la cité, aux vêtements de qualité et au regard calculateur. Elle négocie en silence, observe tout, et ne révèle jamais ses intentions.",
      mood: "méfiant",
      inventory: [],
    },
    amir: {
      id: "amir",
      name: "Amir",
      occupation: "Apprenti forgeron",
      locationId: "forge_hamid",
      description:
        "Un jeune homme de dix-sept ans, les bras maigres mais les yeux brillants d'ambition. Il apprend le métier de Hamid depuis deux ans.",
      mood: "enthousiaste",
      inventory: [],
    },
  };

  const relations: Relation[] = [
    {
      entityAId: "hamid",
      entityBId: "amir",
      type: "maître-apprenti",
      strength: 75,
      notes:
        "Hamid est exigeant mais bienveillant. Amir l'admire profondément.",
    },
    {
      entityAId: "tariq",
      entityBId: "oumou",
      type: "vieille amitié",
      strength: 85,
      notes:
        "Ils se connaissent depuis l'enfance. Oumou fournit des légumes à la taverne.",
    },
    {
      entityAId: "hamid",
      entityBId: "oumou",
      type: "voisinage",
      strength: 60,
      notes:
        "Ils se respectent sans être proches. Hamid répare les outils de la ferme.",
    },
    {
      entityAId: "leila",
      entityBId: "tariq",
      type: "relation commerciale",
      strength: 45,
      notes:
        "Leila loge à la taverne lors de ses passages. Tariq la trouve mystérieuse.",
    },
    {
      entityAId: "amir",
      entityBId: "leila",
      type: "curiosité mutuelle",
      strength: 30,
      notes:
        "Amir l'aborde souvent pour avoir des nouvelles de la cité. Elle répond vaguement.",
    },
  ];
  const entities: Record<string, Entity> = {};
  for (const [id, entity] of Object.entries({
    [playerId]: playerEntity,
    ...npcs,
  })) {
    entities[id] = {
      ...entity,
      autonomyProfile: {
        traits: { ...DEFAULT_AUTONOMY_PROFILE.traits },
        persistentGoal: { ...DEFAULT_AUTONOMY_PROFILE.persistentGoal },
      },
      lastSimulationTime: initialTime,
    };
  }

  return {
    worldVersion: 0,
    controlledEntityId: playerId,

    locations: {
      place_centrale: {
        id: "place_centrale",
        name: "Place centrale de Salma",
        description:
          "Le cœur du village de Salma. Une fontaine ancienne trône au milieu de pavés irréguliers. Les villageois s'y croisent au fil de la journée. Les maisons aux murs de terre ocre forment un cercle rassurant.",
        connectedLocations: ["taverne_du_loup", "forge_hamid", "ferme_oumou"],
        presentEntities: [playerId],
        presentObjects:…17174 tokens truncated…tunities.

Limits for this step: a tree is primarily an execution/switching structure. A
large prioritized tree would hard-code action order, and adding each new
motivation would expand authored hierarchy. It remains a candidate for future
execution of a selected multi-step intention.

### General GOAP

Advantages: explicit goals, preconditions and effects; useful when a goal requires
several actions.

Limits for this step: the requested primitive selects one currently possible
action. General search adds branching cost, heuristics, action-effect models and
plan invalidation without a demonstrated multi-step requirement. It would also
tempt Kitaba to duplicate engine consequences inside the planner.

### LLM agent with memory, planning and reflection

Advantages: flexible language-level goals and apparently believable behavior.

Limits for Kitaba: nondeterministic cost and latency, difficult replay, and a high
risk that the model invents knowledge, actions or consequences. The generative
agents research supports separating observation, memory, planning and reflection;
it does not justify giving an LLM authoritative world access.

### Bounded Utility AI with validated affordances — selected

Advantages: one pass over local candidates, explainable considerations, direct
support for traits and needs, deterministic ordering, and easy future composition
with a planner or task executor.

Known risks:

- incomparable or badly normalized scores create arbitrary behavior;
- stable but equal scores can expose accidental iteration order;
- close scores can oscillate;
- random noise can make implausible actions win;
- scoring every possible world object would be too expensive and leak knowledge.

## Decision

The world-facing adapter, not the decision kernel:

1. catches up the explicit actor lazily;
2. reads only the actor, its current location, connected locations, local
   entities/objects and its own inventory;
3. creates structured action drafts from supported verbs;
4. previews every draft with the existing `validateAction`;
5. emits a filtered immutable decision input and candidate eligibility traces.

The pure decision kernel never receives `WorldState`. It:

- normalizes needs and traits to integer basis points `[0, 10000]`;
- uses integer weighted averages with explicit bounds;
- separates critical hunger/fatigue from normal preferences;
- adds only bounded, seed-derived noise to normal candidates;
- derives noise from `(seed, candidateKey)` rather than traversal order;
- sorts by stable candidate keys and documents equal-score tie breaking;
- applies a bounded commitment bonus, persisted only by the normal resolver after
  a successful autonomous action;
- returns the selected structured intention and a private diagnostic trace.

The selected action always passes through `resolveAction(state, actorId, action)`.
The resolver remains authoritative for validation, targets, consequences, time,
events and the autonomous commitment state. The service commits through
`ActionCommitPort`; an OCC conflict is explicit and never retried indefinitely.

## Score semantics

- Traits and persistent-goal strength are integers from 0 to 100.
- Needs retain the existing `0..100` satisfaction convention; urgency is
  `100 - satisfaction`.
- Considerations and final scores use integer basis points from 0 to 10,000.
- Missing legacy profiles receive the documented neutral profile.
- Present but malformed profiles fail explicitly; NaN, infinity, fractions and
  out-of-range values are rejected.
- Critical eligible food or sleep candidates form a separate priority tier.
  Seed noise and normal inertia cannot defeat that tier.
- Seed noise defaults to at most 1.2% of the scale.
- Ties are resolved by the stable candidate key, never insertion order or locale.

## Anti-oscillation

A successful autonomous action stores a small decision state on the acting entity:
the intent key and a bounded number of remaining commitment turns. Re-selecting
that intention receives a bounded bonus. A critical need bypasses the normal tier,
so commitment cannot block a vital interruption. Failed actions do not update the
commitment.

## Performance and levels of detail

Candidate generation touches only the acting entity, its location adjacency,
present entities/objects and its own inventory. It does not scan every world
entity. Scoring is linear in the number of prepared candidates and has no global
mutable cache. A later scheduler may choose which actors to activate and at what
simulation level; this ADR intentionally adds no server loop or cron.

## Deferred

- multi-step goals and GOAP planning;
- long-running task execution and behavior-tree/StateTree orchestration;
- autobiographical memory, relationships and reflection;
- learned response curves;
- sensory range beyond actor/location/public observation audiences;
- world-scale scheduling and simulation LOD policy;
- an LLM proposing dialogue wording from already authorized facts;
- automatic OCC retries.
