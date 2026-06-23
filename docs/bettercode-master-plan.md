# BetterCode Master Plan: Wrapper + Plugin + Autonomous Packages

> **Review status**: Reviewed twice against the actual codebase. All plugin loader
> mechanics, hook signatures, export lists, and package coupling claims have been
> verified against source. See "Review Audit Trail" at the bottom.

## Summary

Build BetterCode as a maintainable layer above OpenCode, not a fork.

- **BetterCode CLI** = user-facing wrapper that delegates to OpenCode.
- **OpenCode** = upstream agentic engine, kept easy to update.
- **BetterCode plugin** = memory, brain, quality gate, context budget, agent autonomy — wired into OpenCode via its plugin Hooks interface.
- **`.bettercode/`** = BetterCode config (source of truth for BetterCode features).
- **`.opencode/`** = OpenCode config (modified minimally by sync to register the plugin).
- **Patches** = forbidden unless an extension point is genuinely missing from OpenCode.

## Critical Architecture Decisions (verified against source)

These decisions are grounded in the actual OpenCode plugin loader source at
`packages/opencode/src/plugin/shared.ts` and `packages/opencode/src/config/plugin.ts`.

### Decision 1: Plugin registration via file-path auto-discovery, NOT npm string

OpenCode's plugin loader (`shared.ts:207` `resolvePluginTarget`) treats any
non-path string spec as an npm package and calls `Npm.add(pkg)` to install it.
Since `@bettercode/plugin` is `private: true` and never published, a string spec
like `"@bettercode/plugin"` will fail at install time.

**Solution**: Use OpenCode's built-in auto-discovery. The config loader
(`config/plugin.ts:21`) globs `{plugin,plugins}/*.{ts,js}` under `.opencode/`
and registers every match as a file-path plugin. So `bettercode sync` creates
a tiny re-export file at `.opencode/plugin/bettercode.ts` that imports and
re-exports the plugin's default export from the workspace package. This
completely bypasses the npm install path.

### Decision 2: Plugin must default-export `{ id, server }`

The loader (`shared.ts:272` `readV1Plugin`) requires `mod.default` to be an
object with a `server()` function. The ID resolver (`shared.ts:306`
`resolvePluginId`) **throws** for file-path plugins that lack an `id` string.
So the plugin module must be:

```ts
export default { id: "bettercode", server } satisfies PluginModule
```

A named export will NOT load. Missing `id` will throw.

### Decision 3: `bettercode run` must pass `--conditions=browser`

OpenCode's `@opentui/*` and `solid-js` imports require the `browser` resolution
condition. The root `package.json` dev script uses
`bun run --cwd packages/opencode --conditions=browser src/index.ts`. The
wrapper's `bettercode run` delegation must replicate these conditions or the
OpenCode CLI will crash at startup on import resolution.

### Decision 4: Tool definitions use the `tool()` helper from `@opencode-ai/plugin`

The `Hooks.tool` field is `{ [key: string]: ToolDefinition }` — a map, not an
array. `ToolDefinition` is `ReturnType<typeof tool>` where `tool()` is imported
from `@opencode-ai/plugin` (`packages/plugin/src/tool.ts:45`). It uses `zod`
for parameter schemas. The plugin must use this helper, not hand-rolled objects.

## Current State (verified)

All Phase 0-2 operations are **already complete**:

| Item | Status |
|---|---|
| Repo | `C:\Users\olo\Programmes\bettercode` |
| Current branch | `plugin-wrapper` (at `274f26df5`) |
| `dev` branch | Reset to `274f26df5` (pre-rebrand base) |
| `full-rebrand` archive | Pushed to `origin` at `5cdaa61e2` |
| `archive-full-rebrand` | Local backup at `5cdaa61e2` |
| `origin` remote | `https://github.com/AlexRzk/bettercode` |
| `upstream` remote | `https://github.com/anomalyco/opencode` (fetched) |
| Working tree | Clean |

## Key Architecture Problems Found in the Original Plan

These were discovered by auditing the actual codebase against the plan. The corrected plan below resolves them.

### Problem 1: `packages/cli` is a hybrid that couples OpenCode and BetterCode

`packages/cli` (`@bettercode/cli`) currently mixes:
- **OpenCode CLI runtime**: `src/index.ts`, `src/commands/`, `src/framework/` — depends on `@opencode-ai/core`, `@opencode-ai/sdk`, `@opencode-ai/server`, `@opencode-ai/tui`.
- **BetterCode wrapper commands**: `src/bettercode.ts`, `src/spec.ts` — depends on `@bettercode/quality-gate`, `@bettercode/project-brain`, `@bettercode/diff-risk`.
- **Bin entries**: `bettercode` and `lildax` point to the BetterCode wrapper, not the OpenCode CLI.

This coupling means every upstream merge touches `packages/cli` and risks conflicts. **Solution**: extract BetterCode wrapper code into a new `packages/bettercode-cli` and restore `packages/cli` to upstream-pure.

### Problem 2: `packages/bettercode/` is an empty shell

`packages/bettercode/` contains only `node_modules/`. The original plan never addresses it. **Solution**: remove it and create `packages/bettercode-plugin/` as a new package.

### Problem 3: Phase 6 and Phase 7 overlap

Phase 6 (`bettercode sync`, `bettercode init`) and Phase 7 (config sync rules) describe the same mechanism. **Solution**: merged — Phase 6 extracts the wrapper CLI, Phase 7 implements sync/doctor within that wrapper.

### Problem 4: Roadmap (Phase 9) should come before implementation

Planning the feature roadmap after building the plugin and CLI is backwards. **Solution**: moved to Phase 3, before any code extraction.

### Problem 5: Plugin hook mapping is unspecified

The original plan says "inject brain context" and "add tools" without specifying which OpenCode plugin hooks are used. The `@opencode-ai/plugin` SDK exposes a rich `Hooks` interface. **Solution**: map each BetterCode feature to a specific hook (see Phase 5 table).

### Problem 6: `bettercode run` delegation mechanism is undefined

The plan says `bettercode run -- [opencode args...]` delegates to OpenCode but doesn't specify how. **Solution**: define the delegation as spawning the OpenCode CLI entrypoint with `--conditions=browser` within the monorepo.

### Problem 7: The pre-rebrand base already has BetterCode modifications

Even at `274f26df5`, `packages/cli` is already named `@bettercode/cli` with `bettercode`/`lildax` bins. This is not pure upstream OpenCode. **Solution**: restore `packages/cli` to match upstream, with the BetterCode wrapper in a separate package.

### Problem 8: `packages/cli/src/spec.ts` is BetterCode code inside the OpenCode CLI package

`generateSpec` uses `@bettercode/diff-risk` and reads `.bettercode/brain/`. This file should move to the BetterCode wrapper. **Verified**: only `src/bettercode.ts:8` imports `src/spec.ts` (the BetterCode one). The `src/framework/spec.ts` is a separate OpenCode file (command spec framework using `effect/unstable/cli/Command`) — must NOT be touched.

### Problem 9: Global memory API is documented but has no package home

The autonomous-packages doc describes `globalBrainInit`, `globalBrainSearch`, `proposeGlobalMemory`, `acceptGlobalMemory`, `pruneGlobalMemory` as future APIs for `@bettercode/project-brain`, but the current code only has `brainInit`, `brainUpdate`, `brainSearch`. **Solution**: document as post-v1 scope, not Phase 4.

### Problem 10: Patch mechanism is unclear

The plan mentions `patches/opencode/` but the existing `patches/` directory uses Bun's `patchedDependencies` for npm package patches. OpenCode source patches are different. **Solution**: clarify that OpenCode patches are maintained as git cherry-picks or diff files, not Bun patches.

### Problem 11: `lildax.cjs` is not a simple alias

`packages/cli/bin/lildax.cjs` is a 4.6KB signal-forwarding spawn wrapper (handles SIGINT/SIGTERM/SIGHUP), more robust than `bettercode.cjs` (18 lines). **Solution**: port the signal-forwarding logic into the new wrapper's bin, and preserve `lildax` as an alias if users depend on it.

### Problem 12: Stale `specs/bettercode-rename.md` contradicts the new architecture

`specs/` already contains `bettercode-rename.md` from the rebrand era, which contradicts the "no global rename" decision. **Solution**: archive or remove it in Phase 3.

---

## Package Dependency Graph (arrows = "depends on")

```
@bettercode/shared          (types only, no deps)
    ↑
@bettercode/diff-risk       → depends on shared
    ↑
@bettercode/quality-gate    → depends on diff-risk, shared
    ↑
@bettercode/project-brain   → depends on quality-gate
@bettercode/context-budget  → no BetterCode deps (standalone)
@bettercode/benchmark       → depends on shared

@bettercode/plugin          → depends on project-brain, quality-gate, context-budget, @opencode-ai/plugin
@bettercode/cli-wrapper     → depends on project-brain, quality-gate, diff-risk, benchmark, shared
                                 (delegates to OpenCode CLI via spawn, does NOT import @opencode-ai/*)
```

Rule: autonomous packages (`shared`, `diff-risk`, `quality-gate`, `project-brain`, `context-budget`, `benchmark`) never import from `packages/opencode/src/` or `@opencode-ai/opencode`. Only `@bettercode/plugin` may import from `@opencode-ai/plugin` (for hook types and the `tool()` helper). `@bettercode/cli-wrapper` delegates to OpenCode via process spawn, not import.

---

## Phase 0: Archive the Full Rebrand — DONE

**Status**: Complete. Verified on 2026-06-23.

### What was done

1. Pushed `full-rebrand` branch (at `5cdaa61e2`) to `origin`.
2. Created local backup `archive-full-rebrand` at `5cdaa61e2`.
3. Verified `git ls-remote --heads origin full-rebrand` returns `5cdaa61e2`.

### Manual GitHub actions

- Confirm `full-rebrand` branch exists on GitHub.
- Do NOT set `full-rebrand` as default branch.
- Keep `dev` as default branch.

---

## Phase 1: Reset dev to Pre-Rebrand Base — DONE

**Status**: Complete. Verified on 2026-06-23.

### What was done

1. `git checkout dev`
2. `git reset --hard origin/dev` — dev now at `274f26df5`.
3. Verified clean working tree.

### Verification

- `git log --oneline -1` shows `274f26df5`.
- `git status --short` is empty.
- `packages/opencode/` exists and is the OpenCode engine.

---

## Phase 2: Configure Upstream OpenCode — DONE

**Status**: Complete. Verified on 2026-06-23.

### What was done

1. `git remote add upstream https://github.com/anomalyco/opencode`
2. `git fetch upstream`
3. Verified `origin` stays `AlexRzk/bettercode`, `upstream` points to `anomalyco/opencode`.

---

## Phase 3: Architecture Decision + Feature Roadmap

**Goal**: Freeze the architecture and plan features before writing any code.

### Step 1: Create architecture decision document

Create `specs/bettercode-plugin-wrapper.md` with:

- OpenCode remains the upstream engine. No global rename.
- BetterCode = wrapper CLI + OpenCode plugin + autonomous packages.
- `.bettercode/` is the BetterCode config source of truth.
- `.opencode/` remains OpenCode property; sync only creates a plugin re-export file.
- `packages/cli` will be restored to upstream-pure; BetterCode wrapper code moves to `packages/bettercode-cli`.
- `packages/bettercode/` (empty) is removed; plugin lives in `packages/bettercode-plugin/`.
- Patches to OpenCode source are forbidden unless an extension point is missing.
- The plugin uses only the public `Hooks` interface from `@opencode-ai/plugin`.
- Plugin registration is via file-path auto-discovery (`.opencode/plugin/bettercode.ts`), NOT npm string spec.
- The plugin module must default-export `{ id: "bettercode", server }`.

### Step 2: Archive stale specs

Remove or archive `specs/bettercode-rename.md` (from the rebrand era, contradicts "no global rename"):

```bash
git rm specs/bettercode-rename.md
```

If the content has historical value, move it to `specs/archive/bettercode-rename.md` instead.

### Step 3: Create feature roadmap

Create `specs/bettercode-roadmap.md` with these sections, each feature classified as: **Plugin**, **Wrapper**, **Autonomous package**, **Patch required**, or **Out of scope v1**.

**1. Agent autonomy**
- Project memory (brain init/update/search) — Autonomous package
- Context retrieval (brain sections injected into prompt) — Plugin hook
- Multi-step plans (spec generation) — Wrapper/autonomous
- Auto-summary (compaction hook) — Plugin hook
- Persistent decisions (task history) — Autonomous package

**2. Quality**
- Quality gate (run/score) — Autonomous package
- Diff risk analysis — Autonomous package
- Suggested tests (from diff risk) — Future, autonomous
- Benchmark — Autonomous package (placeholder)

**3. Context intelligence**
- Log compression — Autonomous package
- Diff compression — Autonomous package
- Brain section selection — Autonomous package
- Token budgets — Autonomous package

**4. Model routing**
- Consumer models (Kimi, DeepSeek, Qwen, OpenRouter) — OpenCode config (not BetterCode)
- Small/large model routing — Plugin hook (`experimental.provider.small_model`)
- Fallback — OpenCode config

**5. UX**
- `bettercode doctor` — Wrapper
- `bettercode init` — Wrapper
- `bettercode sync` — Wrapper
- `bettercode run` — Wrapper (delegates to OpenCode)
- Presets — Future
- Reports — Wrapper

**v1 features (must ship first)**:
1. `bettercode init` — creates `.bettercode/` config
2. `bettercode sync` — registers plugin in `.opencode/opencode.jsonc`
3. `bettercode run` — delegates to OpenCode with plugin active
4. Plugin: brain context injection via `experimental.chat.system.transform`
5. Plugin: `bettercode_brain_search` tool

### Step 4: Commit

```bash
git add specs/bettercode-plugin-wrapper.md specs/bettercode-roadmap.md
git rm specs/bettercode-rename.md  # if not already done in Step 2
git commit -m "docs: define bettercode plugin wrapper architecture and roadmap"
```

### Gate before Phase 4

- [ ] `git branch --show-current` shows `plugin-wrapper`.
- [ ] Both spec documents exist and are readable.
- [ ] `specs/bettercode-rename.md` is removed or archived.
- [ ] No runtime code modified.
- [ ] Commit is clean and contains only the spec files and the removal.

---

## Phase 4: Finalize Autonomous Packages

**Goal**: Verify the six autonomous packages are clean, tested, and have zero OpenCode coupling.

**Context**: These packages already exist and are functional on the pre-rebrand base. This phase is about verification and cleanup, not creation.

### Existing packages and their current state

| Package | Name | Lines | Tests | Status |
|---|---|---|---|---|
| `packages/shared` | `@bettercode/shared` | 115 | None (types only) | OK |
| `packages/diff-risk` | `@bettercode/diff-risk` | 160 | 2 test files | OK |
| `packages/quality-gate` | `@bettercode/quality-gate` | 328 | 5 test files + fixtures | OK |
| `packages/project-brain` | `@bettercode/project-brain` | 220 | 1 test file | OK |
| `packages/context-budget` | `@bettercode/context-budget` | 169 | 1 test file | OK |
| `packages/benchmark` | `@bettercode/benchmark` | 13 | None (placeholder) | OK |

### Step 1: Verify no OpenCode coupling

```bash
rg -n "packages/opencode/src|@opencode-ai/opencode" packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared
```

**Expected**: no output. If any match is found, remove the import and replace with a local implementation or a `@bettercode/*` dependency.

### Step 2: Verify package names

```bash
rg -n '"name":' packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared
```

**Expected**: all names use `@bettercode/*` prefix. No `@better-code/*` or `@opencode-ai/*` in these packages.

### Step 3: Verify exports

```bash
rg -n "^export " packages/project-brain/src/index.ts packages/quality-gate/src/index.ts packages/context-budget/src/index.ts packages/diff-risk/src/index.ts packages/benchmark/src/index.ts packages/shared/src/index.ts
```

**Expected exports**:
- `shared`: `GateStatus`, `CheckStatus`, `RiskLevel`, `PackageManager`, `ProjectCommandName`, `ProjectType`, `ProjectInfo`, `ProjectCommand`, `AvailableCommands`, `CheckResult`, `QualityGateResult`, `QualityGateRules`, `QualityGateThresholds`, `QualityGateScoreInput`, `DiffRiskResult`, `GitDiffSummary`, `BenchmarkResult`, `QualityGateCommandConfig`, `QualityGateConfig`
- `diff-risk`: `analyzeDiffRisk`, `analyzeGitDiff`, `createPlaceholderDiffRiskResult`
- `quality-gate`: `loadProjectConfig`, `detectPackageManager`, `detectAvailableCommands`, `detectProject`, `runQualityGate`, `scoreQualityGate`, `createPlaceholderQualityGateResult`
- `project-brain`: `brainInit`, `brainUpdate`, `brainSearch`, `SearchResult`
- `context-budget`: `CompressOptions`, `BudgetConfig`, `defaultBudget`, `approxTokens`, `approxWords`, `compressLogs`, `compressDiff`, `limitTextByBudget`, `selectRelevantBrainSections`
- `benchmark`: `createPlaceholderBenchmarkResult`

### Step 4: Run typechecks and tests

Run from each package directory (never from repo root):

```bash
cd packages/shared && bun typecheck
cd packages/diff-risk && bun typecheck && bun test
cd packages/quality-gate && bun typecheck && bun test
cd packages/project-brain && bun typecheck && bun test
cd packages/context-budget && bun typecheck && bun test
cd packages/benchmark && bun typecheck && bun run build
```

**Expected**: all pass. If `benchmark` has no tests, that's acceptable — it's a placeholder.

### Step 5: Add missing tests

If any package lacks test coverage for a key function, add a test file:
- `shared`: no tests needed (pure types).
- `benchmark`: no tests needed (placeholder).

### Step 6: Commit

```bash
git add packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared docs/bettercode-autonomous-packages.md
git commit -m "refactor: verify and finalize bettercode autonomous packages"
```

### Gate before Phase 5

- [ ] Zero matches for `packages/opencode/src` or `@opencode-ai/opencode` in autonomous packages.
- [ ] All package names use `@bettercode/*`.
- [ ] All typechecks pass.
- [ ] All tests pass.
- [ ] `benchmark` builds successfully.
- [ ] Commit contains only autonomous package changes (no OpenCode internal modifications).

---

## Phase 5: Create the BetterCode Plugin

**Goal**: Wire BetterCode features into OpenCode via the plugin `Hooks` interface, without modifying OpenCode source.

### Plugin hook mapping

The `@opencode-ai/plugin` SDK (`packages/plugin/src/index.ts`) exposes these hooks. Here's how BetterCode uses them:

| Hook | BetterCode use | Autonomous package |
|---|---|---|
| `experimental.chat.system.transform` | Inject brain sections into system prompt | `project-brain` + `context-budget` |
| `experimental.session.compacting` | Provide context-budget compression for compaction prompt | `context-budget` |
| `experimental.compaction.autocontinue` | Decide whether to auto-continue based on quality gate result | `quality-gate` |
| `tool` (ToolDefinition map) | Expose `bettercode_brain_search`, `bettercode_quality_gate`, `bettercode_context_compress` as agent tools | `project-brain`, `quality-gate`, `context-budget` |
| `tool.execute.before` | Log tool calls for task history | `project-brain` |
| `tool.execute.after` | Run quality gate after file-writing tools | `quality-gate` |
| `chat.message` | Append to task history on each user message | `project-brain` |
| `experimental.chat.messages.transform` | Compress old messages via context-budget | `context-budget` |

### Step 1: Create the plugin package

Remove the empty `packages/bettercode/` directory and create `packages/bettercode-plugin/`:

```bash
git rm -r packages/bettercode
mkdir packages/bettercode-plugin
```

Create `packages/bettercode-plugin/package.json`:
```json
{
  "name": "@bettercode/plugin",
  "type": "module",
  "license": "MIT",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "engines": {
    "opencode": ">=1.0.0"
  },
  "dependencies": {
    "@opencode-ai/plugin": "workspace:*",
    "@bettercode/project-brain": "workspace:*",
    "@bettercode/quality-gate": "workspace:*",
    "@bettercode/context-budget": "workspace:*"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  },
  "scripts": {
    "typecheck": "tsgo --noEmit",
    "test": "bun test"
  }
}
```

> **Note**: `@bettercode/shared` is NOT a direct dependency — the plugin consumes
> types indirectly through the autonomous packages that depend on `shared`. The
> `engines.opencode` field is read by the loader's `checkPluginCompatibility`
> (`shared.ts:194`) and will surface version mismatches loudly on upstream upgrades.

Create `packages/bettercode-plugin/tsconfig.json`:
```json
{
  "extends": "@tsconfig/bun",
  "compilerOptions": {
    "types": ["bun"],
    "moduleResolution": "bundler"
  },
  "include": ["src", "test"]
}
```

### Step 2: Implement the plugin entry point

Create `packages/bettercode-plugin/src/index.ts`.

**Critical**: The plugin MUST be a **default export** with `id` and `server`.
The OpenCode loader (`shared.ts:272` `readV1Plugin`) reads `mod.default`, and
the ID resolver (`shared.ts:306` `resolvePluginId`) throws for file-path plugins
without `id`. A named export will NOT load.

```ts
import type { PluginModule, PluginInput, Hooks } from "@opencode-ai/plugin"
import { brainSearch } from "@bettercode/project-brain"
import { runQualityGate } from "@bettercode/quality-gate"
import { compressLogs, compressDiff, limitTextByBudget, selectRelevantBrainSections } from "@bettercode/context-budget"
import { tool } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

async function server(input: PluginInput, options?: Record<string, unknown>): Promise<Hooks> {
  const root = input.directory

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const brainPath = join(root, ".bettercode", "brain", "profile.md")
      if (!existsSync(brainPath)) return
      const brainText = readFileSync(brainPath, "utf8")
      const maxTokens = (options?.brain as { maxTokens?: number })?.maxTokens ?? 2000
      const sections = selectRelevantBrainSections("", brainText, maxTokens)
      if (sections) output.system.push(sections)
    },

    tool: {
      bettercode_brain_search: tool({
        description: "Search the BetterCode project brain for context about the codebase",
        args: { query: tool.schema.string().describe("Search query") },
        async execute(args) {
          const results = brainSearch(root, args.query)
          return { title: "Brain search", output: JSON.stringify(results, null, 2) }
        },
      }),
      bettercode_quality_gate: tool({
        description: "Run the BetterCode quality gate (lint, typecheck, test, build) and return a score",
        args: {},
        async execute() {
          const result = await runQualityGate(root)
          return { title: "Quality gate", output: JSON.stringify(result, null, 2) }
        },
      }),
      bettercode_context_compress: tool({
        description: "Compress logs, diffs, or long text to fit a context budget",
        args: {
          text: tool.schema.string().describe("Text to compress"),
          mode: tool.schema.enum(["logs", "diff", "limit"]).describe("Compression mode"),
          maxTokens: tool.schema.number().optional().describe("Max approximate tokens"),
        },
        async execute(args) {
          const max = args.maxTokens ?? 1500
          const compressed = args.mode === "logs" ? compressLogs(args.text, { maxTokens: max })
            : args.mode === "diff" ? compressDiff(args.text, { maxTokens: max })
            : limitTextByBudget(args.text, max)
          return { title: "Context compressed", output: compressed }
        },
      }),
    },

    "chat.message": async (_input, _output) => {
      // TODO: append to task-history.jsonl
    },
  }
}

export default { id: "bettercode", server } satisfies PluginModule
```

> **`PluginInput` shape** (from `packages/plugin/src/index.ts:56`):
> `client`, `project`, `directory`, `worktree`, `serverUrl`, `$` (BunShell),
> `experimental_workspace.register()`. The plugin uses `directory` as the project
> root. Other fields are available but unused in v1.

### Step 3: Write plugin tests

Create `packages/bettercode-plugin/test/plugin.test.ts`.

**Mock strategy**: The plugin's `server()` function takes a `PluginInput` which
includes a fetch-based `client` bound to a `serverUrl`. For unit tests, construct
a minimal fake `PluginInput` with only the fields the plugin actually reads
(`directory`, `worktree`). The `client` and `serverUrl` can be stubbed since the
v1 plugin never calls the client.

```ts
import { describe, it, expect } from "bun:test"
// Test that default export has id and server
// Test brain_search tool returns results from fixture brain
// Test quality_gate tool returns structured result
// Test context_compress tool respects token budget
// Test system.transform injects brain sections
```

Tests must verify:
- The default export is `{ id: "bettercode", server }` (not a named export).
- `server()` returns a `Hooks` object with expected keys.
- `bettercode_brain_search` tool returns search results from a fixture `.bettercode/brain/`.
- `bettercode_quality_gate` tool returns a structured `QualityGateResult`.
- `bettercode_context_compress` tool respects the token budget.
- `experimental.chat.system.transform` hook injects brain sections into `output.system`.

### Step 4: Run `bun install` at repo root

After creating the new package, the workspace must re-link:

```bash
bun install
```

Verify the package is linked:
```bash
bun pm ls @bettercode/plugin
```

### Step 5: Typecheck and test

```bash
cd packages/bettercode-plugin && bun typecheck && bun test
```

### Step 6: Commit

```bash
git add -A packages/bettercode packages/bettercode-plugin
git commit -m "feat(plugin): add bettercode plugin with brain, quality gate, and context tools"
```

> Use `git add -A` (not `git add`) to capture both the deletion of
> `packages/bettercode/` and the addition of `packages/bettercode-plugin/`.

### Gate before Phase 6

- [ ] `packages/bettercode-plugin/` exists with `package.json`, `src/index.ts`, `tsconfig.json`.
- [ ] Plugin default-exports `{ id: "bettercode", server }`.
- [ ] Plugin imports from `@opencode-ai/plugin` for types and the `tool()` helper only.
- [ ] Plugin imports from `@bettercode/*` autonomous packages for logic.
- [ ] Plugin does NOT import from `packages/opencode/src/` or `@opencode-ai/opencode`.
- [ ] Three tools are defined via `tool()` helper: `bettercode_brain_search`, `bettercode_quality_gate`, `bettercode_context_compress`.
- [ ] `experimental.chat.system.transform` hook injects brain context.
- [ ] `engines.opencode` field present in package.json.
- [ ] `bun install` run, `bun pm ls @bettercode/plugin` resolves.
- [ ] Typecheck passes.
- [ ] Tests pass.
- [ ] Empty `packages/bettercode/` directory is removed (verified via `git add -A`).

---

## Phase 6: Extract BetterCode Wrapper CLI + Restore packages/cli

**Goal**: Separate the BetterCode wrapper CLI from the OpenCode CLI so both can evolve independently.

### What exists today

`packages/cli` (`@bettercode/cli`) contains:
- OpenCode CLI: `src/index.ts`, `src/commands/commands.ts`, `src/commands/handlers/`, `src/framework/runtime.ts`, `src/framework/spec.ts`
- BetterCode wrapper: `src/bettercode.ts`, `src/spec.ts`
- Bin: `bettercode` → `bin/bettercode.cjs` → `src/bettercode.ts`, `lildax` → `bin/lildax.cjs`
- Dependencies: `@opencode-ai/core`, `@opencode-ai/sdk`, `@opencode-ai/server`, `@opencode-ai/tui`, `@bettercode/quality-gate`, `@bettercode/project-brain`, `@bettercode/diff-risk`

### Step 1: Create `packages/bettercode-cli`

```bash
mkdir packages/bettercode-cli
```

Create `packages/bettercode-cli/package.json`:
```json
{
  "name": "@bettercode/cli-wrapper",
  "type": "module",
  "license": "MIT",
  "private": true,
  "bin": {
    "bettercode": "./bin/bettercode.cjs"
  },
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@bettercode/project-brain": "workspace:*",
    "@bettercode/quality-gate": "workspace:*",
    "@bettercode/diff-risk": "workspace:*",
    "@bettercode/benchmark": "workspace:*",
    "@bettercode/shared": "workspace:*"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  },
  "scripts": {
    "dev": "bun run src/index.ts",
    "test": "bun test",
    "typecheck": "tsgo --noEmit"
  }
}
```

### Step 2: Move BetterCode wrapper code

**Before moving**, audit all importers of `src/spec.ts` (the BetterCode spec generator):

```bash
rg -n 'from "\./spec"' packages/cli/src
```

**Verified**: only `src/bettercode.ts:8` imports `src/spec.ts`. The file
`src/framework/spec.ts` is a **separate** OpenCode file (command spec framework
using `effect/unstable/cli/Command`) — do NOT touch it.

Move these files from `packages/cli` to `packages/bettercode-cli`:
- `src/bettercode.ts` → `packages/bettercode-cli/src/index.ts` (rename to `index.ts` as the entry point)
- `src/spec.ts` → `packages/bettercode-cli/src/spec.ts`
- `bin/bettercode.cjs` → `packages/bettercode-cli/bin/bettercode.cjs` (update path reference inside)

**Preserve `lildax`**: `bin/lildax.cjs` is a robust signal-forwarding spawn wrapper
(handles SIGINT/SIGTERM/SIGHUP). Copy it to `packages/bettercode-cli/bin/lildax.cjs`
and update its target to point to the new `src/index.ts`. Keep `lildax` as a bin
alias in the new package's `package.json`.

### Step 3: Add wrapper-only commands

Add new commands to the wrapper CLI that the original `bettercode.ts` doesn't have:

- `bettercode sync` — register the BetterCode plugin in `.opencode/opencode.jsonc` (see Phase 7).
- `bettercode doctor` — check health: OpenCode accessible, plugin installed, `.bettercode/` valid, `.opencode/` not broken.
- `bettercode run -- [args...]` — run sync (if plugin not registered), then delegate to OpenCode CLI.

**Delegation mechanism**: `bettercode run` uses `Bun.spawn` to launch the OpenCode
CLI entrypoint with `--conditions=browser` (required for `@opentui/*` and
`solid-js` import resolution) and `--cwd` pointing to the OpenCode package:

```ts
const opencodeEntry = resolveOpencodeEntry() // resolves packages/cli/src/index.ts or packages/opencode/src/index.ts
const child = Bun.spawn(["bun", "run", "--conditions=browser", opencodeEntry, ...args], {
  stdio: ["inherit", "inherit", "inherit"],
  cwd: process.cwd(),
})
```

The entry path must be resolved dynamically (not hardcoded) — check
`packages/cli/package.json` `exports["."]` or `bin` field after the upstream
restore in Step 4. If `packages/cli` is restored to upstream, the entry may
change from `src/index.ts` to whatever upstream uses.

**Auto-sync behavior**: If `.opencode/plugin/bettercode.ts` does not exist when
`bettercode run` is invoked, `run` automatically calls `sync` first, prints a
warning, then delegates. If the plugin file exists but is stale (points to a
non-existent path), `run` re-syncs and warns.

### Step 4: Restore `packages/cli` to upstream-pure

Remove from `packages/cli`:
- `src/bettercode.ts`
- `src/spec.ts` (the BetterCode one — verify it's not `src/framework/spec.ts`)
- `bin/bettercode.cjs`
- `bin/lildax.cjs` (already copied to bettercode-cli)
- `@bettercode/*` dependencies from `package.json`
- `bettercode` and `lildax` from `bin` field

Restore `packages/cli/package.json` `name` to match upstream OpenCode. Check
upstream name with (Windows-safe, no `head`):

```bash
git show upstream/dev:packages/cli/package.json
```

Look for the `"name"` field in the output. If upstream uses `@opencode-ai/cli`,
restore that name. If the `files` array references `src/bettercode.ts`, remove
that entry too.

Also check if upstream `packages/cli/package.json` has different `exports` or
`bin` fields and restore them to match upstream.

### Step 5: Add tsconfig.json for bettercode-cli

Create `packages/bettercode-cli/tsconfig.json`:
```json
{
  "extends": "@tsconfig/bun",
  "compilerOptions": {
    "types": ["bun"],
    "moduleResolution": "bundler"
  },
  "include": ["src", "test"]
}
```

### Step 6: Run `bun install` at repo root

After restructuring packages, re-link the workspace:

```bash
bun install
```

### Step 7: Update root `package.json` if needed

If the root `package.json` references `@bettercode/cli` in dependencies or scripts, update to reflect the split. The root `package.json` dev script (`bun run --cwd packages/opencode --conditions=browser src/index.ts`) should remain unchanged — it runs OpenCode directly, not through the wrapper.

### Step 8: Update `turbo.json` if needed

The current `turbo.json` has explicit test tasks for `opencode#test`, `@opencode-ai/core#test`, etc. The new packages inherit the generic `typecheck: {}` task. If you want `bun turbo test` to run tests for the new packages, add entries like:

```json
"@bettercode/cli-wrapper#test": { "dependsOn": ["^build"], "outputs": [] }
```

Otherwise, run tests directly from each package directory with `bun test`.

### Step 9: Write wrapper CLI tests

Create `packages/bettercode-cli/test/`:
- `init.test.ts` — `bettercode init` creates `.bettercode/bettercode.jsonc` and brain directory.
- `sync.test.ts` — `bettercode sync` is idempotent, preserves existing config.
- `doctor.test.ts` — `bettercode doctor` detects valid/invalid setup.
- `run.test.ts` — `bettercode run -- --help` delegates to OpenCode (mock or spawn check).

Use temp fixtures, never the real repo.

### Step 10: Typecheck and test

```bash
cd packages/bettercode-cli && bun typecheck && bun test
cd packages/cli && bun typecheck
```

### Step 11: Commit

```bash
git add packages/bettercode-cli packages/cli
git commit -m "refactor: extract bettercode wrapper cli and restore packages/cli to upstream-pure"
```

### Gate before Phase 7

- [ ] `packages/bettercode-cli/` exists with wrapper commands: `init`, `sync`, `doctor`, `run`, `brain`, `gate`, `spec`, `benchmark`, `report`.
- [ ] `packages/bettercode-cli/bin/bettercode.cjs` and `lildax.cjs` exist with signal forwarding.
- [ ] `packages/cli` no longer contains `bettercode.ts`, `spec.ts` (BetterCode), or `@bettercode/*` dependencies.
- [ ] `packages/cli` name matches upstream OpenCode (verified via `git show upstream/dev:packages/cli/package.json`).
- [ ] `bettercode run -- --help` successfully delegates to OpenCode CLI with `--conditions=browser`.
- [ ] `bettercode init` creates `.bettercode/` structure.
- [ ] `bettercode doctor` runs without crash.
- [ ] `bun install` run at repo root, workspace links resolved.
- [ ] Typecheck passes for both `bettercode-cli` and `cli`.
- [ ] Tests pass for `bettercode-cli`.

---

## Phase 7: Config Sync Mechanism

**Goal**: Define exactly how `bettercode sync` bridges `.bettercode/` and `.opencode/`.

### Config file responsibilities

| File | Owner | Purpose |
|---|---|---|
| `.bettercode/bettercode.jsonc` | BetterCode | Plugin options, brain settings, quality gate config, context budget |
| `.bettercode/quality-gate.json` | BetterCode | Quality gate thresholds and rules (existing format) |
| `.bettercode/brain/` | BetterCode | Project memory (profile, commands, architecture, etc.) |
| `.opencode/opencode.jsonc` | OpenCode | Provider, permission, MCP, tools, plugin list |
| `.opencode/plugin/bettercode.ts` | BetterCode (sync-generated) | Re-export file for auto-discovery |

### Plugin registration mechanism

OpenCode's config loader (`packages/opencode/src/config/plugin.ts:21`) auto-discovers
plugins by globbing `{plugin,plugins}/*.{ts,js}` under `.opencode/`. Each match is
registered as a file-path plugin. This bypasses the npm install path entirely.

**`bettercode sync` creates** `.opencode/plugin/bettercode.ts`:

```ts
// Auto-generated by bettercode sync. Do not edit.
export { default } from "@bettercode/plugin"
export * from "@bettercode/plugin"
```

This file re-exports the plugin's default export (`{ id: "bettercode", server }`)
from the workspace package. OpenCode's loader imports it, reads `mod.default`,
finds `id` and `server()`, and registers the plugin.

**`bettercode sync` does NOT modify `.opencode/opencode.jsonc`** for plugin
registration. The auto-discovery handles it. However, if the user wants to pass
options to the plugin, sync can optionally add an entry to the `plugin` array in
`.opencode/opencode.jsonc` with a file-path spec:

```jsonc
{
  "plugin": [
    ["./plugin/bettercode.ts", { "brain": { "autoInject": true, "maxTokens": 2000 } }]
  ]
}
```

This is optional — if no options are needed, the auto-discovered file works
with defaults. If options are provided, sync uses a JSONC-aware writer to
preserve comments.

### Sync rules

1. `bettercode sync` reads `.bettercode/bettercode.jsonc` for plugin options (if missing, uses defaults).
2. `bettercode sync` creates `.opencode/plugin/bettercode.ts` (the re-export file).
3. If the re-export file already exists with identical content, sync is a no-op for that file.
4. If plugin options are present in `.bettercode/bettercode.jsonc`, sync writes them to `.opencode/opencode.jsonc` `plugin` array as `["./plugin/bettercode.ts", { ...options }]`.
5. If no options are needed, sync does NOT touch `.opencode/opencode.jsonc`.
6. If `.opencode/opencode.jsonc` must be modified, sync preserves all existing fields and JSONC comments.
7. Sync is idempotent: running it twice produces the same files. Idempotency is defined as **same file content** (byte equality after normalization), not just same logical state.
8. If `.opencode/opencode.jsonc` is invalid JSONC, sync errors clearly and writes nothing.
9. If `.opencode/plugin/` directory does not exist, sync creates it.

### `.bettercode/bettercode.jsonc` format

```jsonc
{
  // No $schema — bettercode.ai domain doesn't exist yet.
  // Drop $schema until a real schema is hosted or use a local path:
  // "$schema": "./node_modules/@bettercode/cli-wrapper/schema/bettercode.json",
  "plugin": {
    "brain": {
      "autoInject": true,        // inject brain sections into system prompt
      "maxTokens": 2000           // context budget for brain injection
    },
    "qualityGate": {
      "autoRun": false,           // run quality gate after file-writing tools
      "failOnError": false        // block on FAIL status
    },
    "contextBudget": {
      "mode": "balanced",         // aggressive | balanced | conservative
      "maxLogTokens": 1500,
      "maxDiffTokens": 4000
    }
  }
}
```

### JSONC parser selection

For reading JSONC: use `JSON.parse` after stripping comments (simple regex-based
stripper, since we only need to parse, not preserve for reading).

For writing JSONC with comment preservation: use the `jsonc-parser` library
(already a dependency of OpenCode, available in the workspace `node_modules`).
Add it to `packages/bettercode-cli/package.json` dependencies:

```json
"jsonc-parser": "catalog:"
```

If `jsonc-parser` is not in the catalog, check if it's available via the
workspace `node_modules` and add it explicitly. Alternatively, implement a
small comment-preserving editor that:
1. Parses the file into tokens (keeping comment positions).
2. Modifies only the `plugin` array.
3. Re-serializes with comments in their original positions.

### Step 1: Implement sync in `packages/bettercode-cli`

Add a `sync.ts` module in `packages/bettercode-cli/src/` that:
- Creates `.opencode/plugin/` directory if missing.
- Writes `.opencode/plugin/bettercode.ts` (the re-export file).
- If options are present in `.bettercode/bettercode.jsonc`, writes them to `.opencode/opencode.jsonc` `plugin` array using a JSONC-aware writer.
- If no options, skips `.opencode/opencode.jsonc` entirely.

### Step 2: Implement `bettercode doctor`

`doctor` checks and reports:
- OpenCode CLI accessible (resolve entry dynamically from `packages/cli/package.json` `exports` or `bin`, not hardcoded path).
- OpenCode version (read `packages/cli/package.json` `version`).
- `@bettercode/plugin` installed (`bun pm ls @bettercode/plugin` resolves).
- `.bettercode/bettercode.jsonc` valid (parseable, no missing required fields).
- `.opencode/plugin/bettercode.ts` exists and points to valid package.
- `.opencode/opencode.jsonc` valid (if it exists).
- No orphaned `@bettercode/*` dependencies in `packages/cli` (grep `packages/cli/package.json` for `@bettercode`).

**Dynamic resolution**: Doctor must NOT hardcode `@bettercode/cli` or
`@opencode-ai/cli`. It should resolve the OpenCode CLI package by checking
which package in the workspace has the OpenCode CLI entrypoint (e.g. search
`packages/*/package.json` for `@opencode-ai/cli` or the upstream name).

### Step 3: Write sync tests

Create `packages/bettercode-cli/test/sync.test.ts` with fixtures:
- Fixture A: `.opencode/opencode.jsonc` with existing config + no `.opencode/plugin/` → sync creates plugin file, preserves config, adds options entry if needed.
- Fixture B: no `.opencode/` → sync creates `.opencode/plugin/bettercode.ts` only.
- Fixture C: plugin file already exists with identical content → sync is no-op.
- Fixture D: JSONC with comments in `.opencode/opencode.jsonc` → comments preserved when options are added.
- Fixture E: invalid JSONC in `.opencode/opencode.jsonc` → clear error, no partial write.
- Fixture F: `.bettercode/bettercode.jsonc` with no `plugin` options → sync creates only the re-export file, does NOT touch `.opencode/opencode.jsonc`.

### Step 4: Typecheck and test

```bash
cd packages/bettercode-cli && bun typecheck && bun test
```

### Step 5: Commit

```bash
git add packages/bettercode-cli
git commit -m "feat(config): add bettercode sync and doctor with jsonc-aware plugin registration"
```

### Gate before Phase 8

- [ ] `bettercode sync` is idempotent (run twice, same file content).
- [ ] `bettercode sync` creates `.opencode/plugin/bettercode.ts` re-export file.
- [ ] `bettercode sync` preserves existing `.opencode/opencode.jsonc` fields when options are written.
- [ ] `bettercode sync` preserves JSONC comments when modifying `.opencode/opencode.jsonc`.
- [ ] `bettercode sync` does NOT touch `.opencode/opencode.jsonc` when no options are needed.
- [ ] `bettercode sync` errors on invalid JSONC without partial write.
- [ ] `bettercode doctor` reports all checks without crash, resolves OpenCode CLI dynamically.
- [ ] All tests pass (including Fixture F: no-options path).

---

## Phase 8: OpenCode Patch Queue Policy

**Goal**: Define strict rules for when and how OpenCode source may be patched.

### Rules

1. No patch without proof that a plugin cannot solve the problem.
2. Each patch must have: name, reason, files touched, test, upstream PR possibility.
3. Patches are maintained as git cherry-picks or a maintained diff file in `patches/opencode/`, NOT as Bun `patchedDependencies` (those are for npm packages, not monorepo source).
4. The patch queue is documented in `specs/opencode-extension-points.md`.

### Acceptable patches

- Adding a missing plugin hook.
- Exposing a public API that is currently internal.
- Adding a TUI slot for plugin rendering.
- Adding a lifecycle event.

### Forbidden patches

- Rewriting the OpenCode runner.
- Renaming OpenCode packages.
- Modifying storage without proven need.
- Adding BetterCode logic directly into OpenCode source.

### Step 1: Create patch policy document

Create `specs/opencode-extension-points.md`:
- Current available hooks (from `@opencode-ai/plugin` `Hooks` interface).
- Gaps identified during plugin development (if any).
- Each gap: what's needed, why a plugin can't solve it, proposed patch.
- Patch format: cherry-pick commit or diff file.

### Step 2: Create patch directory

```bash
mkdir patches/opencode
```

Add `.gitkeep` or a README explaining the directory purpose.

### Step 3: Commit

```bash
git add specs/opencode-extension-points.md patches/opencode
git commit -m "docs: define opencode patch queue policy and extension points"
```

### Gate before Phase 9

- [ ] `specs/opencode-extension-points.md` exists.
- [ ] `patches/opencode/` directory exists.
- [ ] No actual patches applied yet (queue starts empty).
- [ ] Policy document lists all available hooks from the `Hooks` interface.

---

## Phase 9: End-to-End Integration Tests

**Goal**: Prove BetterCode works as wrapper + plugin without a forked OpenCode.

### Test scenarios

**1. Fresh project**
```bash
mkdir /tmp/bc-test-fresh && cd /tmp/bc-test-fresh
bettercode init          # creates .bettercode/
bettercode doctor        # reports healthy
bettercode run -- --help # delegates to OpenCode
```

**2. Node project with brain and gate**
```bash
mkdir /tmp/bc-test-node && cd /tmp/bc-test-node
npm init -y
bettercode init
bettercode brain init    # creates .bettercode/brain/
bettercode gate run      # runs quality gate
bettercode sync          # registers plugin in .opencode/
bettercode doctor        # confirms plugin registered
```

**3. Existing OpenCode config**
```bash
mkdir /tmp/bc-test-existing && cd /tmp/bc-test-existing
mkdir .opencode
echo '{"provider":{}}' > .opencode/opencode.jsonc
bettercode init
bettercode sync          # adds plugin, preserves provider
cat .opencode/opencode.jsonc  # verify provider still there
bettercode sync          # run again — no duplication
```

**4. Simulated upstream update**
```bash
git fetch upstream
git checkout -b upstream-test
git merge upstream/dev   # or rebase
# resolve conflicts without modifying BetterCode packages
cd packages/bettercode-cli && bun typecheck && bun test
cd packages/bettercode-plugin && bun typecheck && bun test
cd packages/project-brain && bun typecheck && bun test
git checkout plugin-wrapper  # back to work branch
git branch -D upstream-test  # cleanup
```

**5. Plugin load test**
- Run `bettercode sync` to create `.opencode/plugin/bettercode.ts`.
- Start OpenCode CLI (`bun run --cwd packages/opencode --conditions=browser src/index.ts`).
- Verify no crash.
- Verify plugin hooks are active (brain context in system prompt).
- Verify tools are registered (`bettercode_brain_search` visible).

**6. OpenCode without plugin**
- Remove `.opencode/plugin/bettercode.ts`.
- Start OpenCode CLI.
- Verify no crash, no BetterCode features active.

### Step 1: Write E2E test script

Create `packages/bettercode-cli/test/e2e.test.ts` that runs scenarios 1-3 as automated tests with temp directories.

### Step 2: Write plugin load test

Create `packages/bettercode-plugin/test/load.test.ts` that verifies the plugin can be imported and its hooks called without a full OpenCode server.

### Step 3: Run all tests

```bash
cd packages/bettercode-cli && bun test
cd packages/bettercode-plugin && bun test
cd packages/project-brain && bun test
cd packages/quality-gate && bun test
cd packages/context-budget && bun test
cd packages/diff-risk && bun test
```

### Step 4: Verify no forbidden imports

```bash
rg -n "packages/opencode/src|@opencode-ai/opencode" packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared
```

**Expected**: no output.

### Step 5: Commit

```bash
git add packages/bettercode-cli/test packages/bettercode-plugin/test
git commit -m "test: cover bettercode wrapper plugin end-to-end integration"
```

### Gate before Phase 10

- [ ] All 6 E2E scenarios pass.
- [ ] Plugin loads without crash.
- [ ] OpenCode works without plugin.
- [ ] No forbidden imports in autonomous packages.
- [ ] All package tests pass.

---

## Phase 10: Upstream Update Workflow

**Goal**: Make OpenCode updates repeatable by any agent.

### Step 1: Create update procedure document

Create `docs/upstream-update.md`:

```markdown
# OpenCode Upstream Update Procedure

## When to run
When a new OpenCode release is available and BetterCode needs the updates.

## Steps

1. Create an update branch:
   git checkout dev
   git checkout -b upstream-update

2. Fetch upstream:
   git fetch upstream

3. Merge or rebase:
   git merge upstream/dev
   # or: git rebase upstream/dev

4. Resolve conflicts:
   - Never modify BetterCode autonomous packages to satisfy upstream.
   - If packages/cli conflicts, prefer upstream version (BetterCode wrapper is separate).
   - If packages/plugin (the SDK) conflicts, it's purely upstream — accept upstream.
   - If the Hooks interface changes in packages/plugin/src/index.ts, adapt
     packages/bettercode-plugin to the new hook signatures. This is the ONLY
     BetterCode package that may need changes after an upstream update.
   - Document any hook changes in specs/opencode-extension-points.md.

5. Run all BetterCode tests:
   cd packages/bettercode-cli && bun typecheck && bun test
   cd packages/bettercode-plugin && bun typecheck && bun test
   cd packages/project-brain && bun typecheck && bun test
   cd packages/quality-gate && bun typecheck && bun test
   cd packages/context-budget && bun typecheck && bun test
   cd packages/diff-risk && bun typecheck && bun test
   cd packages/shared && bun typecheck

6. Run integration checks:
   bettercode doctor
   bettercode sync (on a test fixture)

7. Verify no forbidden imports:
   rg -n "packages/opencode/src|@opencode-ai/opencode" packages/project-brain packages/quality-gate packages/context-budget packages/diff-risk packages/benchmark packages/shared

8. Review diff:
   - No rebrand (no global rename of OpenCode).
   - No BetterCode logic inside OpenCode packages.
   - Patch queue still valid.

9. If all green, merge to plugin-wrapper:
   git checkout plugin-wrapper
   git merge upstream-update
   git branch -D upstream-update

10. Document any incompatibilities in specs/opencode-extension-points.md.
```

### Step 2: Commit

```bash
git add docs/upstream-update.md
git commit -m "docs: add opencode upstream update workflow"
```

### Gate before completion

- [ ] `docs/upstream-update.md` exists and is followable by an agent.
- [ ] Procedure includes conflict resolution rules.
- [ ] Procedure includes test verification steps.
- [ ] Procedure includes forbidden-import check.

---

## Phase 11: CI + AGENTS.md Updates

**Goal**: Ensure the architecture is self-documenting and continuously verified.

### Step 1: Add CI workflow

Create `.github/workflows/bettercode.yml`:

```yaml
name: bettercode
on: [push, pull_request]
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - run: bun install
      - run: bun turbo typecheck
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - run: bun install
      - run: cd packages/project-brain && bun test
      - run: cd packages/quality-gate && bun test
      - run: cd packages/context-budget && bun test
      - run: cd packages/diff-risk && bun test
      - run: cd packages/bettercode-plugin && bun test
      - run: cd packages/bettercode-cli && bun test
  forbidden-imports:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          if rg -n "packages/opencode/src|@opencode-ai/opencode" \
            packages/project-brain packages/quality-gate packages/context-budget \
            packages/diff-risk packages/benchmark packages/shared; then
            echo "Forbidden OpenCode imports found in autonomous packages"
            exit 1
          fi
```

### Step 2: Update AGENTS.md

Add to the root `AGENTS.md`:
- The new package layout (`packages/bettercode-plugin`, `packages/bettercode-cli`).
- That `packages/bettercode-cli` is the user-facing wrapper, `packages/cli` is upstream OpenCode.
- That `bettercode run` must use `--conditions=browser`.
- That autonomous packages must never import from `packages/opencode/src`.

### Step 3: Add patches/opencode/README.md

```markdown
# OpenCode Patches

This directory contains source patches for OpenCode when a plugin extension
point is missing. These are NOT Bun patchedDependencies (those live in the
root `patches/` directory for npm packages).

Each patch must have:
- A name and reason
- Files touched
- A test
- A plan for upstream PR

See specs/opencode-extension-points.md for the full policy.
```

### Step 4: Commit

```bash
git add .github/workflows/bettercode.yml AGENTS.md patches/opencode/README.md
git commit -m "ci: add bettercode workflow and update agents docs"
```

### Gate before completion

- [ ] CI workflow exists and runs on push/PR.
- [ ] CI runs typecheck, tests, and forbidden-import check.
- [ ] `AGENTS.md` documents the new package layout.
- [ ] `patches/opencode/README.md` explains the patch directory.

---

## Manual GitHub Actions

1. Verify `full-rebrand` branch exists on GitHub (done).
2. Keep `dev` as default branch.
3. Do not protect `dev` until the agent has finished the reset (already done).
4. After Phase 6 (wrapper extraction), enable branch protection on `dev`:
   - No force-push on `dev`.
   - PR required to merge into `dev`.
   - CI required (the `bettercode.yml` workflow from Phase 11).
   This prevents accidental upstream merges from overwriting the BetterCode layer.
5. Create a fork `AlexRzk/opencode` only if you want to propose PRs upstream.
6. Keep `AlexRzk/bettercode` as the BetterCode product repo.

---

## Global Success Criteria

The project succeeds when:

- [ ] `full-rebrand` archive exists on GitHub at `5cdaa61e2`.
- [ ] `dev` is at `274f26df5` (pre-rebrand base).
- [ ] `upstream` remote points to `anomalyco/opencode`.
- [ ] `bettercode init` creates `.bettercode/` config.
- [ ] `bettercode sync` creates `.opencode/plugin/bettercode.ts` idempotently.
- [ ] `bettercode run` delegates to OpenCode CLI with `--conditions=browser`.
- [ ] `bettercode doctor` reports system health with dynamic package resolution.
- [ ] The BetterCode plugin loads in OpenCode via file-path auto-discovery (not npm install).
- [ ] The plugin default-exports `{ id: "bettercode", server }`.
- [ ] Brain context is injected into the system prompt via `experimental.chat.system.transform`.
- [ ] `bettercode_brain_search`, `bettercode_quality_gate`, `bettercode_context_compress` tools are available to the agent (defined via `tool()` helper).
- [ ] OpenCode works without the BetterCode plugin (no hard dependency — just remove `.opencode/plugin/bettercode.ts`).
- [ ] `packages/cli` is upstream-pure (no `@bettercode/*` deps, no `bettercode.ts`).
- [ ] `packages/bettercode/` empty shell is removed.
- [ ] `packages/bettercode-plugin/` exists with `engines.opencode` field.
- [ ] `packages/bettercode-cli/` exists with signal-forwarding bins.
- [ ] Autonomous packages have zero `packages/opencode/src` imports.
- [ ] `specs/bettercode-rename.md` is removed or archived.
- [ ] CI workflow runs typecheck, tests, and forbidden-import check.
- [ ] OpenCode can be updated by following `docs/upstream-update.md`.
- [ ] Patch queue is empty or minimal.

---

## Assumptions

- The agent implementing this plan has push access to `origin`.
- The agent must NOT push `dev` after reset without explicit confirmation.
- The upstream URL (`https://github.com/anomalyco/opencode`) must be revalidated at execution time.
- Tests run from package directories, never from repo root (guard: `do-not-run-tests-from-root`).
- Bun version must satisfy `^1.3.14` (current local is `1.3.10` — husky hooks may need `--no-verify` for pushes until Bun is updated).
- JSONC comment preservation uses `jsonc-parser` (available in workspace) or a manual comment-preserving editor.
- The `@bettercode/plugin` package is `private: true` and never npm-published — it's loaded via file-path auto-discovery only.
- OpenCode's plugin auto-discovery globs `.opencode/{plugin,plugins}/*.{ts,js}` — this is the primary registration mechanism.
- The plugin default export shape (`{ id, server }`) is mandatory for file-path plugins per the loader source.
- `bettercode run` must pass `--conditions=browser` to the OpenCode CLI or imports will fail.
- All `git show upstream/dev:...` commands work on Windows (no `head` needed — PowerShell displays full output).

## Review Audit Trail

This plan was reviewed twice against the actual codebase source:

### Review 1 (self-audit)
- Verified all 6 autonomous package export lists against `src/index.ts` files.
- Verified `packages/cli` hybrid coupling (OpenCode + BetterCode code in one package).
- Verified `packages/bettercode/` is an empty shell.
- Verified plugin `Hooks` interface exists at `packages/plugin/src/index.ts:222-335`.
- Verified `packages/cli/src/spec.ts` is only imported by `src/bettercode.ts:8`.
- Verified `packages/cli/src/framework/spec.ts` is a separate OpenCode file.

### Review 2 (subagent audit — 10 critical findings fixed)
1. **Plugin registration via npm string fails** → Fixed: use `.opencode/plugin/bettercode.ts` auto-discovery (`config/plugin.ts:21` globs `{plugin,plugins}/*.{ts,js}`).
2. **File plugins require `id` + default export** → Fixed: `export default { id: "bettercode", server }` (verified `shared.ts:272` `readV1Plugin` reads `mod.default`, `shared.ts:306` `resolvePluginId` throws without `id`).
3. **`bettercode run` needs `--conditions=browser`** → Fixed: delegation spawns with `--conditions=browser` (root `package.json` dev script uses it).
4. **spec.ts importer audit** → Fixed: added explicit `rg` verification step before moving.
5. **Phase 5 commit command wrong** → Fixed: `git add -A` to capture deletion + addition.
6. **tsconfig.json content missing** → Fixed: added concrete tsconfig template.
7. **`lildax.cjs` not a simple alias** → Fixed: preserve signal-forwarding logic, keep as bin alias.
8. **Stale `specs/bettercode-rename.md`** → Fixed: archive/remove in Phase 3.
9. **JSONC parser unspecified** → Fixed: use `jsonc-parser` from workspace.
10. **Missing CI, AGENTS.md, bun install, turbo.json** → Fixed: added Phase 11, explicit `bun install` steps, turbo.json guidance.
11. **`$schema` URL dead** → Fixed: dropped or use local path.
12. **Plugin test mock strategy missing** → Fixed: documented minimal fake `PluginInput` approach.
13. **`engines.opencode` missing** → Fixed: added to plugin package.json.
14. **Doctor hardcoded package name** → Fixed: dynamic resolution from workspace.
15. **`bettercode run` auto-sync undefined** → Fixed: auto-syncs if plugin file missing.
16. **`@bettercode/shared` unused direct dep** → Fixed: removed from plugin dependencies.
17. **Upstream conflict rules unclear for `packages/plugin`** → Fixed: clarified that `packages/plugin` is upstream-owned, only `packages/bettercode-plugin` may need adaptation.
