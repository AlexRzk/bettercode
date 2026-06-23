# BetterCode Plugin Wrapper Architecture

> Status: Accepted
> Date: 2026-06-24
> Supersedes: `specs/archive/bettercode-rename.md` (rebrand era — contradicts "no global rename")

## Context

BetterCode started as a full rebrand of OpenCode (commit `5cdaa61e2`, archived in
the `full-rebrand` branch). That approach coupled BetterCode to every OpenCode
internal, making upstream updates impractical.

This document freezes the new architecture: BetterCode as a thin layer above
OpenCode, not a fork.

## Decision

### 1. OpenCode remains the upstream engine

- No global rename of OpenCode packages, files, or imports.
- `packages/opencode/`, `packages/core/`, `packages/tui/`, `packages/sdk/`, `packages/plugin/` (the SDK), and all other `@opencode-ai/*` packages stay upstream-owned.
- The root `package.json` name stays `opencode`.
- Upstream merges target these packages directly.

### 2. BetterCode = wrapper CLI + OpenCode plugin + autonomous packages

Three layers, each independently evolvable:

| Layer | Package | Role |
|---|---|---|
| Wrapper CLI | `packages/bettercode-cli` (`@bettercode/cli-wrapper`) | User-facing `bettercode` command. Delegates to OpenCode via spawn. |
| Plugin | `packages/bettercode-plugin` (`@bettercode/plugin`) | Wires BetterCode features into OpenCode via the `Hooks` interface. |
| Autonomous packages | `packages/project-brain`, `packages/quality-gate`, `packages/context-budget`, `packages/diff-risk`, `packages/benchmark`, `packages/shared` | BetterCode logic with zero OpenCode coupling. |

### 3. `.bettercode/` is the BetterCode config source of truth

- `.bettercode/bettercode.jsonc` — plugin options, brain settings, quality gate config, context budget.
- `.bettercode/quality-gate.json` — quality gate thresholds and rules (existing format).
- `.bettercode/brain/` — project memory (profile, commands, architecture, known-errors, quality-rules, task-history).

### 4. `.opencode/` remains OpenCode property

- `.opencode/opencode.jsonc` — OpenCode config (provider, permission, MCP, tools). BetterCode sync modifies it minimally, only to add plugin options if needed.
- `.opencode/plugin/bettercode.ts` — sync-generated re-export file for plugin auto-discovery. BetterCode owns this single file; everything else in `.opencode/` is OpenCode's.

### 5. `packages/cli` is restored to upstream-pure

- `packages/cli` currently mixes OpenCode CLI runtime and BetterCode wrapper code. Phase 6 extracts the BetterCode wrapper into `packages/bettercode-cli` and restores `packages/cli` to match upstream.
- After restoration, `packages/cli` has no `@bettercode/*` dependencies and no BetterCode source files.

### 6. `packages/bettercode/` (empty shell) is removed

- `packages/bettercode/` contains only `node_modules/`. It is removed in Phase 5. The plugin lives in `packages/bettercode-plugin/`.

### 7. Patches to OpenCode source are forbidden unless an extension point is missing

- Patches are maintained as git cherry-picks or diff files in `patches/opencode/`, NOT as Bun `patchedDependencies` (those are for npm packages).
- Each patch must have: name, reason, files touched, test, upstream PR possibility.
- See `specs/opencode-extension-points.md` (Phase 8).

### 8. Plugin uses only the public `Hooks` interface from `@opencode-ai/plugin`

- The plugin imports types and the `tool()` helper from `@opencode-ai/plugin` (`packages/plugin/src/index.ts`).
- The plugin never imports from `packages/opencode/src/` or `@opencode-ai/opencode`.

### 9. Plugin registration via file-path auto-discovery

OpenCode's config loader (`packages/opencode/src/config/plugin.ts:21`) auto-discovers
plugins by globbing `{plugin,plugins}/*.{ts,js}` under `.opencode/`. `bettercode sync`
creates `.opencode/plugin/bettercode.ts` that re-exports the plugin's default export
from the workspace package. This bypasses the npm install path entirely (a string
spec like `"@bettercode/plugin"` would trigger `Npm.add()` and fail for a private
package).

### 10. Plugin module must default-export `{ id, server }`

The loader (`packages/opencode/src/plugin/shared.ts:272` `readV1Plugin`) reads
`mod.default`. The ID resolver (`shared.ts:306` `resolvePluginId`) throws for
file-path plugins without an `id` string. So the plugin module must be:

```ts
export default { id: "bettercode", server } satisfies PluginModule
```

### 11. `bettercode run` delegates with `--conditions=browser`

OpenCode's `@opentui/*` and `solid-js` imports require the `browser` resolution
condition. The wrapper's `bettercode run` spawns the OpenCode CLI with
`--conditions=browser` or imports will fail at startup.

## Consequences

- Upstream OpenCode updates require adapting only `packages/bettercode-plugin/` (if hook signatures change) and `packages/bettercode-cli/` (if the CLI entrypoint moves). Autonomous packages are untouched.
- The `full-rebrand` branch remains archived on GitHub but is never merged back.
- `packages/cli` merges from upstream are clean (no BetterCode code to conflict with).
- The plugin is discoverable without npm publishing — it's a workspace package loaded via file path.

## Package dependency rules

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

Rule: autonomous packages never import from `packages/opencode/src/` or
`@opencode-ai/opencode`. Only `@bettercode/plugin` may import from
`@opencode-ai/plugin`. `@bettercode/cli-wrapper` delegates to OpenCode via
process spawn, not import.
