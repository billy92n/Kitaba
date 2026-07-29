# ADR 0003 — Scheduler mondial déterministe et niveaux de détail

- Statut : accepté
- Date : 2026-07-29
- Périmètre : étape 3

## Contexte et sources

Kitaba doit faire évoluer plusieurs milliers d’acteurs sans intervention du
joueur. Le scheduler ne choisit aucune action : il choisit seulement le
prochain acteur, son instant d’activation, son niveau de détail et le budget
consommé. Le décideur autonome construit ensuite l’intention et le moteur
existant reste l’unique autorité de validation, conséquences, temps,
événements, perception et persistance.

La conception s’appuie sur les références suivantes :

- le simulateur à événements discrets ns-3 traite les événements par ordre
  chronologique et départage les instants identiques de façon FIFO ; son
  ordonnanceur par tas est en `O(log n)` :
  <https://www.nsnam.org/docs/manual/html/events.html> ;
- ns-3 représente le temps avec un entier 64 bits :
  <https://www.nsnam.org/docs/release/3.36/doxygen/classns3_1_1_simulator.html> ;
- MASON utilise également une file prioritaire sérialisable, mais documente
  qu’un tas sans ordre secondaire explicite n’est pas stable :
  <https://people.cs.gmu.edu/~eclab/projects/mason/classdocs.22/sim/engine/Schedule.html> ;
- les travaux de Brogan et Hodgins montrent l’intérêt d’une interface de
  simulation simplifiée pour des foules de plusieurs milliers d’agents :
  <https://publications.ri.cmu.edu/simulation-level-of-detail-for-multiagent-control> ;
- Mass Gameplay applique des fréquences de mise à jour différentes à quatre
  niveaux `High`, `Medium`, `Low` et `Off` :
  <https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-gameplay-in-unreal-engine> ;
- Isaac Lab rappelle qu’une graine ne suffit pas si l’ordre des opérations
  varie :
  <https://isaac-sim.github.io/IsaacLab/develop/source/features/reproducibility.html> ;
- PostgreSQL documente le verrouillage des mises à jour concurrentes et
  recommande un ordre d’acquisition cohérent :
  <https://www.postgresql.org/docs/16/explicit-locking.html>.

## Alternatives étudiées

### Boucle globale à tick fixe

Simple, mais elle parcourt `O(n)` acteurs à chaque tick, y compris les acteurs
dormants. Elle est rejetée par l’invariant de simulation paresseuse.

### Roue temporelle ou buckets par LOD

Elle peut approcher `O(1)` pour des échéances bornées et régulières, mais rend
les réveils arbitraires, la persistance et les changements de cadence plus
complexes. Elle reste une optimisation future si les benchmarks le justifient.

### Calendar queue

Son coût amorti peut être inférieur à celui d’un tas, mais dépend fortement de
la distribution des échéances et nécessite un redimensionnement délicat. Cette
complexité n’est pas justifiée avant mesure.

### Timers du système d’exploitation ou tâches distribuées

Ils introduisent l’heure murale, l’ordre d’exécution de la plateforme et des
courses difficiles à rejouer. Ils sont incompatibles avec le déterminisme
Linux/Windows et sont rejetés.

### File d’événements discrète par tas

Cette solution offre sélection et réinsertion en `O(log n)`, une représentation
sérialisable et des réveils arbitraires. Elle est retenue sous forme d’un tas
gauchiste persistant : chaque transition ne recopie que le chemin modifié, ce
qui préserve simultanément l’immutabilité et la complexité logarithmique.

## Décision

### Temps et ordre total

Les échéances sont des minutes mondiales entières, jamais des flottants.
L’ordre total est :

1. `dueMinute` croissante ;
2. `actorId` comparé par ordre ordinal des unités de code UTF-16 ECMAScript.

Contrairement à un tas implicitement stable, cet ordre ne dépend ni de l’ordre
des propriétés JavaScript, ni de la plateforme. Une graine canonique est
dérivée de la graine mondiale, de la révision du scheduler, de l’acteur et de
son échéance.

### État persistant et compatibilité

`WorldState.scheduler` est optionnel. Une sauvegarde historique est amorcée une
seule fois en triant les identifiants de toutes ses entités ; aucune migration
SQL n’est requise car `WorldState` est déjà stocké en JSONB. Après amorçage, le
scheduler ne parcourt plus toutes les entités.

La file contient exactement une entrée par acteur connu. L’arbre persiste la
forme du tas gauchiste. Le validateur exhaustif destiné aux imports et aux
diagnostics vérifie tous les identifiants, doublons, rangs et relations de tas.
Le chemin chaud vérifie en temps constant l’enveloppe et la racine, puis chaque
nœud touché par la transition en `O(log n)`. Il ne reparcourt donc jamais le
monde entier à chaque batch. Un acteur dormant (`LOD3`) possède
`dueMinute: null` et reste après toutes les entrées actives jusqu’à un réveil
explicite.

### Niveaux de détail

Le premier contrat est volontairement étroit :

| LOD  | cadence par défaut | coût | sémantique           |
| ---- | -----------------: | ---: | -------------------- |
| LOD0 |             15 min |    8 | activation fréquente |
| LOD1 |             60 min |    4 | activation standard  |
| LOD2 |            360 min |    1 | activation espacée   |
| LOD3 |             aucune |    0 | dormant              |

Le LOD règle uniquement la fréquence et le coût de planification. Chaque
activation effective passe toujours par le décideur autonome et le moteur
complet. Kitaba n’invente donc pas de conséquences approximatives parallèles.
Une agrégation métier ne sera ajoutée que sous forme d’actions autoritaires du
moteur.

### Budget, équité et famine

Un batch possède un budget entier. La configuration est refusée si son budget
est inférieur au coût maximal d’un LOD actif : toute entrée en tête peut donc
être traitée au début d’un batch. Un acteur ne peut être activé qu’une fois par
batch. Après succès, il est réinséré à `heure finale + cadence`. Une exécution
répétée traite ainsi chaque échéance finie ; aucun acteur actif ne peut être
dépassé indéfiniment.

### Autorité et OCC

La sélection produit un `ScheduledActivation`, pas une mutation. Le moteur :

1. vérifie que l’activation correspond exactement à la racine et à la révision
   persistées ;
2. matérialise l’heure de l’échéance ;
3. résout l’action autonome existante ;
4. réinsère l’acteur et incrémente la révision du scheduler dans le même
   `WorldState`.

Le service persiste ce nouvel état exclusivement via `ActionCommitPort`. Un
conflit OCC interrompt immédiatement le batch, sans retry ni saut d’acteur.
Comme la transition du scheduler fait partie du même commit, un conflit ne
consomme ni échéance, ni budget persistant.

### Déterminisme des effets périphériques

Le scheduler dérive aussi les identifiants d’événement, narration et autosave,
le timestamp de narration et le choix de variante narrative. La graine de
décision ne dépend pas de la session, afin que deux mondes identiques prennent
la même décision. Les identifiants persistés incluent en revanche le
`sessionId`, car les clés primaires PostgreSQL sont globales. Les mêmes entrée,
graine, session et historique produisent donc la même chronologie observable
sans collision entre deux sessions. Le chemin interactif existant conserve ses
générateurs par défaut.

### Déclenchement opérationnel

Le bundle serveur contient un worker borné
`dist/worldSchedulerWorker.mjs`, lancé par `pnpm run scheduler:run`. Il reçoit
un monde explicite et les paramètres suivants :

- `KITABA_SCHEDULER_SESSION_ID` ;
- `KITABA_SCHEDULER_SEED` ;
- `KITABA_SCHEDULER_BUDGET_UNITS` (64 par défaut) ;
- `KITABA_SCHEDULER_MAX_BATCHES` (100 par défaut).

Le worker n’utilise jamais l’heure murale pour ordonner les acteurs. Un
superviseur externe peut invoquer ce programme ponctuellement ou
périodiquement ; l’invocation elle-même reste bornée et rejouable. Chaque batch
charge l’instantané persistant et toutes les écritures passent par
`ActionCommitPort`. Un conflit OCC interrompt le worker sans retry implicite :
un nouvel appel repart du dernier état validé.

Ce choix sépare l’ordonnancement déterministe interne du mécanisme de réveil du
processus, qui dépend nécessairement du déploiement. Il évite de cacher un
timer non déterministe dans l’API et permet à un orchestrateur de répartir les
mondes sans parcourir tous leurs acteurs.

## Conséquences

- amorçage et validation exhaustive explicite : `O(n log n)` ;
- activation : `O(log n)` en temps et en nouveaux nœuds immuables ;
- mémoire : `O(n)` ;
- aucune dépendance à `controlledEntityId` pour sélectionner ou décider ;
- les commandes pures de veille, réveil et changement de LOD sont disponibles ;
  leur persistance doit être incluse dans un futur commit d’action autoritaire,
  jamais écrite directement ;
- le benchmark de cœur couvre 10 000 acteurs ; un second protocole couvre
  1 000 activations réelles et séparées du service, incluant décision, moteur,
  perception, narration et OCC en mémoire ;
- PostgreSQL réécrit encore l’instantané JSONB et crée un autosave par action.
  La CI certifie son atomicité et ses conflits, mais sa latence dépend du
  déploiement et le benchmark de service ne la présente pas comme mesurée ;
- la persistance autonome d’une commande administrative de LOD, la
  parallélisation distribuée et les conséquences agrégées restent hors
  périmètre jusqu’à l’existence de primitives moteur correspondantes.
