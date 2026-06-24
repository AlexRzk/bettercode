# OpenCode Extension Points

> Status: Accepted
> Date: 2026-06-24

## Purpose

This document tracks the available OpenCode plugin extension points and any gaps
that require patches to OpenCode source. The goal is to keep the patch queue
empty or minimal by using plugin hooks whenever possible.

## Available Extension Points

These are available via the `@opencode-ai/plugin` `Hooks` interface
(`packages/plugin/src/index.ts:222-335`):

| Hook | Purpose | BetterCode usage |
|---|---|---|
| `experimental.chat.system.transform` | Modify system prompt per-turn | Brain context injection |
| `experimental.chat.messages.transform` | Modify message history | Context compression |
| `experimental.session.compacting` | Customize compaction prompt | Future: context-budget |
| `experimental.compaction.autocontinue` | Control auto-continue | Future: quality gate |
| `experimental.provider.small_model` | Route to small model | Future: cost optimization |
| `experimental.text.complete` | Modify text completions | Not used |
| `tool` | Define agent-callable tools | `bettercode_brain_search`, `bettercode_quality_gate`, `bettercode_context_compress` |
| `tool.execute.before` | Pre-tool hook | Future: task history |
| `tool.execute.after` | Post-tool hook | Future: quality gate |
| `tool.definition` | Modify tool schemas | Not used |
| `chat.message` | Handle new messages | Not used (removed) |
| `chat.params` | Modify LLM parameters | Not used |
| `chat.headers` | Modify HTTP headers | Not used |
| `permission.ask` | Control permission prompts | Not used |
| `command.execute.before` | Pre-command hook | Not used |
| `shell.env` | Modify shell environment | Not used |
| `config` | Modify config | Not used |
| `event` | Handle events | Not used |
| `dispose` | Cleanup on unload | Not used |
| `auth` | Authentication flow | Not used |
| `provider` | Provider hooks | Not used |

## Patch Queue

**Current patches: none.**

If a patch is needed, add it here with this format:

```markdown
### Patch: <name>

- **Reason**: <why a plugin hook is insufficient>
- **Files**: <OpenCode files touched>
- **Test**: <how to verify the patch works>
- **Upstream PR**: <link to upstream PR, if created>
- **Date added**: <date>
```

## When a patch is justified

A patch is justified ONLY when:

1. A required hook does not exist in the `Hooks` interface.
2. The hook exists but doesn't expose enough information (e.g., missing input fields).
3. The hook exists but its timing is wrong (e.g., fires too late).
4. A public API that plugins need is currently internal.

## When a patch is NOT justified

A patch is NOT justified when:

- The feature can be implemented with existing hooks (even if inconvenient).
- The change is a rename, refactor, or global rebrand.
- The change modifies storage without proven need.
- The change adds BetterCode-specific logic directly into OpenCode source.
- The change is cosmetic (UI tweaks, config format changes).

## Process for adding a patch

1. Try to implement the feature using existing hooks first.
2. If a hook is genuinely missing, document the gap here.
3. Create a minimal diff or cherry-pick commit.
4. Add the patch to `patches/opencode/`.
5. Add an entry to this document.
6. Submit an upstream PR to make the patch temporary.
7. Remove the patch when upstream merges the change.
