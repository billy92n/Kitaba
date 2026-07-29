# ADR 0002 — Deterministic autonomous decision core

- Status: accepted for step 2
- Date: 2026-07-29
- Base: `main@26132315d163074d4088d23ce9f4c374ed8502f3`

## Context and Kitaba constraints

Kitaba treats the simulation engine as the sole authority. An autonomous actor may
select an intention, but it may not read hidden world state, invent a verb, bypass
validation, mutate the world, produce consequences, or persist through a separate
write path. The same code must work for every explicit `actorId`.

This step needs a small, explainable one-action decision primitive. It does not yet
need multi-step planning, a global scheduler, autobiographical memory, or an LLM
agent.

## Sources consulted

Primary and official sources:

- David “Rez” Graham, [An Introduction to Utility
  Theory](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf):
  normalization makes considerations comparable and debuggable.
- Game AI Pro 3, [Choosing Effective Utility-Based
  Considerations](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter13_Choosing_Effective_Utility-Based_Considerations.pdf):
  response curves and extrema must be designed and tested deliberately.
- Jeff Orkin, [Three States and a Plan: The AI of
  F.E.A.R.](https://www.madwomb.com/tutorials/gamedesign/prototyping/gdc2006_JeffOrkin_AI_FEAR.pdf):
  GOAP can produce contextual plans from action preconditions and effects.
- Iovino et al., [A Survey of Behavior Trees in Robotics and
  AI](https://arxiv.org/abs/2005.05842): behavior trees improve modularity over
  large flat state machines, while still requiring authored hierarchy and
  execution semantics.
- Epic Games, [StateTree
  Overview](https://dev.epicgames.com/documentation/unreal-engine/overview-of-state-tree-in-unreal-engine):
  StateTree combines hierarchical state machines with behavior-tree selectors.
- Park et al., [Generative Agents: Interactive Simulacra of Human
  Behavior](https://arxiv.org/abs/2304.03442): observation, memory, planning and
  reflection are separable components; their ablation affects believability.
- Brogan and Hodgins, [Simulation Level of Detail for Multiagent
  Control](https://publications.ri.cmu.edu/simulation-level-of-detail-for-multiagent-control):
  thousands of agents require simplified, demand-driven simulation interfaces.
- NVIDIA Isaac Lab, [Reproducibility and
  Determinism](https://isaac-sim.github.io/IsaacLab/main/source/features/reproducibility.html):
  seeds alone are insufficient when operation order or floating-point execution
  can vary.

Open-source implementations inspected as architecture references, not copied:

- [BehaviorTree.CPP](https://github.com/BehaviorTree/BehaviorTree.CPP), a mature
  behavior-tree runtime with explicit node contracts and tooling.
- [cppGOAP](https://github.com/cpowell/cppGOAP) and
  [mountain-goap](https://github.com/caesuric/mountain-goap), compact examples of
  action/precondition planning and its search surface.

Experience reports, used only as anecdotal evidence:

- [GOAP branching and invalidation
  discussion](https://www.reddit.com/r/gameai/comments/175adnc/is_goap_really_that_bad/)
  reports combinatorial growth and plans invalidated by moving targets.
- [Large-NPC simulation
  discussion](https://www.reddit.com/r/roguelikedev/comments/1di80wc/)
  favors cheaper background representations over full simulation everywhere.
- [AI level-of-detail
  discussion](https://www.reddit.com/r/gamedev/comments/18psemk/)
  distinguishes visible behavior from reduced off-screen simulation.

## Alternatives

### Finite or hierarchical state machines

Advantages: explicit control flow, low runtime cost, familiar debugging.

Limits for Kitaba: transitions grow with the cross-product of needs, goals and
context. A state graph would encode preferences as transitions and become the
second source of truth for action availability.

### Behavior trees or StateTree

Advantages: modular reactive execution, natural support for long-running tasks and
interruptions, strong visualization opportunities.

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
