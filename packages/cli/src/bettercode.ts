#!/usr/bin/env bun

import { mkdir as mkdirAsync, stat } from "node:fs/promises"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join, parse } from "node:path"
import { runQualityGate } from "@bettercode/quality-gate"
import { brainInit, brainUpdate, brainSearch } from "@bettercode/project-brain"
import { generateSpec } from "./spec"

const configDir = ".bettercode"

const defaultQualityGate = {
  project: { type: "auto", packageManager: "auto" },
  commands: { lint: "auto", typecheck: "auto", test: "auto", build: "auto" },
  thresholds: { passScore: 90, warnScore: 70, maxChangedFiles: 12, maxDiffLines: 500 },
  rules: { failOnBuildError: true, failOnTypecheckError: true, failOnSecrets: true, warnOnMissingTests: true, reviewCriticalPath: true },
  criticalPaths: ["src/auth/**", "src/middleware.ts", "src/app/api/**", "prisma/migrations/**"],
}

const flags = parseFlags(process.argv.slice(2))
const root = flags.root ? resolveRoot(flags.root) : await findRepoRoot(process.cwd())
migrateLegacyConfig(root)

const command = flags.positional

if (!command) { printHelp(); process.exit(0) }

if (command[0] === "init") { await cmdInit(); process.exit(0) }
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
    if (argv[i] === "--root" && argv[i + 1]) { parsed.root = argv[i + 1]; i += 2; continue }
    positional.push(argv[i]); i++
  }
  return { json: !!parsed.json, root: typeof parsed.root === "string" ? parsed.root : undefined, positional }
}

function resolveRoot(p: string) {
  if (existsSync(join(p, ".git"))) return p
  return p
}

function jsonOutput(data: unknown) {
  console.log(JSON.stringify(data, null, 2))
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
  console.log("  init                       Initialize BetterCode configuration")
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

async function initBetterCode(repoRoot: string) {
  await mkdirAsync(join(repoRoot, configDir, "brain"), { recursive: true })
  await writeMissing(join(repoRoot, configDir, "quality-gate.json"), `${JSON.stringify(defaultQualityGate, null, 2)}\n`)
  await writeMissing(join(repoRoot, configDir, "brain", "profile.md"), "# Project Profile\n\n")
  await writeMissing(join(repoRoot, configDir, "brain", "commands.md"), "# Commands\n\n")
  await writeMissing(join(repoRoot, configDir, "brain", "architecture.md"), "# Architecture\n\n")
  await writeMissing(join(repoRoot, configDir, "brain", "known-errors.md"), "# Known Errors\n\n")
  await writeMissing(join(repoRoot, configDir, "brain", "quality-rules.md"), "# Quality Rules\n\n")
  await writeMissing(join(repoRoot, configDir, "brain", "task-history.jsonl"), "")
}

async function writeMissing(file: string, content: string) {
  if (await Bun.file(file).exists()) return
  await Bun.write(file, content)
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
    const { readdirSync, copyFileSync, mkdirSync } = require("node:fs")
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
