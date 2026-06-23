# BetterCode Feature Roadmap

> Status: Accepted
> Date: 2026-06-24

## Classification Key

Each feature is classified as one of:

| Classification | Meaning |
|---|---|
| **Plugin** | Implemented as an OpenCode plugin hook in `@bettercode/plugin` |
| **Wrapper** | Implemented as a CLI command in `@bettercode/cli-wrapper` |
| **Autonomous** | Implemented in a `@bettercode/*` package with no OpenCode coupling |
| **Patch required** | Requires modifying OpenCode source (needs justification) |
| **Out of scope v1** | Explicitly deferred to a future version |

---

## 1. Agent Autonomy

| Feature | Classification | Package | Notes |
|---|---|---|---|
| Project memory (brain init/update/search) | Autonomous | `@bettercode/project-brain` | Already implemented |
| Context retrieval (brain sections injected into prompt) | Plugin | `@bettercode/plugin` | v1 — `experimental.chat.system.transform` hook |
| Multi-step plans (spec generation) | Wrapper / Autonomous | `@bettercode/cli-wrapper` | Already implemented as `bettercode spec` |
| Auto-summary (compaction hook) | Plugin | `@bettercode/plugin` | Future — `experimental.session.compacting` hook |
| Persistent decisions (task history) | Autonomous | `@bettercode/project-brain` | Already implemented (task-history.jsonl) |
| Global user memory (cross-project) | Autonomous | `@bettercode/project-brain` | Out of scope v1 — requires admission/dedup/pruning design |
| Agent self-correction from quality gate feedback | Plugin | `@bettercode/plugin` | Future — `tool.execute.after` hook |

## 2. Quality

| Feature | Classification | Package | Notes |
|---|---|---|---|
| Quality gate (run/score) | Autonomous | `@bettercode/quality-gate` | Already implemented |
| Diff risk analysis | Autonomous | `@bettercode/diff-risk` | Already implemented |
| Suggested tests (from diff risk) | Autonomous | `@bettercode/diff-risk` | Future — extend `requiredChecks` with test suggestions |
| Benchmark | Autonomous | `@bettercode/benchmark` | Placeholder — no real scenarios yet |
| Post-tool quality gate | Plugin | `@bettercode/plugin` | Future — `tool.execute.after` hook runs gate after file writes |
| Quality gate as agent tool | Plugin | `@bettercode/plugin` | v1 — `bettercode_quality_gate` tool |

## 3. Context Intelligence

| Feature | Classification | Package | Notes |
|---|---|---|---|
| Log compression | Autonomous | `@bettercode/context-budget` | Already implemented |
| Diff compression | Autonomous | `@bettercode/context-budget` | Already implemented |
| Brain section selection | Autonomous | `@bettercode/context-budget` | Already implemented |
| Token budgets | Autonomous | `@bettercode/context-budget` | Already implemented |
| Context compression as agent tool | Plugin | `@bettercode/plugin` | v1 — `bettercode_context_compress` tool |
| Old message compression | Plugin | `@bettercode/plugin` | Future — `experimental.chat.messages.transform` hook |

## 4. Model Routing

| Feature | Classification | Package | Notes |
|---|---|---|---|
| Consumer models (Kimi, DeepSeek, Qwen, OpenRouter) | OpenCode config | N/A | Not BetterCode — configured in `.opencode/opencode.jsonc` `provider` |
| Small/large model routing | Plugin | `@bettercode/plugin` | Future — `experimental.provider.small_model` hook |
| Fallback | OpenCode config | N/A | Not BetterCode — OpenCode handles provider fallback |
| Model cost tracking | Out of scope v1 | — | Future — requires token accounting |

## 5. UX

| Feature | Classification | Package | Notes |
|---|---|---|---|
| `bettercode doctor` | Wrapper | `@bettercode/cli-wrapper` | v1 — health check |
| `bettercode init` | Wrapper | `@bettercode/cli-wrapper` | v1 — creates `.bettercode/` |
| `bettercode sync` | Wrapper | `@bettercode/cli-wrapper` | v1 — registers plugin in `.opencode/` |
| `bettercode run` | Wrapper | `@bettercode/cli-wrapper` | v1 — delegates to OpenCode CLI |
| `bettercode brain` | Wrapper | `@bettercode/cli-wrapper` | v1 — brain init/update/search |
| `bettercode gate` | Wrapper | `@bettercode/cli-wrapper` | v1 — quality gate run |
| `bettercode spec` | Wrapper | `@bettercode/cli-wrapper` | v1 — generate mini-spec |
| `bettercode benchmark` | Wrapper | `@bettercode/cli-wrapper` | v1 — benchmark run (placeholder) |
| `bettercode report` | Wrapper | `@bettercode/cli-wrapper` | v1 — generate report |
| Presets | Out of scope v1 | — | Future — project templates for quick setup |
| TUI additions | Out of scope v1 | — | Future — requires OpenCode TUI plugin slot |
| `bettercode validate` | Wrapper | `@bettercode/cli-wrapper` | Future — validate config against schema before sync |

---

## v1 Features (must ship first)

These are the minimum viable features for the first release:

1. **`bettercode init`** (Wrapper) — creates `.bettercode/bettercode.jsonc` and brain directory structure.
2. **`bettercode sync`** (Wrapper) — creates `.opencode/plugin/bettercode.ts` re-export file, optionally writes plugin options to `.opencode/opencode.jsonc`.
3. **`bettercode run`** (Wrapper) — auto-syncs if needed, then delegates to OpenCode CLI with `--conditions=browser`.
4. **Plugin: brain context injection** (Plugin) — `experimental.chat.system.transform` hook reads `.bettercode/brain/profile.md` and injects relevant sections into the system prompt.
5. **Plugin: `bettercode_brain_search` tool** (Plugin) — agent-callable tool that searches the project brain by keyword.

### Why these five

- **init + sync + run** form the user onboarding loop: configure, register plugin, start coding.
- **brain context injection** is the core value proposition — the agent knows the project without being told.
- **brain search tool** gives the agent on-demand access to project memory during a session.

### What v1 explicitly excludes

- No global user memory (requires admission/dedup/pruning design).
- No post-tool quality gate (requires `tool.execute.after` integration testing).
- No old message compression (requires `experimental.chat.messages.transform` testing).
- No model routing hooks (OpenCode config is sufficient for v1).
- No TUI additions (requires OpenCode TUI plugin slot).
- No presets (premature — need real usage data first).
- No benchmark scenarios (placeholder only).

---

## v1 → v2 Transition Criteria

Before starting v2 work:

- [ ] v1 features are all implemented and tested.
- [ ] E2E integration tests pass (Phase 9).
- [ ] Upstream update workflow is documented and verified (Phase 10).
- [ ] CI is green (Phase 11).
- [ ] At least one real project uses BetterCode v1 for a full session.
- [ ] No patch to OpenCode source was needed (or if one was needed, it has an upstream PR).
