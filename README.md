# Kitaba

Kitaba est un RPG textuel en français organisé en monorepo TypeScript avec une
API Express, une interface React/Vite et PostgreSQL.

## Prérequis

- Node.js 24
- pnpm 11.9.0 (version déclarée par `packageManager`)
- PostgreSQL pour lancer l'API

Avec Corepack, activez la version attendue de pnpm :

```bash
corepack enable
corepack install
```

## Installation

```bash
pnpm install --frozen-lockfile
```

Le dépôt doit être installé avec pnpm. Le script `preinstall` supprime les
lockfiles npm/Yarn accidentels et refuse les autres gestionnaires de paquets.

## Variables d'environnement

L'API requiert :

- `DATABASE_URL` : chaîne de connexion PostgreSQL ;
- `PORT` : port d'écoute de l'API.

L'interface accepte facultativement `PORT` (défaut `5173`) et `BASE_PATH`
(défaut `/`). Le bac à maquettes utilise le port `5174` par défaut.

`NODE_ENV` est positionné automatiquement à `development` par la commande de
développement de l'API.

## Vérification

```bash
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run check
```

`check` exécute successivement le typecheck, les tests et le build.

## Lancement

API :

```bash
pnpm --filter @workspace/api-server run dev
```

Interface :

```bash
pnpm --filter @workspace/kitaba run dev
```

En développement, utilisez deux terminaux et configurez `DATABASE_URL` et
`PORT` dans l'environnement du terminal qui lance l'API.
