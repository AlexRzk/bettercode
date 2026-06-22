#!/usr/bin/env bun

import { mkdir, stat } from "node:fs/promises"
import { dirname, join, parse } from "node:path"

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
  { path: ["benchmark", "run"], description: "Run comparative benchmarks." },
  { path: ["report"], description: "Generate a Better Code report." },
]

const args = process.argv.slice(2)
const command = commands.find((item) => item.path.length === args.length && item.path.every((part, index) => part === args[index]))

if (!command) {
  console.log("better-code")
  console.log("")
  console.log("Available commands:")
  for (const item of commands) console.log(`  better-code ${item.path.join(" ")} - ${item.description}`)
  process.exit(args.length === 0 ? 0 : 1)
}

if (command.path[0] === "init") {
  await initBetterCode(process.cwd())
  process.exit(0)
}

console.log(`better-code ${command.path.join(" ")}`)
console.log(`${command.description} Placeholder command is ready.`)

async function initBetterCode(root: string) {
  const repoRoot = await findRepoRoot(root)

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
