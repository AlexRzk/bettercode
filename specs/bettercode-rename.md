# BetterCode Rename — Remaining BetterCode References

This file tracks BetterCode references that were intentionally NOT renamed in the
`bettercode-rename` step. These will be addressed in a future full rebrand.

## Renamed in this step

- `@bettercode/*` → `@bettercode/*` (all BetterCode packages)
- `@bettercode/cli` → `@bettercode/cli`
- CLI command `bettercode` → `bettercode`
- Config directory `.bettercode/` → `.bettercode/`
- Root package name `bettercode` remains unchanged (see below)

## NOT renamed (intentional)

### Root-level

- `root package.json` name: `bettercode` — changing this would break the entire workspace
- `root package.json` repository URLs pointing to `anomalyco/bettercode`

### Legacy BetterCode packages (not part of BetterCode runtime)

- `packages/core` — `@bettercode/core`
- `packages/app` — `@bettercode/app`
- `packages/sdk` — `@bettercode/sdk`
- `packages/web` — `@bettercode/web`
- `packages/desktop` — `@bettercode/desktop`
- `packages/server` — `@bettercode/server`
- `packages/tui` — `@bettercode/tui`
- `packages/console` — `@bettercode/console`
- `packages/script` — `@bettercode/script`
- `packages/docs` — documentation
- `packages/storybook` — UI stories
- `packages/http-recorder` — dev tool
- `packages/function` — utility
- `packages/identity` — auth (BetterCode)
- `packages/llm` — LLM integration (BetterCode)
- `packages/plugin` — plugin system (BetterCode)
- `packages/stats` — analytics (BetterCode)
- `packages/enterprise` — enterprise features

### CLI dependencies kept as-is

- `@bettercode/core` in `packages/cli/package.json`
- `@bettercode/sdk` in `packages/cli/package.json`
- `@bettercode/server` in `packages/cli/package.json`
- `@bettercode/tui` in `packages/cli/package.json`
- `@bettercode/script` in `packages/cli/package.json`
- `@opentui/core`, `@opentui/solid` — external UI libs

### Other

- Nix files, Docker configs, CI/CD workflows
- Install scripts, GitHub actions
- Documentation in multiple languages
- Assets, images, fonts
