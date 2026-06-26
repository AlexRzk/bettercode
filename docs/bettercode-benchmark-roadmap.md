# BetterCode Benchmark And Plugin Roadmap

## Verdict

The BetterCode plugin shows a promising direction, but the current benchmark does not yet prove that it broadly upgrades OpenCode.

What it proves today:

- BetterCode can add project-aware tools and system-prompt context.
- It may reduce exploration on knowledge-recall tasks.
- It currently risks adding context-token overhead without enough relevance filtering.

What it does not prove yet:

- Better task success.
- Better code quality.
- Fewer tool calls.
- Faster completion across realistic coding tasks.
- Better reliability across repeated runs.

## Current Benchmark Findings

The current benchmark tasks are mostly knowledge-recall prompts:

- Summarize the project.
- Recall a plugin symlink issue.
- Explain the quality gate.

The runner currently measures mostly:

- Input tokens.
- Output tokens.
- Cost.
- Duration.

These are useful, but incomplete. Token savings alone are not enough to prove a coding-agent upgrade.

The latest observed results were mixed:

| Task | Result |
| --- | --- |
| Project summary | BetterCode used more tokens because it injected context. |
| Known-error recall | BetterCode gave a richer answer, but token usage was still slightly higher. |
| Quality gate explain | Baseline spawned a subagent and the suite timed out, which suggests BetterCode may help avoid exploration, but the run was incomplete. |

One important local finding: the live brain files are mostly empty right now.

- `.bettercode/brain/profile.md` only contains generated stack, package-manager, command, and critical-path facts.
- `.bettercode/brain/known-errors.md` is empty.
- `.bettercode/brain/architecture.md` is empty.

So the plugin is not yet using rich project memory. The current auto-injection can only inject what exists.

## Current Plugin Strengths

The plugin currently has three real capabilities:

- `bettercode_brain_search` searches the project brain.
- `bettercode_quality_gate` runs lint/typecheck/test/build and returns a score.
- `bettercode_context_compress` compresses logs, diffs, or arbitrary text.

It also injects selected brain sections into the system prompt using OpenCode's `experimental.chat.system.transform` hook.

That is a good foundation. But today it is mostly passive context plus manual tools. The powerful version should become an active feedback loop: observe the task, retrieve precise context, guide tool use, run quality gates after edits, compress noisy context, and learn from outcomes.

## Benchmarking Principles

Modern agent-evaluation practices suggest measuring more than token count.

BetterCode should track:

- Task success.
- Tests passing.
- Tool calls.
- Subagent launches.
- Files read.
- Files edited.
- Retrieved-context precision.
- Retrieved-context recall.
- Repeated-run reliability.
- Token cost per successful task.

Useful benchmark patterns:

- ContextBench-style metrics: retrieved file/block/line precision, recall, and F1.
- Tau-bench-style reliability: repeated trials, pass rates, realistic tool interactions.
- SWE-bench-style coding evaluation: whether the agent actually fixes issues and passes tests.

## Prioritized Roadmap

### 1. Add Objective Benchmark Scoring

Why: This is the highest-leverage change because current results are not conclusive.

Add benchmark assertions per task:

- Expected answer substrings for knowledge tasks.
- Expected changed files for edit tasks.
- Test command pass/fail.
- Quality gate score before and after.
- Whether the task completed without timeout.
- Whether the agent launched subagents.
- Number of tool calls and file reads.

Expected benchmark impact: very high.

### 2. Add Real Coding Tasks To The Benchmark

Why: BetterCode is supposed to improve coding work, not just project Q&A.

Add benchmark categories:

- Bug fix with known failing test.
- Type error repair.
- Add small feature.
- Update docs from code.
- Refactor with constraints.
- Debug from log.
- Risky change requiring quality gate.
- Cold-project onboarding.

Each task should run baseline vs BetterCode and evaluate success automatically.

Expected benchmark impact: very high.

### 3. Make Brain Search Semantic, Not Keyword-Only

Why: Current brain search requires all query terms to appear on the same line, which is too weak.

Improve brain search with:

- Section-level search, not line-level only.
- Term scoring with partial matches.
- File/path boosts.
- Recent task-history boosts.
- Optional embeddings later, after deterministic scoring is strong.
- Surrounding context in results, not just one matching line.

Expected benchmark impact: very high, especially on debugging and architecture tasks.

### 4. Stop Injecting Generic Brain Context By Default

Why: Current auto-injection can increase input tokens without improving output.

Better approach:

- Inject only a tiny BetterCode tools hint by default.
- Inject project profile only when the user task needs it.
- Use intent detection from the user prompt to select sections.
- Prefer tool-based retrieval over large system-prompt injection.
- Set a hard default injection budget around 300-700 tokens.

Expected benchmark impact: very high for token efficiency.

### 5. Populate The Brain Automatically With Useful Facts

Why: The brain is currently mostly empty, so the plugin has little real memory to use.

Extend `brain update` to generate:

- Package layout summary.
- Important package responsibilities.
- Test commands by package.
- Known failure modes.
- Architecture boundaries.
- Do-not-touch rules.
- Common workflows.
- Recent quality gate failures.
- Dependency and tooling notes.

Expected benchmark impact: high.

### 6. Add Post-Edit Quality Gate Feedback

Why: This turns BetterCode from a passive assistant into a self-correcting agent.

Behavior:

- Detect file-writing tools.
- Run targeted checks after edits.
- Feed concise failures back into the model.
- Ask the agent to repair.
- Limit retries to avoid loops.

Expected benchmark impact: high for coding tasks.

### 7. Add Targeted Test Selection From Diff Risk

Why: Running full lint/typecheck/test/build every time can be slow and expensive.

Extend diff risk analysis to suggest:

- Which package to test.
- Which test files are related.
- Whether typecheck/build is required.
- Whether docs-only changes can skip tests.
- Whether migrations/auth/API changes require stricter gates.

Expected benchmark impact: high for duration and reliability.

### 8. Track Tool-Use Telemetry

Why: The quality improvement may show up as fewer reads, fewer searches, fewer subagents, or fewer failed commands before it shows up as lower tokens.

Track per run:

- Tool call count.
- Unique files read.
- Files edited.
- Shell commands run.
- Failed commands.
- Subagent launches.
- Brain search calls.
- Quality gate calls.
- Compression calls.
- Final status.

Expected benchmark impact: high for proving value.

### 9. Add Context Precision Metrics

Why: BetterCode should not just add context. It should add the right context.

Track:

- Gold files per task.
- Retrieved files.
- Precision: retrieved relevant files divided by retrieved total files.
- Recall: retrieved relevant files divided by gold relevant files.
- F1.
- Redundancy: repeated reads of the same files.
- Evidence drop: relevant context retrieved but not used in the final answer or edit.

Expected benchmark impact: high for context-specific claims.

### 10. Add Message-History Compression

Why: Long sessions are where BetterCode should become more useful than vanilla OpenCode.

Use OpenCode's message transform hook to:

- Compress old logs.
- Preserve decisions.
- Preserve file paths and unresolved TODOs.
- Drop repeated tool output.
- Keep failures and fixes.

Expected benchmark impact: medium-high for long-session benchmarks.

### 11. Add Compaction Hook Integration

Why: BetterCode can preserve project and task memory during OpenCode compaction.

The compaction prompt should preserve:

- User goal.
- Current plan.
- Files changed.
- Commands run.
- Failures.
- Quality gate result.
- Next action.

Expected benchmark impact: medium-high for long tasks.

### 12. Add Persistent Task History Learning

Why: Repeated project work is where BetterCode can beat a fresh agent.

Improve task history to store:

- User task summary.
- Files touched.
- Commands that fixed the issue.
- Errors encountered.
- Final result.
- Durable lessons.

Avoid storing huge logs.

Expected benchmark impact: medium-high.

### 13. Add Known Error Admission

Why: Known errors should not rely on manual editing.

When quality gate or shell commands fail:

- Detect error signature.
- Ask whether to save it, or auto-save if repeated.
- Store cause, fix, affected commands, and file paths.
- Make `bettercode_brain_search` return these prominently.

Expected benchmark impact: medium-high for debugging benchmarks.

### 14. Add Better Benchmark Isolation

Why: Current benchmark mutates `.opencode` files by renaming plugin/config files. If interrupted, it can leave backups behind.

Safer approach:

- Run baseline and BetterCode in temporary copied worktrees.
- Use separate OpenCode config directories if supported.
- Use unique session markers.
- Detect timeout and record a failed run instead of crashing.
- Always emit a partial report.

Expected benchmark impact: medium, but important for trust.

### 15. Add Repeated Runs And Reliability Metrics

Why: One run per task is noisy.

Add:

- `--runs 3` or `--runs 5`.
- Mean, median, and p95 duration.
- Pass@k.
- Failure rate.
- Timeout rate.
- Variance by model.

Expected benchmark impact: medium.

### 16. Add Model Routing Later

Why: Useful, but not before retrieval and evals are fixed.

Potential behavior:

- Small model for brain summarization.
- Main model for coding.
- Cheap model for log compression.
- Strong model for final review.

Expected benchmark impact: medium, mostly cost-focused.

### 17. Improve Context Compression Quality

Why: Current compression preserves error-looking lines and diff headers, but it is still simple.

Improve compression to:

- Preserve surrounding lines around errors.
- Group stack traces.
- Deduplicate repeated logs.
- Preserve command exit status.
- Preserve changed-file summaries.
- Add structured JSON output option.

Expected benchmark impact: medium.

### 18. Add Project Presets

Why: Helpful for onboarding, but benchmark impact is lower than retrieval and quality loops.

Examples:

- Next.js preset.
- Bun monorepo preset.
- Python preset.
- Rust preset.
- Solidity preset.

Expected benchmark impact: low-medium.

## Recommended Implementation Sequence

1. Upgrade benchmark scoring first.
2. Add 8-12 realistic coding tasks.
3. Replace keyword brain search with scored section retrieval.
4. Reduce default system-prompt injection.
5. Auto-populate richer brain facts.
6. Add post-edit quality gate loop.
7. Add telemetry and context precision metrics.

This sequence gives two wins at once: the plugin becomes more useful, and the benchmark becomes capable of proving it.
