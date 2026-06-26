import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { join, dirname } from "node:path"
import { spawnSync } from "node:child_process"
import os from "node:os"

interface Task {
  id: string
  category: string
  prompt: string
}

interface RunStats {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  durationMs: number
}

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
      input: row.tokens_input || 0,
      output: row.tokens_output || 0,
      reasoning: row.tokens_reasoning || 0,
      cacheRead: row.tokens_cache_read || 0,
      cacheWrite: row.tokens_cache_write || 0,
      cost: row.cost || 0,
      durationMs: 0,
    }
  } catch (e: any) {
    throw new Error(`Failed to parse DB query output: ${e.message}`)
  }
}

function findDatabasePath(): string {
  const home = os.homedir()
  // Check .local/share/opencode
  const xdgLocal = join(home, ".local", "share", "opencode")
  if (existsSync(xdgLocal)) {
    const devDb = join(xdgLocal, "opencode-local.db")
    if (existsSync(devDb)) return devDb
    const prodDb = join(xdgLocal, "opencode.db")
    if (existsSync(prodDb)) return prodDb
  }

  // Fallback to standard XDG paths
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
  // Monorepo dev mode
  const devOpencodeDir = join(root, "packages", "opencode")
  if (existsSync(join(devOpencodeDir, "src", "index.ts"))) {
    return {
      cmd: "bun",
      args: ["run", "--cwd", devOpencodeDir, "--conditions=browser", "src/index.ts"],
    }
  }

  // Global binary
  const lildaxOnPath = spawnSync("lildax", ["--version"], { encoding: "utf8", timeout: 5000 })
  if (lildaxOnPath.status === 0) {
    return { cmd: "lildax", args: [] }
  }

  // Local node_modules
  const candidate = join(root, "node_modules", "@opencode-ai", "cli", "bin", "lildax.cjs")
  if (existsSync(candidate)) {
    return { cmd: process.execPath, args: [candidate] }
  }

  throw new Error("OpenCode CLI not found. Run 'npm install -g @opencode-ai/cli' first.")
}

const defaultTasks: Task[] = [
  {
    id: "project-summary",
    category: "understanding",
    prompt: "Summarize the bettercode project in 2 sentences. Focus on what it adds to OpenCode."
  },
  {
    id: "known-error-recall",
    category: "debugging",
    prompt: "If OpenCode plugin tools are not loading, what is the most likely cause related to symlinks?"
  },
  {
    id: "quality-gate-explain",
    category: "understanding",
    prompt: "Explain what the BetterCode quality gate command 'gate run' does and what it returns."
  }
]

export async function runBenchmark(repoRoot: string, extraArgs: string[] = []) {
  // Test mock mode to avoid calling live LLM APIs in tests
  if (process.env.BUN_ENV === "test" || process.env.NODE_ENV === "test") {
    return {
      score: 25,
      duration_ms: 1200,
      name: "Comparison Benchmark Suite (Mocked)",
      metadata: {
        tasksRun: 3,
        netSavingsPercent: "25.0%",
        netCostSavings: "$0.0234",
      },
    }
  }

  // Verify bun is installed since we need it to spawn bun -e for DB queries
  const bunCheck = spawnSync("bun", ["--version"], { encoding: "utf8" })
  if (bunCheck.status !== 0) {
    throw new Error("Bun is required to run benchmarks.")
  }

  const dbPath = findDatabasePath()
  if (!existsSync(dbPath)) {
    throw new Error(`OpenCode database not found. Run opencode at least once. (Searched: ${dbPath})`)
  }

  // Use custom tasks if tasks.json exists in project root, otherwise use inlined defaults
  const customTasksFile = join(repoRoot, ".bettercode", "tasks.json")
  const tasks = existsSync(customTasksFile)
    ? JSON.parse(readFileSync(customTasksFile, "utf8")) as Task[]
    : defaultTasks

  const results: {
    task: Task
    baseline: RunStats
    bettercode: RunStats
  }[] = []

  const pluginFile = join(repoRoot, ".opencode", "plugin", "bettercode.js")
  const pluginFileBak = join(repoRoot, ".opencode", "plugin", "bettercode.js.bak")
  const opencodeConfig = join(repoRoot, ".opencode", "opencode.jsonc")
  const opencodeConfigBak = join(repoRoot, ".opencode", "opencode.jsonc.bak")

  const { cmd, args } = getOpencodeCommand(repoRoot)

  console.log(`Running benchmark suite containing ${tasks.length} tasks...`)
  console.log(`Using OpenCode: ${cmd} ${args.join(" ")}`)
  if (extraArgs.length > 0) {
    console.log(`Forwarding OpenCode flags: ${extraArgs.join(" ")}`)
  }
  console.log(`Database path: ${dbPath}\n`)

  for (const task of tasks) {
    console.log(`[Task: ${task.id}] - ${task.prompt}`)

    // ── 1. Baseline Run (Disable BetterCode) ──
    console.log("  Running Baseline (OpenCode alone)...")
    if (existsSync(pluginFile)) renameSync(pluginFile, pluginFileBak)
    if (existsSync(opencodeConfig)) renameSync(opencodeConfig, opencodeConfigBak)

    let baselineStats: RunStats
    try {
      const started = performance.now()
      const child = spawnSync(cmd, [...args, "run", "--format", "json", "--dangerously-skip-permissions", ...extraArgs, task.prompt], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 300_000,
      })
      const durationMs = Math.round(performance.now() - started)

      // Find sessionID
      const lines = child.stdout.split("\n")
      let sessionID: string | undefined
      for (const line of lines) {
        try {
          const event = JSON.parse(line.trim())
          if (event && typeof event === "object" && "sessionID" in event) {
            sessionID = event.sessionID
            break
          }
        } catch {}
      }

      if (!sessionID) {
        throw new Error("Could not extract sessionID from Baseline run output")
      }

      const dbStats = queryDbViaBun(dbPath, sessionID)
      baselineStats = { ...dbStats, durationMs }
      console.log(`    Tokens: Input=${baselineStats.input}, Output=${baselineStats.output}, Cost=$${baselineStats.cost.toFixed(4)}`)
    } finally {
      // Restore
      if (existsSync(pluginFileBak)) renameSync(pluginFileBak, pluginFile)
      if (existsSync(opencodeConfigBak)) renameSync(opencodeConfigBak, opencodeConfig)
    }

    // ── 2. BetterCode Run (Enable BetterCode) ──
    console.log("  Running BetterCode (OpenCode + Plugin)...")
    const started = performance.now()
    const child = spawnSync(cmd, [...args, "run", "--format", "json", "--dangerously-skip-permissions", ...extraArgs, task.prompt], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 300_000,
    })
    const durationMs = Math.round(performance.now() - started)

    // Find sessionID
    const lines = child.stdout.split("\n")
    let sessionID: string | undefined
    for (const line of lines) {
      try {
        const event = JSON.parse(line.trim())
        if (event && typeof event === "object" && "sessionID" in event) {
          sessionID = event.sessionID
          break
        }
      } catch {}
    }

    if (!sessionID) {
      throw new Error("Could not extract sessionID from BetterCode run output")
    }

    const dbStats = queryDbViaBun(dbPath, sessionID)
    const bettercodeStats = { ...dbStats, durationMs }
    console.log(`    Tokens: Input=${bettercodeStats.input}, Output=${bettercodeStats.output}, Cost=$${bettercodeStats.cost.toFixed(4)}`)

    results.push({
      task,
      baseline: baselineStats,
      bettercode: bettercodeStats,
    })
  }

  // ── 3. Generate Report ──
  let totalBaselineTokens = 0
  let totalBettercodeTokens = 0
  let totalBaselineCost = 0
  let totalBettercodeCost = 0

  let report = `# BetterCode Benchmark Report\n\n`
  report += `Generated on: ${new Date().toLocaleString()}\n`
  report += `Model: auto (resolved by OpenCode)\n\n`

  report += `## Summary Table\n\n`
  report += `| Task ID | Metric | Baseline | BetterCode | Savings |\n`
  report += `| --- | --- | ---: | ---: | ---: |\n`

  for (const r of results) {
    const baseTotal = r.baseline.input + r.baseline.output
    const bcTotal = r.bettercode.input + r.bettercode.output
    const savings = baseTotal - bcTotal
    const savingsPercent = baseTotal > 0 ? (savings / baseTotal) * 100 : 0

    totalBaselineTokens += baseTotal
    totalBettercodeTokens += bcTotal
    totalBaselineCost += r.baseline.cost
    totalBettercodeCost += r.bettercode.cost

    report += `| **${r.task.id}** | Input Tokens | ${r.baseline.input} | ${r.bettercode.input} | ${(r.baseline.input - r.bettercode.input)} |\n`
    report += `| | Output Tokens | ${r.baseline.output} | ${r.bettercode.output} | ${(r.baseline.output - r.bettercode.output)} |\n`
    report += `| | Total Tokens | ${baseTotal} | ${bcTotal} | ${savings} (${savingsPercent.toFixed(1)}%) |\n`
    report += `| | Cost ($) | $${r.baseline.cost.toFixed(4)} | $${r.bettercode.cost.toFixed(4)} | $${(r.baseline.cost - r.bettercode.cost).toFixed(4)} |\n`
    report += `| | Duration (s) | ${(r.baseline.durationMs / 1000).toFixed(1)}s | ${(r.bettercode.durationMs / 1000).toFixed(1)}s | ${((r.baseline.durationMs - r.bettercode.durationMs) / 1000).toFixed(1)}s |\n`
    report += `| | | | | |\n`
  }

  const netSavings = totalBaselineTokens - totalBettercodeTokens
  const netSavingsPercent = totalBaselineTokens > 0 ? (netSavings / totalBaselineTokens) * 100 : 0

  report += `## Aggregated Totals\n\n`
  report += `- **Total Baseline Tokens:** ${totalBaselineTokens}\n`
  report += `- **Total BetterCode Tokens:** ${totalBettercodeTokens}\n`
  report += `- **Net Token Savings:** **${netSavings}** (${netSavingsPercent.toFixed(1)}%)\n`
  report += `- **Total Baseline Cost:** $${totalBaselineCost.toFixed(4)}\n`
  report += `- **Total BetterCode Cost:** $${totalBettercodeCost.toFixed(4)}\n`
  report += `- **Net Cost Savings:** **$${(totalBaselineCost - totalBettercodeCost).toFixed(4)}**\n`

  const reportPath = join(repoRoot, "docs", "benchmark-report.md")
  writeFileSync(reportPath, report)

  console.log(`\n✓ Benchmark complete! Report written to ${reportPath}`)

  return {
    score: Math.round(netSavingsPercent),
    duration_ms: results.reduce((acc, r) => acc + r.baseline.durationMs + r.bettercode.durationMs, 0),
    name: "Comparison Benchmark Suite",
    metadata: {
      tasksRun: tasks.length,
      netSavingsPercent: `${netSavingsPercent.toFixed(1)}%`,
      netCostSavings: `$${(totalBaselineCost - totalBettercodeCost).toFixed(4)}`,
    },
  }
}
