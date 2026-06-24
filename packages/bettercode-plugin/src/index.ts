import type { PluginModule, PluginInput, PluginOptions, Hooks } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { brainSearch } from "@bettercode/project-brain"
import { runQualityGate } from "@bettercode/quality-gate"
import { compressLogs, compressDiff, limitTextByBudget, selectRelevantBrainSections } from "@bettercode/context-budget"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const DEFAULT_BRAIN_SECTIONS = [
  "stack", "package manager", "commands", "critical", "paths",
  "architecture", "framework", "language", "build", "test",
]

type BrainOptions = {
  autoInject?: boolean
  maxTokens?: number
  sections?: string[]
}

async function server(input: PluginInput, options?: PluginOptions): Promise<Hooks> {
  const root = input.directory

  const brainOpts = (options?.brain as BrainOptions | undefined) ?? {}
  const maxBrainTokens = brainOpts.maxTokens ?? 2000

  return {
    "experimental.chat.system.transform": async (_hookInput, output) => {
      if (brainOpts.autoInject === false) return

      const brainPath = join(root, ".bettercode", "brain", "profile.md")
      if (!existsSync(brainPath)) return

      const brainText = readFileSync(brainPath, "utf8")
      if (!brainText.trim()) return

      const sectionQuery = (brainOpts.sections ?? DEFAULT_BRAIN_SECTIONS).join(" ")
      const sections = selectRelevantBrainSections(sectionQuery, brainText, maxBrainTokens)
      if (sections) output.system.push(sections)
    },

    tool: {
      bettercode_brain_search: tool({
        description: "Search the BetterCode project brain for context about the codebase",
        args: { query: tool.schema.string().describe("Search query to find in project brain files") },
        async execute(args) {
          const results = brainSearch(root, args.query)
          return {
            title: "Brain search",
            output: results.length === 0
              ? `No results for "${args.query}".`
              : `${results.length} result(s):\n${results.map((r) => `  ${r.file}:${r.line} - ${r.content}`).join("\n")}`,
          }
        },
      }),

      bettercode_quality_gate: tool({
        description: "Run the BetterCode quality gate (lint, typecheck, test, build) and return a score",
        args: {},
        async execute() {
          const result = await runQualityGate(root)
          return {
            title: "Quality gate",
            output: [
              `Status: ${result.status}`,
              `Score: ${result.score}`,
              `Risk: ${result.risk}`,
              `Files changed: ${result.filesChanged}`,
              `Diff lines: ${result.diffLines}`,
              ...result.checks.map((c) => {
                const detail = c.status === "SKIPPED" ? ` - ${c.reason}` : ` - ${c.command} (${c.durationMs}ms)`
                return `${c.status} ${c.name}${detail}`
              }),
              ...result.warnings.map((w) => `WARN: ${w}`),
              ...result.blockingReasons.map((r) => `BLOCKED: ${r}`),
            ].join("\n"),
          }
        },
      }),

      bettercode_context_compress: tool({
        description: "Compress logs, diffs, or long text to fit a context budget",
        args: {
          text: tool.schema.string().describe("Text to compress"),
          mode: tool.schema.enum(["logs", "diff", "limit"]).describe("Compression mode: logs, diff, or limit"),
          maxTokens: tool.schema.number().optional().describe("Max approximate tokens for output (default: 1500)"),
        },
        async execute(args) {
          const max = args.maxTokens ?? 1500
          const compressed =
            args.mode === "logs" ? compressLogs(args.text, { maxTokens: max })
            : args.mode === "diff" ? compressDiff(args.text, { maxTokens: max })
            : limitTextByBudget(args.text, max)

          const originalTokens = Math.ceil(args.text.length / 4)
          const compressedTokens = Math.ceil(compressed.length / 4)

          return {
            title: "Context compressed",
            output: compressed,
            metadata: {
              originalTokens,
              compressedTokens,
              saved: originalTokens - compressedTokens,
            },
          }
        },
      }),
    },
  }
}

export default { id: "bettercode", server } satisfies PluginModule
