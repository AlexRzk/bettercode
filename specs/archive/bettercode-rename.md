# BetterCode Rename — Remaining OpenCode References

This file tracks OpenCode references that were intentionally NOT renamed in the
`bettercode-rename` step. These will be addressed in a future full rebrand.

## Renamed in this step

- `@better-code/*` → `@bettercode/*` (all BetterCode packages)
- `@opencode-ai/cli` → `@bettercode/cli`
- CLI command `better-code` → `bettercode`
- Config directory `.better-code/` → `.bettercode/`
- Root package name `opencode` remains unchanged (see below)

## NOT renamed (intentional)

### Root-level

- `root package.json` name: `opencode` — changing this would break the entire workspace
- `root package.json` repository URLs pointing to `anomalyco/opencode`

### Legacy OpenCode packages (not part of BetterCode runtime)

- `packages/core` — `@opencode-ai/core`
- `packages/app` — `@opencode-ai/app`
- `packages/sdk` — `@opencode-ai/sdk`
- `packages/web` — `@opencode-ai/web`
- `packages/desktop` — `@opencode-ai/desktop`
- `packages/server` — `@opencode-ai/server`
- `packages/tui` — `@opencode-ai/tui`
- `packages/console` — `@opencode-ai/console`
- `packages/script` — `@opencode-ai/script`
- `packages/docs` — documentation
- `packages/storybook` — UI stories
- `packages/http-recorder` — dev tool
- `packages/function` — utility
- `packages/identity` — auth (OpenCode)
- `packages/llm` — LLM integration (OpenCode)
- `packages/plugin` — plugin system (OpenCode)
- `packages/stats` — analytics (OpenCode)
- `packages/enterprise` — enterprise features

### CLI dependencies kept as-is

- `@opencode-ai/core` in `packages/cli/package.json`
- `@opencode-ai/sdk` in `packages/cli/package.json`
- `@opencode-ai/server` in `packages/cli/package.json`
- `@opencode-ai/tui` in `packages/cli/package.json`
- `@opencode-ai/script` in `packages/cli/package.json`
- `@opentui/core`, `@opentui/solid` — external UI libs

### Other

- Nix files, Docker configs, CI/CD workflows
- Install scripts, GitHub actions
- Documentation in multiple languages
- Assets, images, fonts
