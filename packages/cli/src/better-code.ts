#!/usr/bin/env bun

import { mkdir, stat } from "node:fs/promises"
import { dirname, join, parse } from "node:path"
import { runQualityGate } from "@better-code/quality-gate"
import { brainInit, brainUpdate, brainSearch } from "@better-code/project-brain"

type PlaceholderCommand = {
  path: string[]
  description: string
}

const defaultQualityGate = {
  project: {
    type: "auto",
    packageManager: "auto",
  },
  commands: {
    lint: "auto",
    typecheck: "auto",
    test: "auto",
    build: "auto",
  },
  thresholds: {
    passScore: 90,
    warnScore: 70,
    maxChangedFiles: 12,
    maxDiffLines: 500,
  },
  rules: {
    failOnBuildError: true,
    failOnTypecheckError: true,
    failOnSecrets: true,
    warnOnMissingTests: true,
    reviewCriticalPath: true,
  },
  criticalPaths: ["src/auth/**", "src/middleware.ts", "src/app/api/**", "prisma/migrations/**"],
}

const commands: PlaceholderCommand[] = [
  { path: ["init"], description: "Initialize Better Code configuration." },
  { path: ["gate", "run"], description: "Run adaptive quality gates." },
  { path: ["brain", "init"], description: "Initialize the project brain." },
  { path: ["brain", "update"], description: "Update the project brain profile." },
  { path: ["brain", "search", "<query>"], description: "Search the project brain by keyword." },
  { path: ["benchmark", "run"], description: "Run comparative benchmarks." },
  { path: ["report"], description: "Generate a Better Code report." },
]

const args = process.argv.slice(2)

if (args.length === 0) {
  printHelp()
  process.exit(0)
}

const root = await findRepoRoot(process.cwd())

if (args[0] === "init") {
  await initBetterCode(root)
  process.exit(0)
}

if (args[0] === "gate" && args[1] === "run") {
  const result = await runQualityGate(root)
  console.log(`Better Code quality gate: ${result.status}`)
  console.log(`Score: ${result.score}`)
  console.log(`Risk: ${result.risk}`)
  for (const check of result.checks) {
    const detail = check.status === "SKIPPED" ? ` - ${check.reason}` : ` - ${check.command} (${check.durationMs}ms)`
    console.log(`${check.status} ${check.name}${detail}`)
  }
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.status === "FAIL" ? 1 : 0)
}

if (args[0] === "brain" && args[1] === "init") {
  const created = await brainInit(root)
  if (created.length === 0) {
    console.log("Brain already initialized. No files created.")
  } else {
    console.log("Brain initialized.")
    for (const file of created) console.log(`  Created .better-code/brain/${file}`)
  }
  process.exit(0)
}

if (args[0] === "brain" && args[1] === "update") {
  const result = await brainUpdate(root)
  console.log("Brain updated.")
  console.log(`  Profile: ${result.profileUpdated ? "updated" : "unchanged"}`)
  console.log(`  History: ${result.historyAppended ? "entry appended" : "no entry"}`)
  process.exit(0)
}

if (args[0] === "brain" && args[1] === "search" && args.length >= 3) {
  const query = args.slice(2).join(" ")
  const results = brainSearch(root, query)
  if (results.length === 0) {
    console.log(`No results for "${query}".`)
  } else {
    console.log(`${results.length} result(s) for "${query}":`)
    for (const r of results) {
      console.log(`  ${r.file}:${r.line} - ${r.content}`)
    }
  }
  process.exit(0)
}

printHelp()
process.exit(1)

function printHelp() {
  console.log("better-code")
  console.log("")
  console.log("Available commands:")
  for (const item of commands) console.log(`  better-code ${item.path.join(" ")} - ${item.description}`)
}

async function initBetterCode(repoRoot: string) {
  await mkdir(join(repoRoot, ".better-code", "brain"), { recursive: true })
  await writeMissing(join(repoRoot, ".better-code", "quality-gate.json"), `${JSON.stringify(defaultQualityGate, null, 2)}\n`)
  await writeMissing(join(repoRoot, ".better-code", "brain", "profile.md"), "# Project Profile\n\n")
  await writeMissing(join(repoRoot, ".better-code", "brain", "commands.md"), "# Commands\n\n")
  await writeMissing(join(repoRoot, ".better-code", "brain", "architecture.md"), "# Architecture\n\n")
  await writeMissing(join(repoRoot, ".better-code", "brain", "known-errors.md"), "# Known Errors\n\n")
  await writeMissing(join(repoRoot, ".better-code", "brain", "quality-rules.md"), "# Quality Rules\n\n")
  await writeMissing(join(repoRoot, ".better-code", "brain", "task-history.jsonl"), "")

  console.log("Better Code initialized.")
  console.log("Created .better-code/quality-gate.json")
  console.log("Created .better-code/brain/")
}

async function writeMissing(file: string, content: string) {
  if (await Bun.file(file).exists()) return
  await Bun.write(file, content)
}

async function findRepoRoot(start: string) {
  const repoRoot = await findRepoRootCandidate(start)
  return repoRoot ?? start
}

async function findRepoRootCandidate(start: string): Promise<string | undefined> {
  if (await pathExists(join(start, ".git"))) return start
  const parent = dirname(start)
  if (parent === start || parent === parse(start).root) return undefined
  return findRepoRootCandidate(parent)
}

async function pathExists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  )
}
