# Kitaba

Un RPG textuel en français présenté comme une interface de chat. Le joueur incarne un personnage dans le village de Salma et interagit avec le monde en langage naturel.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port assigné par PORT)
- `pnpm --filter @workspace/kitaba run dev` — Interface frontend Kitaba
- `pnpm --filter @workspace/api-server run test` — 16 tests unitaires (vitest)
- `pnpm --filter @workspace/api-server run typecheck` — typecheck complet de l'API
- `pnpm run typecheck` — typecheck global monorepo
- `pnpm --filter @workspace/db run push` — migrer le schéma DB (dev uniquement)
- Required env: `DATABASE_URL` (Postgres), `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API : Express 5 + Drizzle ORM + PostgreSQL
- Frontend : React + Vite (thème sombre littéraire, Crimson Pro)
- Validation : Zod (`zod/v4`), `drizzle-zod`
- Tests : Vitest (`artifacts/api-server/src/tests/`)
- Build : esbuild (bundle ESM)

## Architecture Kitaba

### Principe fondamental
**Le LLM ne possède jamais la vérité du monde.** Il interprète l'intention du joueur et rédige la narration — c'est tout.

### Pipeline d'une action
```
playerInput
  → llm/interpretAction.ts   (faux LLM → StructuredAction validée par Zod)
  → engine/actionValidator.ts (est-ce possible ?)
  → engine/actionResolver.ts  (applique les conséquences, incrémente worldVersion)
  → engine/perceptionEngine.ts (filtre → PerceptibleFacts pour l'entité contrôlée)
  → llm/narrateResult.ts      (faux LLM → narration depuis PerceptibleFacts uniquement)
  → DB transaction atomique   (session + event journal + auto-save)
```

### Contrats entre modules
- `engine/` ne reçoit jamais de texte brut — seulement des `StructuredAction` validées
- `llm/narrateResult.ts` ne reçoit jamais `WorldState` — seulement `PerceptibleFacts`
- Le personnage contrôlé est une `Entity` ordinaire ; `WorldState.controlledEntityId` fait la distinction
- Chaque action incrémente `worldVersion` ; une action bloquée ne modifie rien
- Toute action est persistée dans le journal `kitaba_events` (immuable)
- L'auto-save est créé dans la même transaction PostgreSQL que la mise à jour de session
- Charger une sauvegarde crée une **nouvelle branche de session** — l'historique original est préservé

## Where things live

```
artifacts/api-server/src/
  domain/         — types du monde (Entity, WorldState, StructuredAction, PerceptibleFacts…)
  engine/         — moteur déterministe (validator, resolver, consequences, perception, time)
  llm/            — interprétation et narration (remplaçables par un vrai LLM)
  persistence/    — CRUD sessions, events, saves
  services/       — gameService.ts (orchestrateur)
  routes/         — routes HTTP (routes/game.ts)
  worldSeed.ts    — données initiales fixes du monde
  tests/          — 16 tests vitest (actionResolver, knowledgeIsolation, persistence)

artifacts/kitaba/src/
  components/     — UI React (chat, statuts, modals)
  pages/          — game.tsx (orchestrateur frontend)
  hooks/          — use-game-session.ts

lib/db/src/schema/kitaba.ts — tables Postgres (sessions, events, saves)
```

## DB Tables

| Table | Rôle |
|---|---|
| `kitaba_sessions` | État courant du monde + historique narratif + `worldVersion` |
| `kitaba_events` | Journal immuable de chaque action (factuel, non narratif) |
| `kitaba_saves` | Sauvegardes auto (`saveType="auto"`) et manuelles (`saveType="manual"`) |

## Gotchas

- Après tout changement du schéma `lib/db/src/schema/kitaba.ts` : recompiler lib/db (`tsc -p lib/db/tsconfig.json`) avant de typecheckor l'api-server — sinon les anciens `.d.ts` restent en cache.
- Les migrations DB ne passent pas en mode non-interactif via `drizzle-kit push` — appliquer les changements directement en SQL (`psql "$DATABASE_URL" -c "ALTER TABLE..."`) ou utiliser `push-force` dans un terminal interactif.
- Le module `zod/v4` nécessite que `zod` soit une dépendance directe du package — il n'est pas accessible via les dépendances transitives.

## User preferences

_Populer au fil des sessions._

## Pointers

- Voir le skill `pnpm-workspace` pour la structure workspace et les project references TypeScript.
