# Audit technique de Kitaba

Date de l'audit : 28 juillet 2026  
Périmètre : branche `main` de `billy92n/Kitaba`, archive GitHub examinée sans modification du code source.  
Méthode : lecture statique exhaustive des sources applicatives et des manifests, recherches transversales, installation, vérification TypeScript, tests, compilation et tentative de qualification du lancement.

## A. Résumé exécutif

Kitaba est un prototype monorepo TypeScript cohérent dans son intention : React/Vite appelle une API Express, laquelle orchestre interprétation, résolution déterministe, perception, narration et persistance PostgreSQL. Le dépôt contient un moteur réellement exécutable pour un petit sous-ensemble d'actions, une séparation explicite entre `WorldState`, moteur et narrateur, un contrat OpenAPI et 16 tests unitaires. Le typecheck global passe.

Le produit n'est toutefois pas prêt pour de nouvelles fonctionnalités sans consolidation. Les quatre risques principaux sont :

1. **Absence d'isolation des parties et d'authentification** : quiconque connaît ou obtient un identifiant peut jouer, sauvegarder ou charger une partie ; la liste des sauvegardes expose toutes les sauvegardes manuelles (`artifacts/api-server/src/routes/game.ts:31-100`, `artifacts/api-server/src/persistence/saveRepository.ts:74-83`).
2. **Perte de mises à jour concurrentes** : deux actions simultanées chargent la même version, produisent toutes deux `version + 1`, puis écrasent la session sans verrou ni condition sur `worldVersion` (`artifacts/api-server/src/services/gameService.ts:71-112`). Le schéma ne garantit pas non plus l'unicité `(sessionId, worldVersion)` (`lib/db/src/schema/kitaba.ts:26-38`).
3. **Philosophie “entité ordinaire” non respectée par le moteur** : validation, conséquences, temps et perception sont câblés sur `controlledEntityId`. Le moteur ne sait pas résoudre l'action d'un acteur arbitraire (`artifacts/api-server/src/engine/actionValidator.ts:33-63`, `artifacts/api-server/src/engine/consequenceEngine.ts:33-89`, `artifacts/api-server/src/engine/timeEngine.ts:73-82`).
4. **Contrats d'API divergents** : la sauvegarde réelle renvoie `{saveId, message}` alors que le client généré attend `saveName` et `savedAt`; `worldVersion` renvoyé par l'action n'existe pas dans le contrat (`artifacts/api-server/src/routes/game.ts:51-68`, `lib/api-spec/openapi.yaml:236-262`). L'interface affiche donc `response.saveName` indéfini (`artifacts/kitaba/src/pages/game.tsx:96-117`).

La séparation “le LLM ne modifie pas l'état” est bien tenue pour le chemin d'action actuel : l'interpréteur retourne une `StructuredAction`, le moteur produit l'état, et le narrateur reçoit `PerceptibleFacts` (`artifacts/api-server/src/services/gameService.ts:77-99`). En revanche, le faux interpréteur est un parseur lexical, le faux narrateur est un ensemble de templates aléatoires, et l'introduction contourne le filtre de perception en recevant directement `WorldState` (`artifacts/api-server/src/llm/interpretAction.ts:98-147`, `artifacts/api-server/src/llm/narrateResult.ts:11-134`).

Conclusion : **prototype partiellement fonctionnel, architecture de départ récupérable, mais persistance concurrente, sécurité, contrats et généricité du moteur doivent précéder toute extension fonctionnelle**. Une réécriture totale n'est pas justifiée.

## B. Architecture actuelle

### B.1 Arborescence utile

```text
.
├── artifacts/
│   ├── api-server/                 API Express et moteur de jeu
│   │   ├── build.mjs               bundle esbuild ESM
│   │   └── src/
│   │       ├── domain/             types actions, monde, entités, événements, perception
│   │       ├── engine/             validation, conséquences, temps, perception, résolution
│   │       ├── llm/                parseur et narrateur simulés
│   │       ├── persistence/        repositories PostgreSQL
│   │       ├── routes/             routes HTTP
│   │       ├── services/           orchestration transactionnelle
│   │       ├── tests/              16 tests unitaires
│   │       └── worldSeed.ts        monde initial statique
│   ├── kitaba/                     interface React/Vite
│   └── mockup-sandbox/             bac à maquettes générique Replit, sans maquette Kitaba
├── lib/
│   ├── api-spec/                   source OpenAPI et configuration Orval
│   ├── api-client-react/           client React Query généré
│   ├── api-zod/                    schémas Zod générés
│   └── db/                         connexion Drizzle et schéma PostgreSQL
├── scripts/                        exemple `hello.ts` et hook post-merge
├── attached_assets/                texte de cadrage importé
├── package.json                    orchestration du workspace
├── pnpm-workspace.yaml             packages, catalogue et overrides
├── pnpm-lock.yaml                  verrouillage des dépendances
└── tsconfig*.json                  configuration et références TypeScript
```

Les répertoires `artifacts/kitaba/src/components/ui/` et `artifacts/mockup-sandbox/src/components/ui/` sont deux copies quasi complètes du même kit UI. La seconde application ne contient aucune maquette sous `src/components/mockups`; elle sert d'outillage générique (`artifacts/mockup-sandbox/mockupPreviewPlugin.ts:8-9`, `artifacts/mockup-sandbox/src/App.tsx:3-39`).

### B.2 Rôle des applications, bibliothèques et modules

| Élément | Rôle vérifié | État synthétique |
|---|---|---|
| `@workspace/api-server` | API Express, moteur, orchestration, persistance | Partiellement fonctionnel |
| `@workspace/kitaba` | UI du jeu, état de session en mémoire, client généré | Partiellement fonctionnel |
| `@workspace/mockup-sandbox` | Prévisualiseur de maquettes Replit | Inutilisé pour Kitaba |
| `@workspace/api-spec` | Contrat OpenAPI et génération Orval | Utilisé, mais désynchronisé de l'API |
| `@workspace/api-client-react` | hooks React Query générés | Utilisé par l'UI |
| `@workspace/api-zod` | validation Zod générée des requêtes | Importé par l'API mais non utilisé dans les routes |
| `@workspace/db` | pool PostgreSQL, Drizzle, tables | Utilisé |
| `scripts` | squelette d'outillage | Sans fonction produit |

Dans l'API :

- `domain/` définit les structures, sans comportement métier (`artifacts/api-server/src/domain/actions.ts:5-25`, `artifacts/api-server/src/domain/world.ts:8-44`).
- `llm/interpretAction.ts` transforme le texte en action structurée par mots-clés et valide le résultat avec Zod (`artifacts/api-server/src/llm/interpretAction.ts:98-147`).
- `engine/actionValidator.ts` vérifie les préconditions (`artifacts/api-server/src/engine/actionValidator.ts:62-128`).
- `engine/consequenceEngine.ts` fabrique une copie superficielle et applique les changements (`artifacts/api-server/src/engine/consequenceEngine.ts:88-230`).
- `engine/timeEngine.ts` avance l'heure et dégrade les statistiques de l'entité contrôlée (`artifacts/api-server/src/engine/timeEngine.ts:4-82`).
- `engine/actionResolver.ts` enchaîne validation, conséquences, temps, version et événement (`artifacts/api-server/src/engine/actionResolver.ts:23-85`).
- `engine/perceptionEngine.ts` filtre le nouvel état en `PerceptibleFacts`.
- `llm/narrateResult.ts` génère des templates narratifs à partir de ces faits (`artifacts/api-server/src/llm/narrateResult.ts:11-125`).
- `services/gameService.ts` orchestre le pipeline et écrit session, événement et autosave dans une transaction (`artifacts/api-server/src/services/gameService.ts:63-150`).
- `persistence/` contient des repositories, mais `gameService` contourne leurs méthodes d'écriture en important directement les tables (`artifacts/api-server/src/services/gameService.ts:6-13`, `artifacts/api-server/src/persistence/worldRepository.ts:51-65`, `artifacts/api-server/src/persistence/eventRepository.ts:9-22`).

### B.3 Flux interface → serveur → moteur → base

```text
Game React
  → hooks React Query générés depuis OpenAPI
  → POST /api/game/action { sessionId, playerInput }
  → route Express (validation manuelle minimale)
  → gameService.loadSession()
  → interpréteur simulé : texte → StructuredAction
  → resolver : validation → conséquences → temps → worldVersion/event
  → perception : WorldState → PerceptibleFacts
  → narrateur simulé : PerceptibleFacts → texte
  → transaction PostgreSQL :
       UPDATE session snapshot/history
       INSERT event
       INSERT auto-save
  → réponse API → état React local
```

Le frontend ne reçoit pas `WorldState` et ne le mute pas. Il possède cependant un historique narratif temporaire distinct de la base : entrée joueur optimiste, messages système de sauvegarde et session entière uniquement en `useState` (`artifacts/kitaba/src/pages/game.tsx:66-111`, `artifacts/kitaba/src/hooks/use-game-session.ts:10-49`). Un rafraîchissement perd l'identifiant de session et l'historique affiché ; aucune route ne recharge une session courante par `sessionId`.

### B.4 Commandes documentées et réellement définies

Pré-requis vérifiés :

- Node.js 24 et pnpm sont annoncés (`replit.md:15-22`).
- `DATABASE_URL` est effectivement obligatoire dès l'import de `@workspace/db` (`lib/db/src/index.ts:7-14`).
- `SESSION_SECRET` est annoncé mais n'est lu nulle part (`replit.md:13`; absence d'usage dans les sources).
- `PORT` est obligatoire au lancement de l'API (`artifacts/api-server/src/index.ts:4-16`).

Commandes :

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/api-server run start
pnpm --filter @workspace/kitaba run dev
pnpm --filter @workspace/kitaba run serve
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-spec run codegen
```

Sources : scripts racine (`package.json:5-9`), API (`artifacts/api-server/package.json:6-11`), frontend (`artifacts/kitaba/package.json:6-10`), DB (`lib/db/package.json:10-12`) et spec (`lib/api-spec/package.json:5-6`).

Limites :

- `api-server dev` utilise `export NODE_ENV=development`, donc n'est pas portable sous `cmd.exe`/PowerShell (`artifacts/api-server/package.json:7`).
- aucun script racine ne lance simultanément API et UI ;
- aucun script de migration versionnée n'existe, seulement `drizzle-kit push` ;
- aucune commande lint, couverture, test frontend ou test d'intégration n'est définie.

## C. État réel de chaque composant

### C.1 Réellement fonctionnel

- Les types et références TypeScript du monorepo passent le typecheck global.
- Le seed produit un monde complet avec lieux, objets, entités, relations et temps (`artifacts/api-server/src/worldSeed.ts:9-196`).
- Le pipeline pur du moteur traite réellement `move`, `take`, `examine`, `eat` et `sleep`, avec validation et changement d'état (`artifacts/api-server/src/engine/actionValidator.ts:66-107`, `artifacts/api-server/src/engine/consequenceEngine.ts:93-210`).
- Une action réussie incrémente `worldVersion`; une action bloquée conserve l'état (`artifacts/api-server/src/engine/actionResolver.ts:27-63`).
- La perception limite les entités et objets au lieu courant et expose l'inventaire de l'acteur contrôlé ; les tests vérifient l'absence de relations et d'inventaires de PNJ.
- La transaction regroupe snapshot, événement et autosave (`artifacts/api-server/src/services/gameService.ts:101-141`).
- Le chargement d'une sauvegarde crée bien une nouvelle session (`artifacts/api-server/src/services/gameService.ts:176-195`).

### C.2 Partiellement implémenté

- `speak` est validé mais ne modifie aucune connaissance, relation, mémoire ou objectif ; le moteur retourne seulement “répond brièvement” (`artifacts/api-server/src/engine/consequenceEngine.ts:118-125`).
- `give` est accepté dès qu'une cible textuelle existe, sans vérifier destinataire ni objet, et n'applique aucun transfert (`artifacts/api-server/src/engine/actionValidator.ts:109-112`, `artifacts/api-server/src/engine/consequenceEngine.ts:213-219`).
- `use` est toujours accepté mais tombe dans le `default` sans conséquence ; le narrateur le traite comme action inconnue (`artifacts/api-server/src/engine/actionValidator.ts:118-120`, `artifacts/api-server/src/engine/consequenceEngine.ts:222-228`, `artifacts/api-server/src/llm/narrateResult.ts:112-124`).
- `examine` réussit même si rien n'est trouvé, incrémente le monde et crée un événement sans changement (`artifacts/api-server/src/engine/actionValidator.ts:91-94`, `artifacts/api-server/src/engine/consequenceEngine.ts:162-177`).
- `eat` ne vérifie pas `properties.edible` et remet l'objet consommé dans le monde avec `ownerId: null`, sans le supprimer (`artifacts/api-server/src/engine/actionValidator.ts:96-102`, `artifacts/api-server/src/engine/consequenceEngine.ts:180-193`).
- `take` permet de voler tout objet porté par une entité présente, sans règle de capacité, propriété, consentement ou relation (`artifacts/api-server/src/engine/actionValidator.ts:41-59`, `artifacts/api-server/src/engine/consequenceEngine.ts:128-159`).
- La persistance est atomique par requête, mais pas sérialisée entre requêtes concurrentes.
- Le journal d'événements stocke des chaînes techniques, pas des conséquences typées ou rejouables (`artifacts/api-server/src/domain/events.ts:6-16`).
- L'OpenAPI génère bien client et Zod, mais les routes ne valident pas avec les schémas générés (`artifacts/api-server/src/routes/game.ts:17-18`, `artifacts/api-server/src/routes/game.ts:33-35`).
- Le frontend fonctionne tant que l'API respecte implicitement le client, mais il ne restaure pas une session active après rafraîchissement (`artifacts/kitaba/src/hooks/use-game-session.ts:10-49`).

### C.3 Simulé ou mocké

- Le “LLM” d'interprétation est explicitement simulé et repose sur des mots-clés/heuristiques (`artifacts/api-server/src/llm/interpretAction.ts:1-3`, `artifacts/api-server/src/llm/interpretAction.ts:98-147`).
- Le narrateur est explicitement simulé, avec templates et `Math.random()` (`artifacts/api-server/src/llm/narrateResult.ts:1-3`, `artifacts/api-server/src/llm/narrateResult.ts:20-43`).
- Les tests nommés “persistence” ne mockent en fait aucun repository malgré l'import inutilisé de `vi`/`beforeEach`; ils testent seulement le resolver pur (`artifacts/api-server/src/tests/persistence.test.ts:3-11`, `artifacts/api-server/src/tests/persistence.test.ts:17-88`).
- La conversation des PNJ est une phrase fixe ; aucune décision de PNJ n'existe (`artifacts/api-server/src/engine/consequenceEngine.ts:118-125`).

### C.4 Inutilisé ou dupliqué

- `persistence/eventRepository.ts` n'est importé par aucun chemin applicatif ; `gameService` réimplémente l'insertion (`artifacts/api-server/src/persistence/eventRepository.ts:9-43`, `artifacts/api-server/src/services/gameService.ts:114-126`).
- `updateSession` et `createSave` sont définis mais contournés (`artifacts/api-server/src/persistence/worldRepository.ts:51-65`, `artifacts/api-server/src/persistence/saveRepository.ts:29-51`).
- `SESSION_SECRET` est documentation morte (`replit.md:13`).
- `cookie-parser` est une dépendance API non utilisée (`artifacts/api-server/package.json:16`; absence d'import).
- `@workspace/api-zod` est une dépendance de l'API mais aucun schéma de requête généré n'est utilisé par les routes (`artifacts/api-server/package.json:14`, `artifacts/api-server/src/routes/game.ts:17-18`).
- `scripts/src/hello.ts` et le mockup sandbox ne participent pas au produit.
- Les dizaines de composants UI de `kitaba` et `mockup-sandbox` sont largement non importés et dupliqués.
- `findLocationByQuery`, `findEntityAtLocation`, `findObjectAvailable` et `normalize` sont dupliqués entre validation et conséquences (`artifacts/api-server/src/engine/actionValidator.ts:16-60`, `artifacts/api-server/src/engine/consequenceEngine.ts:16-56`).
- Le schéma DB est réexporté par `persistence/schema.ts` alors que `gameService` importe directement `@workspace/db`, créant deux styles d'accès.
- Aucune dépendance circulaire directe entre modules applicatifs n'a été trouvée par l'examen des imports. Le couplage problématique observé est architectural (service → tables DB et repositories en parallèle), pas un cycle d'import vérifiable (`artifacts/api-server/src/services/gameService.ts:6-17`).

### C.5 Cassé ou incohérent

- Le contrat `SaveGameResponse` exige `saveName` et `savedAt`, mais la route retourne `message` (`lib/api-spec/openapi.yaml:250-262`, `artifacts/api-server/src/routes/game.ts:64`).
- `getManualSaves` retourne `worldVersion`, absent de `SaveInfo`; inversement l'écart n'est pas détecté car Express n'est pas typé par OpenAPI (`artifacts/api-server/src/services/gameService.ts:200-208`, `lib/api-spec/openapi.yaml:264-279`).
- L'API calcule et retourne `worldVersion` pour une action, absent d'`ActionResponse` (`artifacts/api-server/src/services/gameService.ts:63-70`, `lib/api-spec/openapi.yaml:236-248`).
- Le frontend ajoute optimistement l'entrée joueur, mais le serveur ne l'ajoute jamais à `narrativeHistory`; les sauvegardes ne conservent donc que les narrations (`artifacts/kitaba/src/pages/game.tsx:69-83`, `artifacts/api-server/src/services/gameService.ts:90-109`).
- En erreur, l'entrée optimiste n'est ni retirée ni marquée comme échouée (`artifacts/kitaba/src/pages/game.tsx:76-91`).
- Les actions bloquées créent un événement et un autosave avec le même `worldVersion`; plusieurs blocages produisent plusieurs événements/autosaves de même version et même nom logique (`artifacts/api-server/src/engine/actionResolver.ts:27-49`, `artifacts/api-server/src/services/gameService.ts:128-140`).
- `saveRepository` affirme que les autosaves suivent les actions réussies, tandis que `gameService` les crée aussi après échec (`artifacts/api-server/src/persistence/saveRepository.ts:1-4`, `artifacts/api-server/src/services/gameService.ts:128`).
- `generateIntroText` est dans le module LLM mais reçoit directement `WorldState`, en contradiction avec les commentaires du module et le principe strict (`artifacts/api-server/src/llm/narrateResult.ts:1-7`, `artifacts/api-server/src/llm/narrateResult.ts:128-134`).
- Le README ne documente rien au-delà du titre (`README.md:1`); `replit.md` est le seul document exploitable.

## D. Résultats des commandes exécutées

Environnement d'audit : Windows/PowerShell, Node `24.14.0`, pnpm `11.9.0`, dépôt téléchargé depuis l'archive GitHub officielle de `main`.

| Commande | Résultat | Interprétation |
|---|---|---|
| `pnpm install --frozen-lockfile` | **Échec** après installation des paquets | le `preinstall` appelle `sh`, absent sous Windows (`package.json:6`) |
| `pnpm install --frozen-lockfile --ignore-scripts` | **Succès** | permet les contrôles statiques ; ne prouve pas la portabilité de l'installation normale |
| `pnpm run typecheck` | **Succès** | libs, API, frontend, mockup sandbox et scripts passent |
| `pnpm --filter @workspace/api-server run test` | **Non exécuté : startup error** | Rollup ne trouve pas `@rollup/rollup-win32-x64-msvc` |
| `pnpm run build` | **Échec** | même module Rollup absent, premier échec dans `mockup-sandbox` |
| lancement API | **Non tenté au-delà de la qualification** | `DATABASE_URL` et `PORT` obligatoires ; aucune base PostgreSQL de test fournie (`lib/db/src/index.ts:7-14`, `artifacts/api-server/src/index.ts:4-16`) |
| lancement frontend | **Non concluant sans build portable/API opérationnelle** | l'application dépend des routes `/api`; aucun proxy autonome vers une API externe n'est configuré |

L'absence du binaire Rollup Windows n'est pas accidentelle : les overrides du workspace excluent explicitement `rollup>@rollup/rollup-win32-x64-msvc` ainsi que les autres binaires Windows de Rollup (`pnpm-workspace.yaml:103-125`). Elle empêche Vitest et Vite de démarrer sur cette plateforme. Le typecheck réussi prouve la cohérence TypeScript, pas le comportement des 16 tests.

La base n'a pas été créée ou migrée : exécuter `drizzle-kit push` aurait nécessité une cible `DATABASE_URL` et aurait constitué une mutation externe non justifiée par le dépôt.

## E. Écarts avec la philosophie de Kitaba

### E.1 Moteur source de vérité

**Partiellement conforme.** L'état autoritatif est chargé et écrit en PostgreSQL, et les conséquences viennent du resolver (`artifacts/api-server/src/services/gameService.ts:71-112`). Cependant :

- le snapshot JSON est la vérité courante, tandis que le journal n'est pas assez typé pour reconstruire le monde ;
- l'historique narratif, mélange de présentation et de persistance, est écrit avec le snapshot ;
- l'absence de contrôle optimiste permet à une requête obsolète d'écraser une vérité plus récente ;
- `narrativeHistory.push` mute l'objet chargé avant la transaction, même si cela reste local à la requête (`artifacts/api-server/src/services/gameService.ts:75-96`).

### E.2 Le LLM ne possède ni ne modifie l'état

**Conforme pour les actions ordinaires.** L'interpréteur ne reçoit que le texte, le resolver seul produit `newWorldState`, et le narrateur reçoit des faits filtrés (`artifacts/api-server/src/services/gameService.ts:77-99`).

**Écart limité mais réel :** `generateIntroText` reçoit le `WorldState` complet (`artifacts/api-server/src/llm/narrateResult.ts:128-134`). Le faux interpréteur copie aussi tout le texte dans `details` et `rawInput`, mais le moteur n'exécute pas de mutation libre fondée sur ces champs (`artifacts/api-server/src/llm/interpretAction.ts:135-147`).

### E.3 Joueur = entité ordinaire via `controlledEntityId`

**Conforme au niveau du type, non conforme au niveau des règles.**

- Un seul type `Entity` existe et `WorldState` porte `controlledEntityId` (`artifacts/api-server/src/domain/entities.ts:5-25`, `artifacts/api-server/src/domain/world.ts:33-43`).
- Mais les fonctions du moteur ne prennent pas `actorId` : elles lisent systématiquement l'entité contrôlée.
- La recherche de cible exclut spécialement `state.controlledEntityId` (`artifacts/api-server/src/engine/actionValidator.ts:33-38`, `artifacts/api-server/src/engine/consequenceEngine.ts:33-38`).
- Les conséquences donnent les objets et les effets vitaux uniquement à l'entité contrôlée (`artifacts/api-server/src/engine/consequenceEngine.ts:147-152`, `artifacts/api-server/src/engine/consequenceEngine.ts:180-203`).
- Le temps ne dégrade que l'entité contrôlée (`artifacts/api-server/src/engine/timeEngine.ts:73-82`).
- Les stats, connaissances, mémoires et objectifs sont optionnels et présents seulement sur le seed joueur (`artifacts/api-server/src/domain/entities.ts:16-24`, `artifacts/api-server/src/worldSeed.ts:20-26`).

Il existe donc bien des **règles spéciales au joueur**, même si elles sont formulées comme règles de “l'entité contrôlée”.

### E.4 Séparation état / résolution / perception / narration / persistance

**Bonne structure de dossiers, frontières imparfaites.**

- Résolution et narration sont correctement séparées.
- `gameService` mélange orchestration et SQL direct, court-circuitant la couche persistence (`artifacts/api-server/src/services/gameService.ts:101-141`).
- Le snapshot de session mélange état du monde et historique narratif (`lib/db/src/schema/kitaba.ts:12-20`).
- `ActionOutcome.observableFacts` est fabriqué par le moteur de conséquences, donc résolution et perception sont partiellement couplées (`artifacts/api-server/src/engine/consequenceEngine.ts:9-13`).
- Des descriptions visibles et informations potentiellement internes cohabitent comme chaînes libres dans les entités et relations.

### E.5 Connaissances limitées à ce qui est perçu ou appris

**Filtrage narrateur partiellement conforme, cognition absente.**

- Le narrateur d'action ne reçoit ni relations ni inventaires de PNJ, et les entités visibles sont limitées au lieu courant.
- Mais `mood` est explicitement transmis comme perceptible alors que le commentaire le qualifie implicitement de donnée visible sans modèle d'observation (`artifacts/api-server/src/domain/knowledge.ts:21-26`).
- `locationDescription` et `Entity.description` sont des chaînes omniscientes écrites dans le seed ; examiner un voisin connecté révèle sa description complète (`artifacts/api-server/src/engine/consequenceEngine.ts:74-80`).
- `knowledge`, `memories` et `objectives` ne sont utilisés par aucune décision, perception ou action (`artifacts/api-server/src/domain/entities.ts:21-24`).
- Aucun apprentissage, oubli, témoignage, croyance, provenance ou connaissance fausse n'est implémenté.
- Aucun personnage non contrôlé ne décide ou n'agit.

### E.6 Chaîne de décision recommandée

**Non implémentée.** Le modèle ne contient pas capacités, traits, valeurs, attachements, aspirations ou expérience. Les objectifs existent comme tableau optionnel de chaînes, relations comme données globales, connaissances comme chaînes optionnelles ; rien ne les relie à une décision (`artifacts/api-server/src/domain/entities.ts:21-24`, `artifacts/api-server/src/domain/relations.ts:3-8`). Il n'existe aucun moteur de décision de personnage.

## F. Problèmes classés par sévérité

### F.1 Bloquants

1. **Concurrence : mises à jour perdues et journal incohérent.** Lecture hors transaction, puis `UPDATE ... WHERE id = sessionId` sans verrou/version ; deux actions peuvent produire la même version et la dernière écrase la première (`artifacts/api-server/src/services/gameService.ts:71-112`). Aucun index unique ne protège `(sessionId, worldVersion)` (`lib/db/src/schema/kitaba.ts:26-38`).
2. **Aucune isolation ni autorisation des sessions/sauvegardes.** Toutes les routes sont publiques, CORS est ouvert, les IDs suffisent pour agir/charger, et `/game/saves` liste toutes les sauvegardes (`artifacts/api-server/src/app.ts:28-30`, `artifacts/api-server/src/routes/game.ts:31-100`, `artifacts/api-server/src/persistence/saveRepository.ts:74-83`).
3. **Contrat de sauvegarde cassé entre API et UI.** L'UI utilise `response.saveName`, absent de la réponse réelle (`artifacts/kitaba/src/pages/game.tsx:102-117`, `artifacts/api-server/src/routes/game.ts:64`, `lib/api-spec/openapi.yaml:250-262`).

### F.2 Majeurs

1. **Moteur non générique et règles spécifiques à l'entité contrôlée** (`artifacts/api-server/src/engine/actionValidator.ts:33-63`, `artifacts/api-server/src/engine/consequenceEngine.ts:88-203`, `artifacts/api-server/src/engine/timeEngine.ts:73-82`).
2. **Installation/tests/build non portables sous Windows.** `sh` obligatoire et binaires Rollup Windows exclus (`package.json:6`, `pnpm-workspace.yaml:103-125`).
3. **Aucune vraie couverture de persistance.** Le fichier dédié ne touche ni DB ni repositories (`artifacts/api-server/src/tests/persistence.test.ts:3-11`).
4. **État JSON non validé à la lecture.** Les casts `unknown as WorldState` et `unknown as NarrativeEntry[]` acceptent toute donnée corrompue ou ancienne (`artifacts/api-server/src/persistence/worldRepository.ts:42-47`, `artifacts/api-server/src/persistence/saveRepository.ts:60-70`).
5. **Historique canonique incomplet.** Les paroles/actions du joueur ne sont jamais persistées dans `narrativeHistory` (`artifacts/kitaba/src/pages/game.tsx:69-83`, `artifacts/api-server/src/services/gameService.ts:90-109`).
6. **Actions mensongères.** `give` et `use` peuvent réussir sans conséquence, puis narration affirme un échange ou présente l'action comme inconnue (`artifacts/api-server/src/engine/actionValidator.ts:109-120`, `artifacts/api-server/src/engine/consequenceEngine.ts:213-228`, `artifacts/api-server/src/llm/narrateResult.ts:81-87`).
7. **Journal non rejouable et doublons de version sur échecs.** Événements libres et autosaves portant une version inchangée (`artifacts/api-server/src/domain/events.ts:6-16`, `artifacts/api-server/src/services/gameService.ts:114-140`).

### F.3 Moyens

1. Entrées HTTP validées par assertions permissives plutôt que par les schémas Zod générés ; aucune limite de taille (`artifacts/api-server/src/routes/game.ts:17-18`, `artifacts/api-server/src/routes/game.ts:33-35`, `artifacts/api-server/src/routes/game.ts:53-55`).
2. `express.json()` et `urlencoded()` utilisent les limites/configurations par défaut et CORS accepte toute origine (`artifacts/api-server/src/app.ts:28-30`).
3. Aucun rate limiting ; des requêtes peuvent créer sessions/saves et déclencher des écritures sans limite (`artifacts/api-server/src/routes/game.ts:15-100`).
4. L'autosave pruning ignore silencieusement toute erreur et s'exécute hors transaction, avec course possible entre nettoyages (`artifacts/api-server/src/services/gameService.ts:143-144`, `artifacts/api-server/src/persistence/saveRepository.ts:99-113`).
5. Pas de clés étrangères entre sessions, événements et sauvegardes, ni checks de `saveType`, versions ou statistiques (`lib/db/src/schema/kitaba.ts:12-57`).
6. L'objet consommé devient un objet sans propriétaire ni lieu au lieu d'être supprimé/archivé (`artifacts/api-server/src/engine/consequenceEngine.ts:180-193`).
7. Les objets portés par les PNJ sont considérés “disponibles” et peuvent être pris directement (`artifacts/api-server/src/engine/actionValidator.ts:52-59`).
8. Le temps et les besoins n'affectent pas les PNJ ; `health` ne change jamais (`artifacts/api-server/src/engine/timeEngine.ts:73-82`).
9. `Math.random()` rend la narration non reproductible et aucun RNG injecté n'est disponible pour les tests (`artifacts/api-server/src/llm/narrateResult.ts:20-43`).
10. Les repositories sont contournés/dupliqués, ce qui rend les invariants difficiles à centraliser (`artifacts/api-server/src/services/gameService.ts:6-13`, `artifacts/api-server/src/services/gameService.ts:101-141`).
11. L'UI garde la session uniquement en mémoire et ne peut pas reprendre après rafraîchissement (`artifacts/kitaba/src/hooks/use-game-session.ts:10-49`).
12. L'entrée optimiste reste affichée après échec réseau (`artifacts/kitaba/src/pages/game.tsx:69-91`).
13. Aucun test frontend, route HTTP, contrat OpenAPI, concurrence, migration, sécurité ou intégration DB.

### F.4 Mineurs

1. `ActionType` est strict, mais `GameEvent.actionType` et `SaveRecord.saveType` retombent à `string` (`artifacts/api-server/src/domain/events.ts:10`, `artifacts/api-server/src/persistence/saveRepository.ts:20`).
2. Identifiants métier tous aliasés à `string`, sans types nominaux ; `EntityId` est défini deux fois (`artifacts/api-server/src/domain/entities.ts:5`, `artifacts/api-server/src/domain/world.ts:4-6`).
3. `WorldObject.properties` est un `Record<string, unknown>` et les JSON DB sont non typés (`artifacts/api-server/src/domain/world.ts:24-30`, `lib/db/src/schema/kitaba.ts:16-17`).
4. Les règles de recherche/normalisation sont dupliquées et approximatives (`artifacts/api-server/src/engine/actionValidator.ts:16-60`, `artifacts/api-server/src/engine/consequenceEngine.ts:16-56`).
5. `findLocationByQuery` contient deux fois `l'` dans la regex (`artifacts/api-server/src/engine/actionValidator.ts:22`, `artifacts/api-server/src/engine/consequenceEngine.ts:22`).
6. `examine` incrémente la version même sans mutation (`artifacts/api-server/src/tests/actionResolver.test.ts:76-84`).
7. `createdAt` est ajouté dynamiquement au résultat typé `GameEvent` sans être déclaré dans l'interface (`artifacts/api-server/src/persistence/eventRepository.ts:31-43`, `artifacts/api-server/src/domain/events.ts:6-16`).
8. Documentation principale vide et informations opérationnelles enfermées dans `replit.md` (`README.md:1`, `replit.md:5-82`).
9. `clearSession` accompagne un message disant que la progression sera “effacée”, alors que la DB n'est pas supprimée (`artifacts/kitaba/src/pages/game.tsx:158-166`).

## G. Architecture cible recommandée

Conserver le monorepo et les applications, mais rendre les frontières exécutables :

```text
UI
  → API contract (OpenAPI/Zod, auth, idempotency key)
  → Application service / command handler
      → Session repository (transaction + verrou/version attendue)
      → Intent interpreter (texte → ActionIntent, aucune mutation)
      → Engine.resolve(world, actorId, action)
          → constraints
          → capabilities
          → rule handlers typés
          → typed domain events
      → Projector.apply(events, world) → WorldState
      → Perception.build(world, observerId, events)
      → Narrator(perception DTO only)
      → atomic persistence (events + snapshot + transcript)
```

Principes cibles :

- `resolveAction(state, actorId, action, context)` doit fonctionner pour toute entité ; `controlledEntityId` reste uniquement un choix de contrôle dans la session.
- Chaque action possède un handler unique réunissant recherche de cible, préconditions et conséquences, évitant la duplication validator/consequence.
- Les événements sont une union discriminée (`EntityMoved`, `ObjectTransferred`, `NeedChanged`, etc.) et le snapshot est une projection/cache, pas une seconde vérité indépendante.
- Le transcript (`player`, `narrator`, `system`) est séparé du `WorldState` mais persisté atomiquement avec la commande.
- Les JSON lus sont validés/versionnés avec Zod et migrés explicitement.
- Une commande porte `expectedWorldVersion` et `idempotencyKey`; l'UPDATE conditionne `id` + version, ou utilise `SELECT ... FOR UPDATE`.
- Une contrainte unique protège `(session_id, world_version, sequence)` et des FK protègent les appartenances.
- Le narrateur ne reçoit jamais `WorldState`, y compris pour l'introduction ; celle-ci passe par une perception initiale.
- Les personnages disposent progressivement de composants structurés : capacités, traits, valeurs, attachements, aspirations, objectifs, relations, connaissances/beliefs avec provenance, expérience.
- Un `DecisionEngine` produit une action pour n'importe quelle entité suivant la chaîne demandée, sans branche “player”.
- Auth/session ownership, CORS allowlist, limites de payload, rate limiting et validation des entrées entourent l'API.

## H. Plan de migration progressif

### Étape 0 — Figer et mesurer

1. Rendre installation et tests portables, sans changer le comportement.
2. Ajouter CI Linux + Windows et couverture.
3. Ajouter des tests de caractérisation pour chaque action existante, contrats HTTP et réponse UI.

### Étape 1 — Réparer les frontières externes

1. Aligner OpenAPI, routes et client généré, puis ajouter un test de contrat.
2. Valider toutes les requêtes/réponses avec Zod.
3. Persister les entrées joueur et introduire une route de reprise de session.
4. Ajouter ownership/authentification avant d'exposer les sauvegardes.

### Étape 2 — Sécuriser la persistance

1. Introduire migrations versionnées, FK, checks et contraintes uniques.
2. Centraliser toutes les écritures dans les repositories.
3. Ajouter verrouillage optimiste/pessimiste et clé d'idempotence.
4. Tester PostgreSQL réel avec actions concurrentes, rollback et reprise.
5. Valider/versionner les snapshots JSON à la lecture.

### Étape 3 — Généraliser le moteur sans réécriture

1. Ajouter `actorId` aux APIs `validate/resolve/applyTime/perceive`.
2. Remplacer chaque lecture de `controlledEntityId` dans le moteur par l'acteur passé.
3. Garder `controlledEntityId` dans la couche session/UI seulement.
4. Déplacer les fonctions de résolution de cible dans un composant commun.
5. Transformer progressivement les conséquences textuelles en événements discriminés.

### Étape 4 — Compléter les actions existantes

1. Désactiver explicitement `give`/`use` ou les implémenter complètement.
2. Vérifier `edible`, propriété, visibilité, capacité et consentement.
3. Décider la sémantique de `examine` et des actions sans mutation.
4. Rendre narration et perception déterministes/testables via dépendances injectées.

### Étape 5 — Introduire cognition et autonomie

1. Ajouter les composants de personnalité/connaissance sous formes structurées et optionnelles pour toutes les entités.
2. Construire perception/apprentissage/croyances avec provenance.
3. Implémenter un évaluateur de décision pur, explicable, selon l'ordre :
   contraintes → capacités → traits → valeurs → attachements → aspirations → objectifs → relations → connaissances → expérience.
4. Faire produire aux PNJ les mêmes `StructuredAction` que l'entité contrôlée.
5. Ajouter scheduler/tours et tests de non-omniscience.

### Étape 6 — Branches et journal

1. Définir identité de branche/session/save et parentage.
2. Rendre le journal rejouable et vérifier snapshot = projection(events).
3. Séparer conservation d'autosaves et historique immuable.

## I. Liste des fichiers à modifier lors de la prochaine mission

Priorité immédiate, sans inclure les fichiers qui pourraient être créés :

1. `package.json` — portabilité du `preinstall`, scripts CI/test.
2. `pnpm-workspace.yaml` — overrides Rollup/esbuild compatibles avec les plateformes ciblées.
3. `lib/api-spec/openapi.yaml` — réaligner toutes les réponses, versions et erreurs.
4. `artifacts/api-server/src/routes/game.ts` — validation Zod, contrat, auth/ownership, limites.
5. `artifacts/api-server/src/services/gameService.ts` — concurrence, transcript complet, repositories.
6. `artifacts/api-server/src/persistence/worldRepository.ts` — update conditionnel/verrou, validation snapshot.
7. `artifacts/api-server/src/persistence/eventRepository.ts` — unicité et événements typés.
8. `artifacts/api-server/src/persistence/saveRepository.ts` — ownership, pruning sûr, types stricts.
9. `lib/db/src/schema/kitaba.ts` — contraintes, FK, idempotence, transcript/ownership.
10. `artifacts/api-server/src/domain/actions.ts` — acteur/contexte et actions discriminées.
11. `artifacts/api-server/src/domain/events.ts` — union d'événements rejouables.
12. `artifacts/api-server/src/domain/entities.ts` — composants communs à toutes les entités.
13. `artifacts/api-server/src/domain/knowledge.ts` — perception et connaissances structurées.
14. `artifacts/api-server/src/engine/actionValidator.ts` — acteur générique et règles partagées.
15. `artifacts/api-server/src/engine/consequenceEngine.ts` — acteur générique, handlers complets.
16. `artifacts/api-server/src/engine/actionResolver.ts` — `actorId`, événements typés.
17. `artifacts/api-server/src/engine/timeEngine.ts` — effets sur entités concernées, pas uniquement contrôlée.
18. `artifacts/api-server/src/engine/perceptionEngine.ts` — `observerId`, règles de visibilité.
19. `artifacts/api-server/src/llm/narrateResult.ts` — supprimer tout accès à `WorldState`, RNG injecté.
20. `artifacts/api-server/src/llm/interpretAction.ts` — interface d'adaptateur et sortie discriminée.
21. `artifacts/api-server/src/tests/actionResolver.test.ts` — couverture de toutes les actions/acteurs.
22. `artifacts/api-server/src/tests/knowledgeIsolation.test.ts` — perception de plusieurs observateurs.
23. `artifacts/api-server/src/tests/persistence.test.ts` — vrais tests DB/concurrence.
24. `artifacts/kitaba/src/pages/game.tsx` — rollback optimiste et réponse save correcte.
25. `artifacts/kitaba/src/hooks/use-game-session.ts` — reprise/persistance contrôlée de session.
26. `README.md` et `replit.md` — documentation réelle et commandes portables.

Les clients générés sous `lib/api-client-react/src/generated/` et `lib/api-zod/src/generated/` devront être **régénérés**, pas édités manuellement, après correction d'OpenAPI.

Fichiers nouveaux probablement nécessaires lors de la mission suivante : migrations SQL, middleware d'authentification/ownership, schémas Zod du domaine, tests HTTP/DB, configuration CI. Leurs noms exacts doivent suivre les choix d'outillage de la prochaine mission.

## J. Questions réellement impossibles à résoudre depuis le dépôt

1. Quel modèle d'identité est attendu : compte utilisateur, session anonyme signée, ou jeu local mono-utilisateur ?
2. Les parties/sauvegardes doivent-elles être privées par utilisateur, partageables, ou publiques ?
3. PostgreSQL et ses migrations existent-ils déjà hors dépôt, et quel est le schéma réellement déployé ?
4. Quelles plateformes sont officiellement supportées (Linux/Replit uniquement, Windows développeur, macOS) ?
5. Quel fournisseur/modèle LLM, quel budget, quelles contraintes de latence et quelle politique de rétention sont prévus ?
6. Le journal d'événements doit-il être la source de vérité rejouable, ou le snapshot DB reste-t-il autoritatif avec journal d'audit secondaire ?
7. Une action bloquée doit-elle consommer du temps, produire un événement, produire un autosave, ou rien de tout cela ?
8. Les descriptions, humeurs et relations du seed sont-elles publiques, observables avec difficulté, ou secrètes ?
9. Quelle sémantique produit est voulue pour `give`, `use`, `attack`, `speak`, la mort et la consommation d'objets ?
10. Les PNJ doivent-ils agir en temps continu, par tour joueur, ou via événements planifiés ?
11. Le déterminisme doit-il couvrir uniquement l'état du monde, ou aussi la narration et les décisions probabilistes ?
12. Quelle politique de compatibilité/migration appliquer aux sauvegardes existantes après évolution du schéma du monde ?
13. Le dossier `mockup-sandbox` et `attached_assets` doivent-ils rester dans le produit final ?
14. Existe-t-il des tests, secrets, services, contraintes de déploiement ou incidents connus non versionnés dans ce dépôt ?

---

### Verdict

Le squelette est sain et mérite une évolution incrémentale. Les frontières conceptuelles existent déjà, mais elles ne sont pas encore garanties par les signatures, les contraintes DB et les tests. La prochaine mission devrait traiter dans cet ordre : **contrats et sécurité → concurrence/persistance → moteur multi-acteur → complétude des actions → cognition des PNJ**.
