import { existsSync, readFileSync, writeFileSync, renameSync, cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { spawnSync } from "node:child_process"
import os from "node:os"
import type { BenchmarkTask, TaskRunResult, RunStats, TaskComparison, BenchmarkSuiteResult, TaskArtifacts } from "./benchmark-types"
import { parseOpenCodeOutput, findSessionID } from "./benchmark-parser"
import { scoreRun } from "./benchmark-scorer"
import { runValidationCommands } from "./benchmark-validate"
import { generateBenchmarkReport } from "./benchmark-report"

const BENCHMARKS_DIR = join(import.meta.dir, "..", "benchmarks")
const FIXTURES_DIR = join(BENCHMARKS_DIR, "fixtures")

// ── Helpers ──

function getChangedFiles(root: string): string[] {
  try {
    const result = spawnSync("git", ["diff", "--name-only"], { cwd: root, encoding: "utf8", timeout: 5000 })
    if (result.status !== 0) return []
    return result.stdout.split("\n").map((l) => l.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function collectFilesFromEvents(events: ReturnType<typeof parseOpenCodeOutput>): string[] {
  const files = new Set<string>()
  for (const args of events.toolCallArgs) {
    if (args && typeof args === "object") {
      const a = args as Record<string, unknown>
      if (typeof a.filePath === "string") files.add(a.filePath)
      if (typeof a.path === "string") files.add(a.path)
      if (typeof a.file === "string") files.add(a.file)
    }
  }
  return [...files]
}

function queryDbViaBun(dbPath: string, sessionID: string): RunStats {
  const script = `
    import { Database } from "bun:sqlite"
    const db = new Database(${JSON.stringify(dbPath)})
    const row = db.query("SELECT tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, cost FROM session WHERE id = ?").get(${JSON.stringify(sessionID)})
    console.log(JSON.stringify(row || {}))
    db.close()
  `
  const child = spawnSync("bun", ["-e", script], { encoding: "utf8" })
  if (child.status !== 0) {
    throw new Error(`Failed to query database: ${child.stderr}`)
  }

  try {
    const row = JSON.parse(child.stdout.trim())
    return {
      inputTokens: row.tokens_input || 0,
      outputTokens: row.tokens_output || 0,
      cost: row.cost || 0,
      durationMs: 0,
      toolCalls: 0,
      subagents: 0,
      filesRead: [],
      filesChanged: [],
    }
  } catch (e: any) {
    throw new Error(`Failed to parse DB query output: ${e.message}`)
  }
}

function findDatabasePath(): string {
  const home = os.homedir()
  const xdgLocal = join(home, ".local", "share", "opencode")
  if (existsSync(xdgLocal)) {
    const devDb = join(xdgLocal, "opencode-local.db")
    if (existsSync(devDb)) return devDb
    const prodDb = join(xdgLocal, "opencode.db")
    if (existsSync(prodDb)) return prodDb
  }

  let dataDir = ""
  if (process.platform === "win32") {
    dataDir = join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "opencode")
  } else if (process.platform === "darwin") {
    dataDir = join(home, "Library", "Application Support", "opencode")
  } else {
    dataDir = join(home, ".local", "share", "opencode")
  }

  const devDb = join(dataDir, "opencode-local.db")
  if (existsSync(devDb)) return devDb
  return join(dataDir, "opencode.db")
}

function getOpencodeCommand(root: string): { cmd: string; args: string[] } {
  const devOpencodeDir = join(root, "packages", "opencode")
  if (existsSync(join(devOpencodeDir, "src", "index.ts"))) {
    return {
      cmd: "bun",
      args: ["run", "--cwd", devOpencodeDir, "--conditions=browser", "src/index.ts"],
    }
  }

  const lildaxOnPath = spawnSync("lildax", ["--version"], { encoding: "utf8", timeout: 5000 })
  if (lildaxOnPath.status === 0) {
    return { cmd: "lildax", args: [] }
  }

  const candidate = join(root, "node_modules", "@opencode-ai", "cli", "bin", "lildax.cjs")
  if (existsSync(candidate)) {
    return { cmd: process.execPath, args: [candidate] }
  }

  throw new Error("OpenCode CLI not found. Run 'npm install -g @opencode-ai/cli' first.")
}

// ── Workspace Isolation ──

function createIsolatedWorkspace(fixtureDir: string, label: string, runDir: string): string {
  const workspace = join(runDir, `${label}-workspace`)
  mkdirSync(workspace, { recursive: true })

  cpSync(fixtureDir, workspace, { recursive: true })

  return workspace
}

function disableBetterCodeInWorkspace(workspace: string) {
  const pluginDir = join(workspace, ".opencode", "plugin")
  const configFile = join(workspace, ".opencode", "opencode.jsonc")
  const pluginFile = join(pluginDir, "bettercode.js")

  if (existsSync(pluginFile)) {
    renameSync(pluginFile, join(pluginDir, "bettercode.js.disabled"))
  }
  if (existsSync(configFile)) {
    const content = readFileSync(configFile, "utf8")
    writeFileSync(configFile, content.replace(/"bettercode"/g, '"bettercode_disabled"'))
  }
}

function enableBetterCodeInWorkspace(workspace: string) {
  const pluginDir = join(workspace, ".opencode", "plugin")
  const configFile = join(workspace, ".opencode", "opencode.jsonc")
  const pluginDisabled = join(pluginDir, "bettercode.js.disabled")

  if (existsSync(pluginDisabled)) {
    renameSync(pluginDisabled, join(pluginDir, "bettercode.js"))
  }
  if (existsSync(configFile)) {
    const content = readFileSync(configFile, "utf8")
    writeFileSync(configFile, content.replace(/"bettercode_disabled"/g, '"bettercode"'))
  }
}

function initGitInWorkspace(workspace: string) {
  spawnSync("git", ["init"], { cwd: workspace, encoding: "utf8", timeout: 5000 })
  spawnSync("git", ["add", "."], { cwd: workspace, encoding: "utf8", timeout: 5000 })
  spawnSync("git", ["commit", "-m", "initial"], { cwd: workspace, encoding: "utf8", timeout: 5000 })
}

// ── Fixture Loading ──

function loadFixtureTasks(): BenchmarkTask[] {
  const tasksFile = join(BENCHMARKS_DIR, "tasks.json")
  if (!existsSync(tasksFile)) return []
  try {
    return JSON.parse(readFileSync(tasksFile, "utf8")) as BenchmarkTask[]
  } catch {
    return []
  }
}

function resolveFixtureDir(task: BenchmarkTask): string | null {
  if (!task.fixture) return null
  const fixtureDir = join(FIXTURES_DIR, task.fixture)
  return existsSync(fixtureDir) ? fixtureDir : null
}

function runSetupCommands(workspace: string, commands: string[]) {
  for (const command of commands) {
    spawnSync("sh", ["-c", command], { cwd: workspace, encoding: "utf8", timeout: 60000, stdio: "pipe" })
  }
}

// ── Single Variant Run ──

function runSingleVariant(
  cmd: string,
  args: string[],
  workspace: string,
  prompt: string,
  extraArgs: string[],
  timeoutMs: number,
): { stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number } {
  const started = performance.now()
  const child = spawnSync(cmd, [...args, "run", "--format", "json", "--dangerously-skip-permissions", ...extraArgs, prompt], {
    cwd: workspace,
    encoding: "utf8",
    timeout: timeoutMs,
  })
  const durationMs = Math.round(performance.now() - started)

  const timedOut = child.status === null || (child.error != null && (child.error as NodeJS.ErrnoException).code === "ETIMEDOUT")
  return {
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? "",
    exitCode: child.status ?? 1,
    timedOut,
    durationMs,
  }
}

// ── Main ──

export async function runBenchmark(repoRoot: string, extraArgs: string[] = []) {
  if (process.env.BUN_ENV === "test" || process.env.NODE_ENV === "test") {
    return {
      score: 25,
      duration_ms: 1200,
      name: "Comparison Benchmark Suite (Mocked)",
      metadata: {
        tasksRun: 7,
        passRateBaseline: "0.0%",
        passRateBetterCode: "0.0%",
        avgScoreBaseline: 0,
        avgScoreBetterCode: 0,
        netTokenSavings: "0",
        totalBaselineTokens: 0,
        totalBettercodeTokens: 0,
        totalBaselineCost: 0,
        totalBettercodeCost: 0,
        timeoutCountBaseline: 0,
        timeoutCountBettercode: 0,
        errorCountBaseline: 0,
        errorCountBettercode: 0,
        netCostSavings: "$0.0000",
      },
    }
  }

  const bunCheck = spawnSync("bun", ["--version"], { encoding: "utf8" })
  if (bunCheck.status !== 0) {
    throw new Error("Bun is required to run benchmarks.")
  }

  const dbPath = findDatabasePath()
  if (!existsSync(dbPath)) {
    throw new Error(`OpenCode database not found. Run opencode at least once. (Searched: ${dbPath})`)
  }

  // Load tasks: custom file first, then fixture tasks
  const customTasksFile = join(repoRoot, ".bettercode", "tasks.json")
  let tasks: BenchmarkTask[]
  if (existsSync(customTasksFile)) {
    tasks = JSON.parse(readFileSync(customTasksFile, "utf8")) as BenchmarkTask[]
  } else {
    tasks = loadFixtureTasks()
  }

  const comparisons: TaskComparison[] = []
  const runDir = join(repoRoot, ".bettercode", "benchmark-runs", new Date().toISOString().replace(/[:.]/g, "-"))
  mkdirSync(join(runDir, "baseline"), { recursive: true })
  mkdirSync(join(runDir, "bettercode"), { recursive: true })

  const { cmd, args } = getOpencodeCommand(repoRoot)
  const defaultTimeout = 300_000

  console.log(`Running benchmark suite containing ${tasks.length} tasks...`)
  console.log(`Using OpenCode: ${cmd} ${args.join(" ")}`)
  if (extraArgs.length > 0) {
    console.log(`Forwarding OpenCode flags: ${extraArgs.join(" ")}`)
  }
  console.log(`Database path: ${dbPath}`)
  console.log(`Artifacts: ${runDir}\n`)

  const baselineResults: TaskRunResult[] = []
  const bettercodeResults: TaskRunResult[] = []

  for (const task of tasks) {
    const timeoutMs = task.timeoutMs ?? defaultTimeout
    const fixtureDir = resolveFixtureDir(task)
    console.log(`[Task: ${task.id}] (${task.category})${fixtureDir ? ` [fixture: ${task.fixture}]` : ""}`)
    console.log(`  Prompt: ${task.prompt}`)

    // ── 1. Baseline Run ──
    console.log("  Running Baseline (OpenCode alone)...")
    let baselineResult: TaskRunResult
    const baselineDir = join(runDir, "baseline", task.id)
    mkdirSync(baselineDir, { recursive: true })

    try {
      let workspace: string
      if (fixtureDir) {
        workspace = createIsolatedWorkspace(fixtureDir, "baseline", baselineDir)
        initGitInWorkspace(workspace)
        disableBetterCodeInWorkspace(workspace)
      } else {
        workspace = repoRoot
      }

      if (task.setupCommands) {
        runSetupCommands(workspace, task.setupCommands)
      }

      const baselineFilesBefore = getChangedFiles(workspace)
      const run = runSingleVariant(cmd, args, workspace, task.prompt, extraArgs, timeoutMs)
      writeFileSync(join(baselineDir, "stdout.txt"), run.stdout)
      writeFileSync(join(baselineDir, "stderr.txt"), run.stderr)

      const events = parseOpenCodeOutput(run.stdout)
      const sessionID = events.sessionID ?? findSessionID(run.stdout)

      const dbStats = sessionID ? queryDbViaBun(dbPath, sessionID) : makeEmptyStats()
      const filesRead = collectFilesFromEvents(events)
      const baselineFilesAfter = getChangedFiles(workspace)
      const filesChanged = baselineFilesAfter.filter((f) => !baselineFilesBefore.includes(f))

      const stats: RunStats = {
        ...dbStats,
        durationMs: run.durationMs,
        toolCalls: events.toolCallNames.length,
        subagents: events.subagentLaunches,
        filesRead,
        filesChanged,
      }

      baselineResult = scoreRun({ task, events, stats, exitedNormally: run.exitCode === 0, timedOut: run.timedOut })
      baselineResult.variant = "baseline"
      baselineResult.artifacts = { stdout: run.stdout, stderr: run.stderr }
      writeFileSync(join(baselineDir, "result.json"), JSON.stringify(baselineResult, null, 2))

      // Run validation commands
      if (task.expected?.commandsPass && baselineResult.status !== "TIMEOUT" && baselineResult.status !== "ERROR") {
        const validationCwd = task.validationCwd ? join(workspace, task.validationCwd) : workspace
        const validations = runValidationCommands(validationCwd, task.expected.commandsPass)
        baselineResult.artifacts.validation = validations[0]
        for (const v of validations) {
          if (!v.passed) {
            baselineResult.score -= 40
            baselineResult.reasons.push(`Validation failed: ${v.command} (exit ${v.exitCode})`)
            if (v.output) baselineResult.reasons.push(v.output.slice(0, 200))
          }
        }
        baselineResult.score = Math.max(0, baselineResult.score)
        baselineResult.status = baselineResult.score >= 90 ? "PASS" : "FAIL"
      }
    } catch (err: any) {
      baselineResult = {
        taskId: task.id,
        variant: "baseline",
        status: "ERROR",
        score: 0,
        reasons: [err.message],
        stats: makeEmptyStats(),
        events: { assistantText: "", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
      }
    }

    console.log(`    Status: ${baselineResult.status} | Score: ${baselineResult.score} | Tokens: ${baselineResult.stats.inputTokens} in / ${baselineResult.stats.outputTokens} out | Cost: $${baselineResult.stats.cost.toFixed(4)}`)
    baselineResults.push(baselineResult)

    // ── 2. BetterCode Run ──
    console.log("  Running BetterCode (OpenCode + Plugin)...")
    const bettercodeDir = join(runDir, "bettercode", task.id)
    mkdirSync(bettercodeDir, { recursive: true })

    let bettercodeResult: TaskRunResult
    try {
      let workspace: string
      if (fixtureDir) {
        workspace = createIsolatedWorkspace(fixtureDir, "bettercode", bettercodeDir)
        initGitInWorkspace(workspace)
        enableBetterCodeInWorkspace(workspace)
      } else {
        workspace = repoRoot
      }

      if (task.setupCommands) {
        runSetupCommands(workspace, task.setupCommands)
      }

      const bettercodeFilesBefore = getChangedFiles(workspace)
      const run = runSingleVariant(cmd, args, workspace, task.prompt, extraArgs, timeoutMs)
      writeFileSync(join(bettercodeDir, "stdout.txt"), run.stdout)
      writeFileSync(join(bettercodeDir, "stderr.txt"), run.stderr)

      const events = parseOpenCodeOutput(run.stdout)
      const sessionID = events.sessionID ?? findSessionID(run.stdout)

      const dbStats = sessionID ? queryDbViaBun(dbPath, sessionID) : makeEmptyStats()
      const filesRead = collectFilesFromEvents(events)
      const bettercodeFilesAfter = getChangedFiles(workspace)
      const filesChanged = bettercodeFilesAfter.filter((f) => !bettercodeFilesBefore.includes(f))

      const stats: RunStats = {
        ...dbStats,
        durationMs: run.durationMs,
        toolCalls: events.toolCallNames.length,
        subagents: events.subagentLaunches,
        filesRead,
        filesChanged,
      }

      bettercodeResult = scoreRun({ task, events, stats, exitedNormally: run.exitCode === 0, timedOut: run.timedOut })
      bettercodeResult.variant = "bettercode"
      bettercodeResult.artifacts = { stdout: run.stdout, stderr: run.stderr }
      writeFileSync(join(bettercodeDir, "result.json"), JSON.stringify(bettercodeResult, null, 2))

      // Run validation commands
      if (task.expected?.commandsPass && bettercodeResult.status !== "TIMEOUT" && bettercodeResult.status !== "ERROR") {
        const validationCwd = task.validationCwd ? join(workspace, task.validationCwd) : workspace
        const validations = runValidationCommands(validationCwd, task.expected.commandsPass)
        bettercodeResult.artifacts.validation = validations[0]
        for (const v of validations) {
          if (!v.passed) {
            bettercodeResult.score -= 40
            bettercodeResult.reasons.push(`Validation failed: ${v.command} (exit ${v.exitCode})`)
            if (v.output) bettercodeResult.reasons.push(v.output.slice(0, 200))
          }
        }
        bettercodeResult.score = Math.max(0, bettercodeResult.score)
        bettercodeResult.status = bettercodeResult.score >= 90 ? "PASS" : "FAIL"
      }
    } catch (err: any) {
      bettercodeResult = {
        taskId: task.id,
        variant: "bettercode",
        status: "ERROR",
        score: 0,
        reasons: [err.message],
        stats: makeEmptyStats(),
        events: { assistantText: "", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
      }
    }

    console.log(`    Status: ${bettercodeResult.status} | Score: ${bettercodeResult.score} | Tokens: ${bettercodeResult.stats.inputTokens} in / ${bettercodeResult.stats.outputTokens} out | Cost: $${bettercodeResult.stats.cost.toFixed(4)}`)
    bettercodeResults.push(bettercodeResult)

    comparisons.push({ task, baseline: baselineResult, bettercode: bettercodeResult })
    console.log("")
  }

  // ── 3. Generate Report ──
  const totalBaselineTokens = baselineResults.reduce((sum, r) => sum + r.stats.inputTokens + r.stats.outputTokens, 0)
  const totalBettercodeTokens = bettercodeResults.reduce((sum, r) => sum + r.stats.inputTokens + r.stats.outputTokens, 0)
  const totalBaselineCost = baselineResults.reduce((sum, r) => sum + r.stats.cost, 0)
  const totalBettercodeCost = bettercodeResults.reduce((sum, r) => sum + r.stats.cost, 0)

  const passCountBaseline = baselineResults.filter((r) => r.status === "PASS").length
  const passCountBettercode = bettercodeResults.filter((r) => r.status === "PASS").length
  const passRateBaseline = tasks.length > 0 ? ((passCountBaseline / tasks.length) * 100).toFixed(1) + "%" : "0.0%"
  const passRateBettercode = tasks.length > 0 ? ((passCountBettercode / tasks.length) * 100).toFixed(1) + "%" : "0.0%"

  const avgScoreBaseline = tasks.length > 0 ? Math.round(baselineResults.reduce((sum, r) => sum + r.score, 0) / tasks.length) : 0
  const avgScoreBettercode = tasks.length > 0 ? Math.round(bettercodeResults.reduce((sum, r) => sum + r.score, 0) / tasks.length) : 0

  const timeoutCountBaseline = baselineResults.filter((r) => r.status === "TIMEOUT").length
  const timeoutCountBettercode = bettercodeResults.filter((r) => r.status === "TIMEOUT").length
  const errorCountBaseline = baselineResults.filter((r) => r.status === "ERROR").length
  const errorCountBettercode = bettercodeResults.filter((r) => r.status === "ERROR").length

  const netSavings = totalBaselineTokens - totalBettercodeTokens
  const netSavingsPercent = totalBaselineTokens > 0 ? (netSavings / totalBaselineTokens) * 100 : 0

  const suiteResult: BenchmarkSuiteResult = {
    name: "Comparison Benchmark Suite",
    score: Math.round(avgScoreBettercode),
    duration_ms: baselineResults.reduce((sum, r) => sum + r.stats.durationMs, 0) + bettercodeResults.reduce((sum, r) => sum + r.stats.durationMs, 0),
    metadata: {
      tasksRun: tasks.length,
      passRateBaseline,
      passRateBetterCode: passRateBettercode,
      avgScoreBaseline,
      avgScoreBetterCode: avgScoreBettercode,
      totalBaselineTokens,
      totalBettercodeTokens,
      netTokenSavings: `${netSavingsPercent.toFixed(1)}%`,
      totalBaselineCost,
      totalBettercodeCost,
      timeoutCountBaseline,
      timeoutCountBettercode,
      errorCountBaseline,
      errorCountBettercode,
    },
    comparisons,
  }

  const report = generateBenchmarkReport(suiteResult)
  const reportPath = join(repoRoot, "docs", "benchmark-report.md")
  writeFileSync(reportPath, report)
  writeFileSync(join(runDir, "suite-result.json"), JSON.stringify(suiteResult, null, 2))

  // Cleanup isolated workspaces to save disk space
  for (const comp of comparisons) {
    const baselineWs = join(runDir, "baseline", comp.task.id, "baseline-workspace")
    const bettercodeWs = join(runDir, "bettercode", comp.task.id, "bettercode-workspace")
    if (existsSync(baselineWs)) rmSync(baselineWs, { recursive: true, force: true })
    if (existsSync(bettercodeWs)) rmSync(bettercodeWs, { recursive: true, force: true })
  }

  console.log(`\nBenchmark complete!`)
  console.log(`  Report: ${reportPath}`)
  console.log(`  Artifacts: ${runDir}`)
  console.log(`  Baseline pass rate: ${passRateBaseline} | BetterCode pass rate: ${passRateBettercode}`)
  console.log(`  Avg score: Baseline ${avgScoreBaseline} | BetterCode ${avgScoreBettercode}`)

  return {
    score: Math.round(avgScoreBettercode),
    duration_ms: suiteResult.duration_ms,
    name: suiteResult.name,
    metadata: suiteResult.metadata,
  }
}

function makeEmptyStats(): RunStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    durationMs: 0,
    toolCalls: 0,
    subagents: 0,
    filesRead: [],
    filesChanged: [],
  }
}
