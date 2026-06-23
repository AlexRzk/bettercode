import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { analyzeGitDiff } from "@better-code/diff-risk"
import type {
  AvailableCommands,
  PackageManager,
  ProjectCommandName,
  ProjectInfo,
  ProjectType,
  QualityGateScoreInput,
  QualityGateResult,
} from "@better-code/shared"

type ProjectSignal = {
  type: ProjectType
  files: string[]
}

const projectSignals: ProjectSignal[] = [
  { type: "nextjs", files: ["next.config.js", "next.config.ts"] },
  { type: "vite", files: ["vite.config.js", "vite.config.ts"] },
  { type: "node", files: ["package.json"] },
  { type: "python", files: ["pyproject.toml", "requirements.txt"] },
  { type: "rust", files: ["Cargo.toml"] },
  { type: "go", files: ["go.mod"] },
  { type: "solidity-foundry", files: ["foundry.toml"] },
  { type: "solidity-hardhat", files: ["hardhat.config.ts", "hardhat.config.js"] },
]

const commandNames: ProjectCommandName[] = ["lint", "typecheck", "test", "build", "format", "format:check"]
const gateCommandNames: ProjectCommandName[] = ["lint", "typecheck", "test", "build"]
const maxOutputLength = 4000
const defaultRules = {
  failOnBuildError: true,
  failOnTypecheckError: true,
  failOnSecrets: true,
  warnOnMissingTests: true,
  reviewCriticalPath: true,
}
const defaultThresholds = {
  passScore: 90,
  warnScore: 70,
  maxChangedFiles: 12,
  maxDiffLines: 500,
}
const failedCheckPenalty: Partial<Record<ProjectCommandName, number>> = {
  lint: 10,
  typecheck: 25,
  test: 25,
  build: 30,
  format: 5,
}

export function createPlaceholderQualityGateResult(): QualityGateResult {
  return {
    status: "SKIPPED",
    score: 0,
    checks: [],
    warnings: [],
    blockingReasons: [],
    filesChanged: 0,
    diffLines: 0,
  }
}

export function detectPackageManager(rootPath: string): PackageManager {
  if (existsSync(join(rootPath, "pnpm-lock.yaml"))) return "pnpm"
  if (existsSync(join(rootPath, "yarn.lock"))) return "yarn"
  if (existsSync(join(rootPath, "bun.lockb")) || existsSync(join(rootPath, "bun.lock"))) return "bun"
  if (existsSync(join(rootPath, "package-lock.json"))) return "npm"
  return "npm"
}

export function detectAvailableCommands(rootPath: string): AvailableCommands {
  const packageJson = readPackageJson(rootPath)
  if (!packageJson?.scripts || typeof packageJson.scripts !== "object") return {}

  const scripts = packageJson.scripts
  const packageManager = detectPackageManager(rootPath)

  return Object.fromEntries(
    commandNames
      .filter((name) => typeof scripts[name] === "string")
      .map((name) => [
        name,
        {
          name,
          command: formatScriptCommand(packageManager, name),
          available: true,
        },
      ]),
  )
}

export function detectProject(rootPath: string): ProjectInfo {
  const match = projectSignals
    .map((signal) => ({
      type: signal.type,
      signals: signal.files.filter((file) => existsSync(join(rootPath, file))),
    }))
    .find((signal) => signal.signals.length > 0)

  return {
    type: match?.type ?? "unknown",
    rootPath,
    signals: match?.signals ?? [],
  }
}

export async function runQualityGate(rootPath: string): Promise<QualityGateResult> {
  const commands = detectAvailableCommands(rootPath)
  const diff = await analyzeGitDiff(rootPath)
  const checks = []
  for (const name of gateCommandNames) {
    const command = commands[name]?.command
    if (!command) {
      checks.push({
        name,
        status: "SKIPPED" as const,
        durationMs: 0,
        reason: `No ${name} script found`,
      })
      continue
    }

    const result = await runShellCommand(rootPath, command)
    checks.push({
      name,
      status: result.exitCode === 0 ? ("PASS" as const) : ("FAIL" as const),
      command,
      output: result.output,
      durationMs: result.durationMs,
    })
  }
  return scoreQualityGate({
    checks,
    warnings: diff.warnings,
    filesChanged: diff.filesChanged,
    diffLines: diff.diffLines,
  })
}

export function scoreQualityGate(input: QualityGateScoreInput): QualityGateResult {
  const rules = { ...defaultRules, ...input.rules }
  const thresholds = { ...defaultThresholds, ...input.thresholds }
  const blockingReasons = []
  const warnings = [...(input.warnings ?? [])]
  const failedChecks = input.checks.filter((check) => check.status === "FAIL")
  const skippedTests = input.checks.some((check) => check.name === "test" && check.status === "SKIPPED")
  const failedTypecheck = failedChecks.some((check) => check.name === "typecheck")
  const failedBuild = failedChecks.some((check) => check.name === "build")

  if (input.secretDetected && rules.failOnSecrets) blockingReasons.push("secret detected")
  if (failedBuild && rules.failOnBuildError) blockingReasons.push("build failed")
  if (failedTypecheck && rules.failOnTypecheckError) blockingReasons.push("typecheck failed")
  if (skippedTests && rules.warnOnMissingTests) warnings.push("No test script found")

  const penalty = failedChecks.reduce((total, check) => total + (failedCheckPenalty[check.name as ProjectCommandName] ?? 0), 0)
  const missingTestPenalty = skippedTests && rules.warnOnMissingTests ? 5 : 0
  const changedFilesPenalty = input.filesChanged > thresholds.maxChangedFiles ? 10 : 0
  const diffLinesPenalty = input.diffLines > thresholds.maxDiffLines ? 10 : 0
  const score = input.secretDetected ? 0 : Math.max(0, 100 - penalty - missingTestPenalty - changedFilesPenalty - diffLinesPenalty)
  const status =
    score < thresholds.warnScore || blockingReasons.length > 0
      ? "FAIL"
      : score < thresholds.passScore || warnings.length > 0
        ? "WARN"
        : "PASS"

  return {
    status,
    score,
    checks: input.checks,
    warnings,
    blockingReasons,
    filesChanged: input.filesChanged,
    diffLines: input.diffLines,
  }
}

function readPackageJson(rootPath: string): { scripts?: Record<string, unknown> } | undefined {
  if (!existsSync(join(rootPath, "package.json"))) return undefined
  try {
    return JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"))
  } catch {
    return undefined
  }
}

function formatScriptCommand(packageManager: PackageManager, name: ProjectCommandName) {
  if (packageManager === "npm") return `npm run ${name}`
  if (packageManager === "pnpm") return `pnpm ${name}`
  if (packageManager === "yarn") return `yarn ${name}`
  return `bun run ${name}`
}

async function runShellCommand(rootPath: string, command: string) {
  const started = performance.now()
  try {
    const child = Bun.spawn(shellCommandArgs(command), {
      cwd: rootPath,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])

    return {
      exitCode,
      output: trimOutput(`${stdout}${stderr ? `\n${stderr}` : ""}`),
      durationMs: Math.round(performance.now() - started),
    }
  } catch (error) {
    return {
      exitCode: 1,
      output: error instanceof Error ? error.message : "Command failed before producing output.",
      durationMs: Math.round(performance.now() - started),
    }
  }
}

function shellCommandArgs(command: string) {
  if (process.platform === "win32") return ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command]
  return ["sh", "-c", command]
}

function trimOutput(output: string) {
  const normalized = output.trim()
  if (normalized.length <= maxOutputLength) return normalized
  return `${normalized.slice(0, maxOutputLength)}\n[output truncated]`
}
