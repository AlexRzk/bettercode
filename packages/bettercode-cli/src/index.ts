#!/usr/bin/env node

import { mkdir as mkdirAsync, stat } from "node:fs/promises"
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs"
import { dirname, join, parse } from "node:path"
import { fileURLToPath } from "node:url"
import { createInterface } from "node:readline"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { runQualityGate } from "@bettercode/quality-gate"
import { brainInit, brainUpdate, brainSearch } from "@bettercode/project-brain"
import { generateSpec } from "./spec"

// ── Inline JSONC parser (state-machine, no external deps) ──

function stripJsoncComments(input: string): string {
  const out: string[] = []
  let i = 0
  const len = input.length
  while (i < len) {
    const ch = input[i]!
    if (ch === '"' || ch === "'") {
      const quote = ch
      out.push(ch)
      i++
      while (i < len) {
        const c = input[i]!
        out.push(c)
        if (c === "\\" && i + 1 < len) { i++; out.push(input[i]!) }
        else if (c === quote) break
        i++
      }
      i++
    } else if (ch === "/" && i + 1 < len && input[i + 1] === "/") {
      while (i < len && input[i] !== "\n") i++
    } else if (ch === "/" && i + 1 < len && input[i + 1] === "*") {
      i += 2
      while (i + 1 < len && !(input[i] === "*" && input[i + 1] === "/")) i++
      i += 2
    } else {
      out.push(ch)
      i++
    }
  }
  return out.join("")
}

function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1")
}

function parseJsonc(raw: string): unknown {
  return JSON.parse(stripTrailingCommas(stripJsoncComments(raw)))
}

function validateJsonc(raw: string): boolean {
  try { parseJsonc(raw); return true } catch { return false }
}

const configDir = ".bettercode"

const defaultQualityGate = {
  project: { type: "auto", packageManager: "auto" },
  commands: { lint: "auto", typecheck: "auto", test: "auto", build: "auto" },
  thresholds: { passScore: 90, warnScore: 70, maxChangedFiles: 12, maxDiffLines: 500 },
  rules: { failOnBuildError: true, failOnTypecheckError: true, failOnSecrets: true, warnOnMissingTests: true, reviewCriticalPath: true },
  criticalPaths: ["src/auth/**", "src/middleware.ts", "src/app/api/**", "prisma/migrations/**"],
}

const defaultBettercodeConfig = `{
  "plugin": {
    "brain": {
      "autoInject": true,
      "maxTokens": 2000,
      "sections": [
        "stack", "package manager", "commands", "critical", "paths",
        "architecture", "framework", "language", "build", "test"
      ]
    },
    "qualityGate": {
      "autoRun": false,
      "failOnError": false
    },
    "contextBudget": {
      "mode": "balanced",
      "maxLogTokens": 1500,
      "maxDiffTokens": 4000
    }
  }
}
`

// ── Plugin source resolution ──

const distDir = dirname(fileURLToPath(import.meta.url))

function findPluginSource(): string {
  // Production: bundled plugin.js is next to cli.js in dist/
  const distPlugin = join(distDir, "plugin.js")
  if (existsSync(distPlugin)) return distPlugin

  // Dev: source is in packages/bettercode-plugin/src/index.ts
  const devPlugin = join(distDir, "..", "..", "bettercode-plugin", "src", "index.ts")
  if (existsSync(devPlugin)) return devPlugin

  throw new Error("Plugin source not found. Run 'bun run build' or reinstall bettercode.")
}

const flags = parseFlags(process.argv.slice(2))
const root = flags.root ?? await findRepoRoot(process.cwd())
migrateLegacyConfig(root)

const command = flags.positional

if (command.length === 0) { printHelp(); process.exit(0) }

if (command[0] === "setup") { await cmdSetup(); process.exit(0) }
if (command[0] === "init") { await cmdInit(); process.exit(0) }
if (command[0] === "sync") { await cmdSync(); process.exit(0) }
if (command[0] === "doctor") { await cmdDoctor(); process.exit(0) }
if (command[0] === "run") { await cmdRun(); process.exit(0) }
if (command[0] === "gate" && command[1] === "run") { await cmdGateRun(); process.exit(0) }
if (command[0] === "brain" && command[1] === "init") { await cmdBrainInit(); process.exit(0) }
if (command[0] === "brain" && command[1] === "update") { await cmdBrainUpdate(); process.exit(0) }
if (command[0] === "brain" && command[1] === "search" && command.length >= 3) { await cmdBrainSearch(); process.exit(0) }
if (command[0] === "spec" && command.length >= 2) { await cmdSpec(); process.exit(0) }
if (command[0] === "benchmark" && command[1] === "run") { await cmdBenchmarkRun(); process.exit(0) }
if (command[0] === "report") { await cmdReport(); process.exit(0) }

printHelp()
process.exit(1)

// ── Flag parsing ──

function parseFlags(argv: string[]) {
  const positional: string[] = []
  const parsed: Record<string, string | boolean> = {}
  let i = 0
  while (i < argv.length) {
    if (argv[i] === "--json") { parsed.json = true; i++; continue }
    if (argv[i] === "--no-input") { parsed.noInput = true; i++; continue }
    if (argv[i] === "--no-brain") { parsed.noBrain = true; i++; continue }
    if (argv[i] === "--no-plugin") { parsed.noPlugin = true; i++; continue }
    if (argv[i] === "--no-options") { parsed.noOptions = true; i++; continue }
    if (argv[i] === "--root" && argv[i + 1]) { parsed.root = argv[i + 1]!; i += 2; continue }
    positional.push(argv[i]!); i++
  }
  return {
    json: !!parsed.json,
    noInput: !!parsed.noInput,
    noBrain: !!parsed.noBrain,
    noPlugin: !!parsed.noPlugin,
    noOptions: !!parsed.noOptions,
    root: typeof parsed.root === "string" ? parsed.root : undefined,
    positional,
  }
}

function jsonOutput(data: unknown) {
  console.log(JSON.stringify(data, null, 2))
}

function askYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(defaultYes)
      return
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const prompt = defaultYes ? "[Y/n]" : "[y/N]"
    rl.question(`? ${question} ${prompt} `, (answer) => {
      rl.close()
      const trimmed = answer.trim().toLowerCase()
      if (trimmed === "") resolve(defaultYes)
      else if (trimmed === "y" || trimmed === "yes") resolve(true)
      else if (trimmed === "n" || trimmed === "no") resolve(false)
      else resolve(defaultYes)
    })
  })
}

function printHelp() {
  console.log("bettercode")
  console.log("")
  console.log("Usage: bettercode [options] <command> [args]")
  console.log("")
  console.log("Options:")
  console.log("  --json        Output JSON instead of human-readable text")
  console.log("  --root <path> Run in the specified directory")
  console.log("")
  console.log("Commands:")
  console.log("  setup                      One-command setup (init + brain + sync + doctor)")
  console.log("  init                       Initialize BetterCode configuration")
  console.log("  sync                       Register BetterCode plugin in OpenCode config")
  console.log("  doctor                     Check system health")
  console.log("  run -- [opencode args]     Run OpenCode with BetterCode plugin active")
  console.log("  gate run                   Run adaptive quality gates")
  console.log("  brain init                 Initialize the project brain")
  console.log("  brain update               Update the project brain profile")
  console.log("  brain search <query>       Search the project brain by keyword")
  console.log("  spec <description>         Generate a mini-spec before modification")
  console.log("  benchmark run              Run comparative benchmarks")
  console.log("  report                     Generate a BetterCode report")
}

// ── Commands ──

async function cmdInit() {
  await initBetterCode(root)
  if (flags.json) {
    jsonOutput({ status: "ok", configDir, created: ["quality-gate.json", "brain/"] })
  } else {
    console.log("BetterCode initialized.")
    console.log(`Created ${configDir}/quality-gate.json`)
    console.log(`Created ${configDir}/brain/`)
  }
}

async function cmdSetup() {
  const isInteractive = !flags.noInput && process.stdin.isTTY

  console.log("bettercode setup\n")

  const doBrain = flags.noBrain ? false : (isInteractive ? await askYesNo("Initialize project brain?", true) : true)
  const doPlugin = flags.noPlugin ? false : (isInteractive ? await askYesNo("Register BetterCode plugin with OpenCode?", true) : true)
  const doOptions = flags.noOptions ? false : (isInteractive ? await askYesNo("Configure plugin options?", true) : true)

  // Always create quality-gate.json (it's cheap and always useful)
  console.log("Creating .bettercode/quality-gate.json...")
  await initQualityGateConfig(root)

  if (doBrain) {
    console.log("Creating .bettercode/brain/...")
    await brainInit(root)
    console.log("Updating brain with project info...")
    await brainUpdate(root)
  }

  if (doOptions) {
    const bcConfigPath = join(root, configDir, "bettercode.jsonc")
    if (existsSync(bcConfigPath)) {
      console.log(".bettercode/bettercode.jsonc already exists, skipping")
    } else {
      mkdirSync(join(root, configDir), { recursive: true })
      console.log("Creating .bettercode/bettercode.jsonc with defaults...")
      writeFileSync(bcConfigPath, defaultBettercodeConfig)
    }
  }

  if (doPlugin) {
    console.log("Creating .opencode/plugin/bettercode.js...")
    await cmdSync()
  }

  console.log("\nRunning doctor check...")
  await cmdDoctor()

  console.log("\n✓ bettercode setup complete!")
  console.log("Next: run 'bettercode run' to start OpenCode with the plugin.")
}

async function cmdSync() {
  const bcConfigPath = join(root, configDir, "bettercode.jsonc")
  const opencodePluginDir = join(root, ".opencode", "plugin")
  const pluginFile = join(opencodePluginDir, "bettercode.js")
  const opencodeConfig = join(root, ".opencode", "opencode.jsonc")

  // Read BetterCode config (use defaults if missing)
  let pluginOptions: Record<string, unknown> | undefined
  if (existsSync(bcConfigPath)) {
    try {
      const raw = readFileSync(bcConfigPath, "utf8")
      const config = parseJsonc(raw) as Record<string, unknown> | null
      if (!config || typeof config !== "object") throw new Error("Invalid JSONC")
      pluginOptions = config.plugin as Record<string, unknown> | undefined
    } catch {
      // ignore invalid config
    }
  }

  // Create .opencode/plugin/ directory
  mkdirSync(opencodePluginDir, { recursive: true })

  // Copy bundled plugin file
  const pluginSource = findPluginSource()
  copyFileSync(pluginSource, pluginFile)

  // If plugin options exist, write them to .opencode/opencode.jsonc
  if (pluginOptions && Object.keys(pluginOptions).length > 0) {
    if (existsSync(opencodeConfig)) {
      try {
        const raw = readFileSync(opencodeConfig, "utf8")
        const config = parseJsonc(raw) as Record<string, unknown> | null
        if (!config || typeof config !== "object") throw new Error("Invalid JSONC")

        const pluginEntry = ["./plugin/bettercode.js", pluginOptions]
        const existingPlugins = Array.isArray(config.plugin) ? config.plugin : []

        // Check if plugin already exists
        const existingIdx = existingPlugins.findIndex((p: unknown) => {
          if (typeof p === "string") return p.endsWith("/bettercode.js")
          if (Array.isArray(p) && typeof p[0] === "string") return p[0].endsWith("/bettercode.js")
          return false
        })

        if (existingIdx >= 0) {
          existingPlugins[existingIdx] = pluginEntry
        } else {
          existingPlugins.push(pluginEntry)
        }

        config.plugin = existingPlugins
        writeFileSync(opencodeConfig, JSON.stringify(config, null, 2) + "\n")
      } catch {
        // If config is invalid, skip options write
      }
    }
  }

  if (flags.json) {
    jsonOutput({ status: "ok", pluginFile: pluginFile.replace(root, "").replace(/^[/\\]/, "").replaceAll("\\", "/") })
  } else {
    console.log("BetterCode plugin registered.")
    console.log(`  Created .opencode/plugin/bettercode.js`)
    if (pluginOptions && Object.keys(pluginOptions).length > 0) {
      console.log("  Plugin options written to .opencode/opencode.jsonc")
    }
  }
}

async function cmdDoctor() {
  const checks: { name: string; status: string; detail?: string }[] = []

  // Check 1: BetterCode CLI bundle exists
  const cliBundle = join(distDir, "cli.js")
  const devEntry = join(distDir, "..", "src", "index.ts")
  if (existsSync(cliBundle)) {
    checks.push({ name: "BetterCode CLI", status: "ok", detail: "dist/cli.js present (bundled)" })
  } else if (existsSync(devEntry)) {
    checks.push({ name: "BetterCode CLI", status: "ok", detail: "src/index.ts present (dev mode)" })
  } else {
    checks.push({ name: "BetterCode CLI", status: "error", detail: "CLI entry not found" })
  }

  // Check 2: .bettercode/bettercode.jsonc
  const bcConfigPath = join(root, configDir, "bettercode.jsonc")
  if (existsSync(bcConfigPath)) {
    try {
      const raw = readFileSync(bcConfigPath, "utf8")
      if (!validateJsonc(raw)) throw new Error("Invalid JSONC")
      checks.push({ name: "BetterCode config", status: "ok", detail: ".bettercode/bettercode.jsonc valid" })
    } catch {
      checks.push({ name: "BetterCode config", status: "error", detail: ".bettercode/bettercode.jsonc is invalid JSONC" })
    }
  } else {
    checks.push({ name: "BetterCode config", status: "warn", detail: ".bettercode/bettercode.jsonc not found (run bettercode init)" })
  }

  // Check 3: .opencode/plugin/bettercode.js
  const pluginFile = join(root, ".opencode", "plugin", "bettercode.js")
  if (existsSync(pluginFile)) {
    checks.push({ name: "Plugin registration", status: "ok", detail: ".opencode/plugin/bettercode.js present" })
  } else {
    checks.push({ name: "Plugin registration", status: "warn", detail: ".opencode/plugin/bettercode.js not found (run bettercode sync)" })
  }

  // Check 4: OpenCode CLI (lildax) available
  const lildaxCheck = spawnSync("lildax", ["--version"], { encoding: "utf8", timeout: 5000 })
  if (lildaxCheck.status === 0) {
    checks.push({ name: "OpenCode CLI", status: "ok", detail: "lildax found on PATH" })
  } else {
    // Try node_modules resolution
    try {
      const require = createRequire(import.meta.url)
      require.resolve("@opencode-ai/cli/bin/lildax.cjs")
      checks.push({ name: "OpenCode CLI", status: "ok", detail: "@opencode-ai/cli found in node_modules" })
    } catch {
      checks.push({ name: "OpenCode CLI", status: "warn", detail: "lildax not found (install @opencode-ai/cli)" })
    }
  }

  // Check 5: .opencode/opencode.jsonc validity
  const opencodeConfig = join(root, ".opencode", "opencode.jsonc")
  if (existsSync(opencodeConfig)) {
    try {
      const raw = readFileSync(opencodeConfig, "utf8")
      if (!validateJsonc(raw)) throw new Error("Invalid JSONC")
      checks.push({ name: "OpenCode config", status: "ok", detail: ".opencode/opencode.jsonc valid" })
    } catch {
      checks.push({ name: "OpenCode config", status: "error", detail: ".opencode/opencode.jsonc is invalid JSONC" })
    }
  } else {
    checks.push({ name: "OpenCode config", status: "ok", detail: ".opencode/opencode.jsonc not present (optional)" })
  }

  // Output
  if (flags.json) {
    jsonOutput(checks)
  } else {
    const hasError = checks.some((c) => c.status === "error")
    const hasWarn = checks.some((c) => c.status === "warn")
    const icon = (s: string) => s === "ok" ? "ok" : s === "warn" ? "warn" : "ERROR"
    for (const check of checks) {
      console.log(`[${icon(check.status)}] ${check.name}: ${check.detail}`)
    }
    if (hasError) {
      console.log("\nHealth check FAILED. Fix errors above.")
    } else if (hasWarn) {
      console.log("\nHealth check WARNINGS. Warnings above are non-blocking.")
    } else {
      console.log("\nHealth check PASSED.")
    }
  }
}

async function cmdRun() {
  // Find the run args (-- and everything after)
  const dashIdx = process.argv.indexOf("--")
  const runArgs = dashIdx >= 0 ? process.argv.slice(dashIdx + 1) : []

  // Auto-sync if plugin file missing
  const pluginFile = join(root, ".opencode", "plugin", "bettercode.js")
  if (!existsSync(pluginFile)) {
    if (!flags.json) console.log("Plugin not registered. Running bettercode sync...")
    await cmdSync()
  }

  // Try to find lildax (OpenCode CLI) on PATH
  const lildaxOnPath = spawnSync("lildax", ["--version"], { encoding: "utf8", timeout: 5000 })
  if (lildaxOnPath.status === 0) {
    const result = spawnSync("lildax", runArgs, { stdio: "inherit" })
    process.exit(result.status ?? 1)
  }

  // Try to resolve @opencode-ai/cli from node_modules
  try {
    const require = createRequire(import.meta.url)
    const lildaxCjs = require.resolve("@opencode-ai/cli/bin/lildax.cjs")
    const result = spawnSync(process.execPath, [lildaxCjs, ...runArgs], { stdio: "inherit" })
    process.exit(result.status ?? 1)
  } catch {
    // not found
  }

  // Fallback: try to find it by walking up from root
  let current = root
  for (;;) {
    const candidate = join(current, "node_modules", "@opencode-ai", "cli", "bin", "lildax.cjs")
    if (existsSync(candidate)) {
      const result = spawnSync(process.execPath, [candidate, ...runArgs], { stdio: "inherit" })
      process.exit(result.status ?? 1)
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  console.error("OpenCode CLI not found. Install with: npm install -g @opencode-ai/cli")
  process.exit(1)
}

async function cmdGateRun() {
  const result = await runQualityGate(root)
  if (flags.json) {
    jsonOutput(result)
  } else {
    console.log(`BetterCode quality gate: ${result.status}`)
    console.log(`Score: ${result.score}`)
    console.log(`Risk: ${result.risk}`)
    for (const check of result.checks) {
      const detail = check.status === "SKIPPED" ? ` - ${check.reason}` : ` - ${check.command} (${check.durationMs}ms)`
      console.log(`${check.status} ${check.name}${detail}`)
    }
  }
  process.exit(result.status === "FAIL" ? 1 : 0)
}

async function cmdBrainInit() {
  const created = await brainInit(root)
  if (flags.json) {
    jsonOutput({ status: "ok", created })
  } else {
    if (created.length === 0) {
      console.log("Brain already initialized. No files created.")
    } else {
      console.log("Brain initialized.")
      for (const file of created) console.log(`  Created ${configDir}/brain/${file}`)
    }
  }
}

async function cmdBrainUpdate() {
  const result = await brainUpdate(root)
  if (flags.json) {
    jsonOutput(result)
  } else {
    console.log("Brain updated.")
    console.log(`  Profile: ${result.profileUpdated ? "updated" : "unchanged"}`)
    console.log(`  History: ${result.historyAppended ? "entry appended" : "no entry"}`)
  }
}

async function cmdBrainSearch() {
  const query = command!.slice(2).join(" ")
  const results = brainSearch(root, query)
  if (flags.json) {
    jsonOutput({ query, results })
  } else {
    if (results.length === 0) {
      console.log(`No results for "${query}".`)
    } else {
      console.log(`${results.length} result(s) for "${query}":`)
      for (const r of results) console.log(`  ${r.file}:${r.line} - ${r.content}`)
    }
  }
}

async function cmdSpec() {
  const description = command!.slice(1).join(" ")
  const spec = await generateSpec(root, description)
  jsonOutput(spec)
}

async function cmdBenchmarkRun() {
  const result = await runBenchmark(root)
  if (flags.json) {
    jsonOutput(result)
  } else {
    console.log(`BetterCode benchmark: ${result.name}`)
    console.log(`Score: ${result.score}`)
    console.log(`Duration: ${result.duration_ms}ms`)
    if (result.metadata) {
      for (const [k, v] of Object.entries(result.metadata)) console.log(`  ${k}: ${v}`)
    }
  }
}

async function cmdReport() {
  const report = await generateReport(root)
  if (flags.json) {
    jsonOutput(report)
  } else {
    console.log("BetterCode Report")
    console.log("=".repeat(40))
    console.log(`Status: ${report.gate.status}`)
    console.log(`Score: ${report.gate.score}`)
    console.log(`Risk: ${report.gate.risk}`)
    console.log(`Checks: ${report.gate.checks.length}`)
    console.log(`Warnings: ${report.gate.warnings.length}`)
    console.log(`Brain: ${report.brain.hasProfile ? "populated" : "empty"}`)
    console.log(`History entries: ${report.brain.historyEntries}`)
  }
}

// ── Helpers ──

async function initQualityGateConfig(repoRoot: string) {
  await mkdirAsync(join(repoRoot, configDir), { recursive: true })
  await writeMissing(join(repoRoot, configDir, "quality-gate.json"), `${JSON.stringify(defaultQualityGate, null, 2)}\n`)
}

async function initBetterCode(repoRoot: string) {
  await initQualityGateConfig(repoRoot)
  await brainInit(repoRoot)
}

async function writeMissing(file: string, content: string) {
  if (existsSync(file)) return
  await mkdirAsync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

async function runBenchmark(repoRoot: string) {
  const started = performance.now()
  const gate = await runQualityGate(repoRoot)
  const duration = Math.round(performance.now() - started)

  return {
    id: `bench-${Date.now()}`,
    name: "Quality Gate Benchmark",
    score: gate.score,
    duration_ms: duration,
    metadata: {
      status: gate.status,
      risk: gate.risk,
      checks: gate.checks.length,
      filesChanged: gate.filesChanged,
      diffLines: gate.diffLines,
    },
  }
}

interface Report {
  gate: { status: string; score: number; risk: string; checks: unknown[]; warnings: string[] }
  brain: { hasProfile: boolean; historyEntries: number }
}

async function generateReport(repoRoot: string): Promise<Report> {
  let gate = { status: "UNKNOWN", score: 0, risk: "low", checks: [] as unknown[], warnings: [] as string[] }
  try {
    const result = await runQualityGate(repoRoot)
    gate = { status: result.status, score: result.score, risk: result.risk, checks: result.checks, warnings: result.warnings }
  } catch {
    // ignore
  }

  let hasProfile = false
  let historyEntries = 0
  try {
    const profilePath = join(repoRoot, configDir, "brain", "profile.md")
    hasProfile = existsSync(profilePath)
    const historyPath = join(repoRoot, configDir, "brain", "task-history.jsonl")
    if (existsSync(historyPath)) {
      const content = readFileSync(historyPath, "utf8").trim()
      historyEntries = content ? content.split("\n").length : 0
    }
  } catch {
    // ignore
  }

  return { gate, brain: { hasProfile, historyEntries } }
}

function migrateLegacyConfig(repoRoot: string) {
  const legacyDir = join(repoRoot, ".better-code")
  const newDir = join(repoRoot, configDir)

  const legacyStat = statSafe(legacyDir)
  if (!legacyStat?.isDirectory()) return

  try {
    mkdirSync(newDir, { recursive: true })
    mkdirSync(join(newDir, "brain"), { recursive: true })

    for (const entry of readdirSync(legacyDir)) {
      const src = join(legacyDir, entry)
      const dest = join(newDir, entry)
      const srcStat = statSafe(src)
      if (srcStat?.isFile() && !existsSync(dest)) copyFileSync(src, dest)
    }

    const brainSrc = join(legacyDir, "brain")
    const brainStat = statSafe(brainSrc)
    if (brainStat?.isDirectory()) {
      for (const entry of readdirSync(brainSrc)) {
        const src = join(brainSrc, entry)
        const dest = join(newDir, "brain", entry)
        const srcStat = statSafe(src)
        if (srcStat?.isFile() && !existsSync(dest)) copyFileSync(src, dest)
      }
    }
  } catch {
    // ignore
  }
}

function statSafe(p: string) {
  try { return require("node:fs").statSync(p) } catch { return null }
}

async function findRepoRoot(start: string) {
  const repoRoot = await findRepoRootCandidate(start)
  return repoRoot ?? start
}

async function findRepoRootCandidate(start: string): Promise<string | undefined> {
  if (existsSync(join(start, ".git"))) return start
  const parent = dirname(start)
  if (parent === start || parent === parse(start).root) return undefined
  return findRepoRootCandidate(parent)
}
