import { existsSync, readFileSync, writeFileSync, renameSync, cpSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { spawnSync } from "node:child_process"
import os from "node:os"
import type { BenchmarkTask, TaskRunResult, RunStats, TaskComparison, BenchmarkSuiteResult } from "./benchmark-types"
import { parseOpenCodeOutput, findSessionID } from "./benchmark-parser"
import { scoreRun } from "./benchmark-scorer"
import { runValidationCommands } from "./benchmark-validate"
import { generateBenchmarkReport } from "./benchmark-report"

// Spawns a separate bun process to query the SQLite DB using bun:sqlite
// to avoid bundling errors under Node runtime.
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

const defaultTasks: BenchmarkTask[] = [
  {
    id: "project-summary",
    category: "knowledge",
    prompt: "Summarize the bettercode project in 2 sentences. Focus on what it adds to OpenCode.",
    expected: {
      contains: ["OpenCode", "plugin"],
      maxToolCalls: 5,
      maxSubagents: 0,
    },
  },
  {
    id: "known-error-recall",
    category: "debugging",
    prompt: "If OpenCode plugin tools are not loading, what is the most likely cause related to symlinks?",
    expected: {
      contains: ["symlink"],
      maxToolCalls: 3,
      maxSubagents: 0,
    },
  },
  {
    id: "quality-gate-explain",
    category: "understanding",
    prompt: "Explain what the BetterCode quality gate command 'gate run' does and what it returns.",
    expected: {
      contains: ["lint", "typecheck", "test", "build"],
      maxSubagents: 0,
    },
  },
]

function runSingleVariant(
  cmd: string,
  args: string[],
  repoRoot: string,
  prompt: string,
  extraArgs: string[],
  timeoutMs: number,
): { stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number } {
  const started = performance.now()
  const child = spawnSync(cmd, [...args, "run", "--format", "json", "--dangerously-skip-permissions", ...extraArgs, prompt], {
    cwd: repoRoot,
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

export async function runBenchmark(repoRoot: string, extraArgs: string[] = []) {
  if (process.env.BUN_ENV === "test" || process.env.NODE_ENV === "test") {
    return {
      score: 25,
      duration_ms: 1200,
      name: "Comparison Benchmark Suite (Mocked)",
      metadata: {
        tasksRun: 3,
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

  const customTasksFile = join(repoRoot, ".bettercode", "tasks.json")
  const tasks = existsSync(customTasksFile)
    ? JSON.parse(readFileSync(customTasksFile, "utf8")) as BenchmarkTask[]
    : defaultTasks

  const comparisons: TaskComparison[] = []

  const pluginFile = join(repoRoot, ".opencode", "plugin", "bettercode.js")
  const pluginFileBak = join(repoRoot, ".opencode", "plugin", "bettercode.js.bak")
  const opencodeConfig = join(repoRoot, ".opencode", "opencode.jsonc")
  const opencodeConfigBak = join(repoRoot, ".opencode", "opencode.jsonc.bak")

  const { cmd, args } = getOpencodeCommand(repoRoot)
  const defaultTimeout = 300_000

  const runDir = join(repoRoot, ".bettercode", "benchmark-runs", new Date().toISOString().replace(/[:.]/g, "-"))
  mkdirSync(join(runDir, "baseline"), { recursive: true })
  mkdirSync(join(runDir, "bettercode"), { recursive: true })

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
    console.log(`[Task: ${task.id}] - ${task.prompt}`)

    // ── 1. Baseline Run (Disable BetterCode) ──
    console.log("  Running Baseline (OpenCode alone)...")
    if (existsSync(pluginFile)) renameSync(pluginFile, pluginFileBak)
    if (existsSync(opencodeConfig)) renameSync(opencodeConfig, opencodeConfigBak)

    let baselineResult: TaskRunResult
    try {
      const run = runSingleVariant(cmd, args, repoRoot, task.prompt, extraArgs, timeoutMs)
      writeFileSync(join(runDir, "baseline", `${task.id}.stdout.txt`), run.stdout)
      writeFileSync(join(runDir, "baseline", `${task.id}.stderr.txt`), run.stderr)

      const events = parseOpenCodeOutput(run.stdout)
      const sessionID = events.sessionID ?? findSessionID(run.stdout)

      const dbStats = sessionID ? queryDbViaBun(dbPath, sessionID) : makeEmptyStats()
      const filesFromEvents = collectFilesFromEvents(events)

      const stats: RunStats = {
        ...dbStats,
        durationMs: run.durationMs,
        toolCalls: events.toolCallNames.length,
        subagents: events.subagentLaunches,
        filesRead: filesFromEvents,
        filesChanged: filesFromEvents,
      }

      baselineResult = scoreRun({ task, events, stats, exitedNormally: run.exitCode === 0, timedOut: run.timedOut })
      baselineResult.variant = "baseline"
      writeFileSync(join(runDir, "baseline", `${task.id}.result.json`), JSON.stringify(baselineResult, null, 2))
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
    } finally {
      if (existsSync(pluginFileBak)) renameSync(pluginFileBak, pluginFile)
      if (existsSync(opencodeConfigBak)) renameSync(opencodeConfigBak, opencodeConfig)
    }

    // Run validation commands for baseline if specified
    if (task.expected?.commandsPass && baselineResult.status !== "TIMEOUT" && baselineResult.status !== "ERROR") {
      const validations = runValidationCommands(repoRoot, task.expected.commandsPass)
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

    console.log(`    Status: ${baselineResult.status} | Score: ${baselineResult.score} | Tokens: ${baselineResult.stats.inputTokens} in / ${baselineResult.stats.outputTokens} out | Cost: $${baselineResult.stats.cost.toFixed(4)}`)
    baselineResults.push(baselineResult)

    // ── 2. BetterCode Run (Enable BetterCode) ──
    console.log("  Running BetterCode (OpenCode + Plugin)...")
    const run2 = runSingleVariant(cmd, args, repoRoot, task.prompt, extraArgs, timeoutMs)
    writeFileSync(join(runDir, "bettercode", `${task.id}.stdout.txt`), run2.stdout)
    writeFileSync(join(runDir, "bettercode", `${task.id}.stderr.txt`), run2.stderr)

    const events2 = parseOpenCodeOutput(run2.stdout)
    const sessionID2 = events2.sessionID ?? findSessionID(run2.stdout)

    const dbStats2 = sessionID2 ? queryDbViaBun(dbPath, sessionID2) : makeEmptyStats()
    const filesFromEvents2 = collectFilesFromEvents(events2)

    const stats2: RunStats = {
      ...dbStats2,
      durationMs: run2.durationMs,
      toolCalls: events2.toolCallNames.length,
      subagents: events2.subagentLaunches,
      filesRead: filesFromEvents2,
      filesChanged: filesFromEvents2,
    }

    let bettercodeResult = scoreRun({ task, events: events2, stats: stats2, exitedNormally: run2.exitCode === 0, timedOut: run2.timedOut })

    // Run validation commands for bettercode if specified
    if (task.expected?.commandsPass && bettercodeResult.status !== "TIMEOUT" && bettercodeResult.status !== "ERROR") {
      const validations = runValidationCommands(repoRoot, task.expected.commandsPass)
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

    writeFileSync(join(runDir, "bettercode", `${task.id}.result.json`), JSON.stringify(bettercodeResult, null, 2))

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
