# BetterCode Autonomous Packages

## Objectif

BetterCode doit rester capable de suivre les mises à jour OpenCode tout en portant ses propres fonctionnalités produit. Les fonctionnalités BetterCode qui n'ont pas besoin des internals OpenCode vivent donc dans des packages autonomes, avec des APIs testables et appelables depuis une CLI, un plugin, ou un wrapper.

Cette séparation évite de modifier directement le coeur OpenCode pour chaque fonctionnalité BetterCode. OpenCode reste la base d'exécution agentique; BetterCode ajoute une couche de mémoire projet, qualité, budget contexte, risque de diff et benchmark.

## Périmètre de la phase 4

Packages autonomes concernés:

- `packages/project-brain`
- `packages/quality-gate`
- `packages/context-budget`
- `packages/diff-risk`
- `packages/benchmark`
- `packages/shared`

Ces packages doivent rester indépendants des fichiers internes OpenCode.

Interdictions:

- Aucun import depuis `packages/opencode/src/...`
- Aucun import depuis `@opencode-ai/opencode`
- Aucun couplage à une structure de session, runner, TUI, serveur ou plugin interne OpenCode

Autorisations:

- Lire et écrire des fichiers projet
- Lire `package.json`, lockfiles, fichiers de config, diffs Git et fichiers `.bettercode`
- Appeler Git via `Bun.spawn`
- Exposer des fonctions pures, des fonctions async, ou des APIs facilement appelables depuis une CLI
- Dépendre des autres packages autonomes BetterCode via `@bettercode/*`

## Architecture cible

`packages/shared` est le contrat commun. Il contient uniquement les types partagés, sans logique métier ni dépendance OpenCode.

`packages/diff-risk` analyse les fichiers modifiés et le diff Git. Il produit un niveau de risque et des checks recommandés.

`packages/quality-gate` détecte le type de projet, les commandes disponibles, exécute les checks utiles et calcule un score qualité.

`packages/project-brain` maintient la mémoire projet BetterCode dans `.bettercode/brain`. Il doit préserver les notes utilisateur et remplacer uniquement ses sections générées.

`packages/context-budget` réduit logs, diffs, texte long et sections de mémoire projet pour respecter un budget approximatif de contexte.

`packages/benchmark` contiendra les mesures comparatives BetterCode. Pour l'instant, il expose un résultat placeholder typé et doit rester prêt à recevoir des scénarios réels.

## Contrats publics actuels

### `@bettercode/shared`

Rôle: types et interfaces partagés entre les packages autonomes.

Contrats exposés:

- `GateStatus`
- `CheckStatus`
- `RiskLevel`
- `PackageManager`
- `ProjectCommandName`
- `ProjectType`
- `ProjectInfo`
- `ProjectCommand`
- `AvailableCommands`
- `CheckResult`
- `QualityGateResult`
- `QualityGateRules`
- `QualityGateThresholds`
- `QualityGateScoreInput`
- `DiffRiskResult`
- `GitDiffSummary`
- `BenchmarkResult`
- `QualityGateCommandConfig`
- `QualityGateConfig`

Règle: ce package ne doit pas importer les autres packages BetterCode.

### `@bettercode/diff-risk`

Rôle: classifier le risque d'un changement sans dépendre d'OpenCode.

Contrats exposés:

- `analyzeDiffRisk(changedFiles: string[])`
- `analyzeGitDiff(rootPath: string)`
- `createPlaceholderDiffRiskResult()`

Entrées:

- Liste de fichiers modifiés
- Racine d'un dépôt Git

Sorties:

- Niveau de risque
- Raisons de risque
- Checks recommandés
- Statistiques de diff Git
- Warnings non bloquants si Git est indisponible ou si le dossier n'est pas un dépôt

### `@bettercode/quality-gate`

Rôle: détecter un projet, trouver les commandes disponibles, exécuter les checks et scorer le résultat.

Contrats exposés:

- `loadProjectConfig(rootPath: string)`
- `detectPackageManager(rootPath: string)`
- `detectAvailableCommands(rootPath: string)`
- `detectProject(rootPath: string)`
- `runQualityGate(rootPath: string)`
- `scoreQualityGate(input)`
- `createPlaceholderQualityGateResult()`

Fichiers lus:

- `.bettercode/quality-gate.json`
- `package.json`
- lockfiles
- fichiers de config projet
- diff Git via `@bettercode/diff-risk`

Règle: `runQualityGate` peut lancer des commandes projet, mais la logique de score doit rester testable sans shell.

### `@bettercode/project-brain`

Rôle: créer, mettre à jour et rechercher la mémoire projet BetterCode.

Contrats exposés:

- `brainInit(rootPath: string)`
- `brainUpdate(rootPath: string)`
- `brainSearch(rootPath: string, query: string)`
- `SearchResult`

Fichiers gérés:

- `.bettercode/brain/profile.md`
- `.bettercode/brain/history.md`
- `.bettercode/last-gate-result.json`
- `.bettercode/quality-gate.json`

Règle critique: les sections générées doivent être clairement bornées par les marqueurs BetterCode et les notes utilisateur doivent être préservées.

### `@bettercode/context-budget`

Rôle: réduire les contenus longs avant injection dans un prompt ou dans une mémoire de travail.

Contrats exposés:

- `CompressOptions`
- `BudgetConfig`
- `defaultBudget`
- `approxTokens(text: string)`
- `approxWords(text: string)`
- `compressLogs(text, options)`
- `compressDiff(text, options)`
- `limitTextByBudget(text, maxApproxTokens)`
- `selectRelevantBrainSections(query, brainText, maxApproxTokens)`

Règle critique: toute troncature doit inclure son marqueur dans le budget final.

### `@bettercode/benchmark`

Rôle: préparer les mesures comparatives BetterCode.

Contrat exposé:

- `createPlaceholderBenchmarkResult()`

Objectif suivant:

- Ajouter des scénarios reproductibles qui comparent BetterCode avec OpenCode sur coût, réussite des tâches, volume de contexte, nombre d'allers-retours et qualité des checks.

## Plan d'exécution agent

1. Vérifier l'état Git.

Commande:

```bash
git status --short
git branch --show-current
git log --oneline --decorate -5
```

Critère de passage:

- Le worktree est propre ou les changements non liés sont identifiés.
- La branche de travail est basée sur le `dev` attendu.

2. Vérifier l'existence des packages.

Commande:

```bash
rg --files packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared
```

Critère de passage:

- Chaque package possède un `package.json`, un `tsconfig.json` et un fichier `src/index.ts`.

3. Vérifier les noms publics.

Commande:

```bash
rg -n "\"name\":|@bettercode|@better-code|@opencode-ai/opencode" packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared
```

Critère de passage:

- Les packages autonomes BetterCode utilisent `@bettercode/*`.
- Les imports internes OpenCode sont absents.
- Le nom OpenCode peut rester dans les packages OpenCode upstream; il ne doit pas être renommé globalement pendant cette phase.

4. Vérifier les exports.

Commande:

```bash
rg -n "^export " packages/project-brain/src/index.ts packages/quality-gate/src/index.ts packages/context-budget/src/index.ts packages/diff-risk/src/index.ts packages/benchmark/src/index.ts packages/shared/src/index.ts
```

Critère de passage:

- Chaque fonctionnalité principale est exportée depuis `src/index.ts`.
- Les types partagés sont exportés depuis `@bettercode/shared`.

5. Vérifier l'absence de couplage OpenCode.

Commande:

```bash
rg -n "packages/opencode/src|@opencode-ai/opencode" packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared
```

Critère de passage:

- La commande ne retourne aucun résultat.

6. Lancer les tests et typechecks.

Commandes:

```bash
cd packages/project-brain && bun typecheck && bun test
cd packages/quality-gate && bun typecheck && bun test
cd packages/context-budget && bun typecheck && bun test
cd packages/diff-risk && bun typecheck && bun test
cd packages/shared && bun typecheck
cd packages/benchmark && bun typecheck && bun run build
```

Critère de passage:

- Tous les packages typecheckent.
- Tous les tests disponibles passent.
- `benchmark` build correctement même s'il n'a pas encore de suite de tests.

7. Committer uniquement le périmètre autonome.

Commande:

```bash
git add docs/bettercode-autonomous-packages.md packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared
git commit -m "refactor: isolate bettercode autonomous packages"
```

Critère de passage:

- Le commit ne contient pas de refactor global OpenCode.
- Le commit ne renomme pas `packages/opencode`.
- Le commit ne modifie pas les internals OpenCode sauf nécessité documentée, ce qui n'est pas attendu dans cette phase.

## Critères de sortie phase 4

La phase est complète quand:

- Les six packages autonomes existent.
- Les packages publient des APIs depuis `src/index.ts`.
- Les dépendances inter-packages utilisent `@bettercode/*`.
- Aucun package autonome n'importe les internals OpenCode.
- Les fonctions principales sont présentes:
  - `brainInit`
  - `brainUpdate`
  - `brainSearch`
  - `runQualityGate`
  - `scoreQualityGate`
  - `compressLogs`
  - `compressDiff`
  - `limitTextByBudget`
  - `selectRelevantBrainSections`
  - `analyzeDiffRisk`
  - `analyzeGitDiff`
  - `createPlaceholderBenchmarkResult`
- Les tests et typechecks ciblés passent.

## Risques à surveiller

Le risque principal est de réintroduire un couplage à OpenCode en important une fonction pratique depuis `packages/opencode/src`. Cette phase doit refuser ce raccourci.

Le deuxième risque est de refaire un rebrand global. Cette phase ne doit pas remplacer OpenCode partout. Elle doit seulement stabiliser les packages BetterCode autonomes et leurs noms publics.

Le troisième risque est d'avoir des APIs appelables uniquement depuis une CLI. Les packages doivent rester utilisables par un plugin, un wrapper, des tests ou un futur orchestrateur BetterCode.

## Phase suivante

La phase 5 peut construire le plugin BetterCode au-dessus d'OpenCode en consommant uniquement ces packages autonomes. Le plugin ne doit pas dupliquer leur logique. Il doit les orchestrer via leurs exports publics.
