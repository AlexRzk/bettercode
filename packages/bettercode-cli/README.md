# bettercode

AI-powered project intelligence for OpenCode. Adds a project brain, quality gates, and context compression to your OpenCode session.

## Install

```bash
npm install -g bettercode @opencode-ai/cli
```

## Quick Start

```bash
cd your-project
bettercode setup
bettercode run
```

`setup` creates:
- `.bettercode/quality-gate.json` — quality gate config
- `.bettercode/brain/` — project brain (auto-populated)
- `.bettercode/bettercode.jsonc` — plugin options
- `.opencode/plugin/bettercode.js` — OpenCode plugin

`run` launches OpenCode with the BetterCode plugin active.

## What It Does

Three tools are added to your OpenCode session:

| Tool | Description |
|---|---|
| `bettercode_brain_search` | Search your project brain for architecture, patterns, and context |
| `bettercode_quality_gate` | Run lint, typecheck, test, build and get a quality score |
| `bettercode_context_compress` | Compress logs and diffs to fit context budgets |

The plugin also auto-injects relevant brain context into the system prompt.

## Commands

```
bettercode setup [--no-input] [--no-brain] [--no-plugin]
bettercode init
bettercode sync
bettercode doctor
bettercode run -- [opencode args]
bettercode gate run
bettercode brain init | update | search <query>
bettercode spec <description>
bettercode benchmark run
bettercode report
```

## Requirements

- Node.js >= 18
- [OpenCode CLI](https://github.com/nichochar/opencode) (`@opencode-ai/cli`) — optional, needed for `bettercode run`

## Configuration

Edit `.bettercode/bettercode.jsonc`:

```jsonc
{
  "plugin": {
    "brain": {
      "autoInject": true,
      "maxTokens": 2000,
      "sections": ["stack", "package manager", "commands", "critical", "paths"]
    }
  }
}
```

## License

MIT
