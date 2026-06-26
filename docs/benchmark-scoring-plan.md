# Benchmark Scoring Upgrade Plan

## Goal

Make `bettercode benchmark run` prove whether BetterCode improves OpenCode using objective success metrics, not only token/cost deltas.

## Phase 1: Define Benchmark Result Model

Add a richer benchmark task schema.

Current task:

```ts
{
  id: string
  category: string
  prompt: string
}
```

New task shape:

```ts
{
  id: string
  category: string
  prompt: string
  timeoutMs?: number
  expected?: {
    contains?: string[]
    notContains?: string[]
    filesChanged?: string[]
    filesNotChanged?: string[]
    commandsPass?: string[]
    minQualityScore?: number
    maxToolCalls?: number
    maxSubagents?: number
  }
}
```

Add per-run result fields:

```ts
{
  status: "PASS" | "FAIL" | "TIMEOUT" | "ERROR"
  score: number
  reasons: string[]
  stats: {
    inputTokens: number
    outputTokens: number
    cost: number
    durationMs: number
    toolCalls: number
    subagents: number
    filesRead: string[]
    filesChanged: string[]
  }
}
```

## Phase 2: Parse OpenCode JSON Events

Enhance the benchmark runner to inspect `--format json` output.

Capture:

- `sessionID`
- assistant final answer text
- tool calls and tool names
- subagent/task tool usage
- errors
- timeout state
- likely file reads/edits from tool arguments

## Phase 3: Add Scoring Engine

Scoring rules:

- Start from `100`.
- Hard fail on timeout or process error.
- Subtract points for missing expected answer text.
- Subtract points for unexpected text.
- Subtract points if expected files were not changed.
- Subtract points if forbidden files changed.
- Subtract points if validation commands fail.
- Subtract points for excessive tool calls or subagents.

Default weights:

| Condition | Penalty |
| --- | --- |
| timeout/error | FAIL |
| missing expected content | -20 each |
| forbidden content | -20 each |
| missing expected file change | -25 each |
| unexpected file change | -25 each |
| validation command failed | -40 each |
| tool-call budget exceeded | -10 |
| subagent budget exceeded | -15 |

Final status:

- PASS: score >= 90
- WARN: score >= 70
- FAIL: score < 70
- TIMEOUT: process timed out
- ERROR: process or parsing failed

## Phase 4: Add Benchmark Isolation

Avoid mutating the real `.opencode` config during baseline runs.

- Create a temporary benchmark workspace per run.
- Copy only required files.
- Disable BetterCode in the copied baseline workspace.
- Run BetterCode in a separate copied workspace.
- Always write artifacts under `.bettercode/benchmark-runs/<timestamp>/`.

## Phase 5: Add Validation Commands

Support task-specific validation commands after each variant run.

## Phase 6: Report Upgrade

Replace token-only report with success-first report.

Sections:

- Overall pass rate: baseline vs BetterCode.
- Average score: baseline vs BetterCode.
- Success per category.
- Token cost per successful task.
- Duration per successful task.
- Tool calls per successful task.
- Subagent count.
- Timeout/error count.
- Per-task reasons.

## Phase 7: Full Test Suite

Test groups:

1. Task schema tests
2. Event parser tests
3. Scoring tests
4. Validation command tests
5. Report tests
6. Integration test

## Phase 8: Validation Phase

Run from `packages/bettercode-cli`:

```bash
bun test
bun typecheck
```

Also run from:

- `packages/bettercode-plugin`
- `packages/project-brain`
- `packages/quality-gate`
- `packages/context-budget`
- `packages/diff-risk`

Acceptance criteria:

- No real `.opencode` files are renamed or left in backup state.
- Benchmark writes artifacts even on timeout.
- Partial report is generated on failed tasks.
- Score is based on task success first, token savings second.
- BetterCode can lose a benchmark if it adds irrelevant context or fails validation.
- Existing tests still pass.
