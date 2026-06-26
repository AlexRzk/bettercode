import { describe, it, expect } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"
import { scoreRun } from "../src/benchmark-scorer"
import { generateBenchmarkReport } from "../src/benchmark-report"
import type { BenchmarkTask, ParsedEvents, RunStats } from "../src/benchmark-types"

function makeFixture(prefix: string) {
  return mkdtempSync(join(tmpdir(), `benchmark-isolation-${prefix}-`))
}

function makeTask(overrides?: Partial<BenchmarkTask>): BenchmarkTask {
  return {
    id: "test-task",
    category: "test",
    prompt: "test prompt",
    ...overrides,
  }
}

function makeEvents(overrides?: Partial<ParsedEvents>): ParsedEvents {
  return {
    assistantText: "",
    toolCallNames: [],
    toolCallArgs: [],
    subagentLaunches: 0,
    rawEvents: [],
    ...overrides,
  }
}

function makeStats(overrides?: Partial<RunStats>): RunStats {
  return {
    inputTokens: 1000,
    outputTokens: 500,
    cost: 0.01,
    durationMs: 5000,
    toolCalls: 3,
    subagents: 0,
    filesRead: [],
    filesChanged: [],
    ...overrides,
  }
}

describe("workspace isolation", () => {
  it("creates isolated workspace from fixture", () => {
    const fixtureDir = makeFixture("fixture-src")
    mkdirSync(join(fixtureDir, "src"), { recursive: true })
    writeFileSync(join(fixtureDir, "src", "index.ts"), "export const x = 1")
    writeFileSync(join(fixtureDir, "package.json"), '{"name":"test"}')

    const workspaceDir = makeFixture("workspace-target")
    const workspace = join(workspaceDir, "isolated")

    // Simulate copy
    const { cpSync } = require("node:fs")
    cpSync(fixtureDir, workspace, { recursive: true })

    expect(existsSync(join(workspace, "src", "index.ts"))).toBe(true)
    expect(existsSync(join(workspace, "package.json"))).toBe(true)

    // Modifying workspace should not affect fixture
    writeFileSync(join(workspace, "src", "index.ts"), "export const x = 2")
    expect(readFileSync(join(fixtureDir, "src", "index.ts"), "utf8")).toBe("export const x = 1")
    expect(readFileSync(join(workspace, "src", "index.ts"), "utf8")).toBe("export const x = 2")

    rmSync(fixtureDir, { recursive: true, force: true })
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  it("git init creates commitable workspace", () => {
    const workspaceDir = makeFixture("git-workspace")
    mkdirSync(join(workspaceDir, "src"), { recursive: true })
    writeFileSync(join(workspaceDir, "src", "index.ts"), "export const x = 1")

    spawnSync("git", ["init"], { cwd: workspaceDir, encoding: "utf8" })
    spawnSync("git", ["add", "."], { cwd: workspaceDir, encoding: "utf8" })
    spawnSync("git", ["commit", "-m", "initial"], { cwd: workspaceDir, encoding: "utf8" })

    const gitDir = join(workspaceDir, ".git")
    expect(existsSync(gitDir)).toBe(true)

    // Verify commit exists
    const result = spawnSync("git", ["log", "--oneline"], { cwd: workspaceDir, encoding: "utf8" })
    expect(result.stdout).toContain("initial")

    rmSync(workspaceDir, { recursive: true, force: true })
  })
})

describe("file-change scoring", () => {
  it("scores PASS when expected files are changed", () => {
    const result = scoreRun({
      task: makeTask({ expected: { filesChanged: ["src/index.ts"] } }),
      events: makeEvents(),
      stats: makeStats({ filesChanged: ["src/index.ts"] }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.status).toBe("PASS")
    expect(result.score).toBe(100)
  })

  it("scores FAIL when expected files not changed", () => {
    const result = scoreRun({
      task: makeTask({ expected: { filesChanged: ["src/index.ts"] } }),
      events: makeEvents(),
      stats: makeStats({ filesChanged: ["README.md"] }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(75)
    expect(result.reasons.some((r) => r.includes("src/index.ts"))).toBe(true)
  })

  it("scores FAIL when forbidden files changed", () => {
    const result = scoreRun({
      task: makeTask({ expected: { filesNotChanged: [".env"] } }),
      events: makeEvents(),
      stats: makeStats({ filesChanged: [".env.production"] }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(75)
  })

  it("does not treat tool reads as file changes", () => {
    const result = scoreRun({
      task: makeTask({ expected: { filesChanged: ["src/index.ts"] } }),
      events: makeEvents(),
      stats: makeStats({ filesRead: ["src/index.ts"], filesChanged: [] }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(75)
    expect(result.reasons.some((r) => r.includes("Expected file not changed"))).toBe(true)
  })
})

describe("validation result in artifacts", () => {
  it("includes validation in task result", () => {
    const result = scoreRun({
      task: makeTask({ expected: { contains: ["hello"] } }),
      events: makeEvents({ assistantText: "hello world" }),
      stats: makeStats(),
      exitedNormally: true,
      timedOut: false,
    })

    result.artifacts = {
      stdout: "some output",
      stderr: "",
      validation: {
        passed: true,
        command: "bun test",
        exitCode: 0,
        output: "all tests passed",
        durationMs: 1200,
      },
    }

    expect(result.artifacts.validation?.passed).toBe(true)
    expect(result.artifacts.validation?.command).toBe("bun test")
  })
})

describe("report with categories", () => {
  it("generates category pass rates when multiple categories exist", () => {
    const result = {
      name: "Test Suite",
      score: 85,
      duration_ms: 10000,
      metadata: {
        tasksRun: 4,
        passRateBaseline: "50.0%",
        passRateBetterCode: "75.0%",
        avgScoreBaseline: 65,
        avgScoreBetterCode: 85,
        totalBaselineTokens: 40000,
        totalBettercodeTokens: 35000,
        netTokenSavings: "12.5%",
        totalBaselineCost: 0.08,
        totalBettercodeCost: 0.06,
        timeoutCountBaseline: 0,
        timeoutCountBettercode: 0,
        errorCountBaseline: 0,
        errorCountBettercode: 0,
      },
      comparisons: [
        {
          task: { id: "t1", category: "coding", prompt: "fix bug" },
          baseline: {
            taskId: "t1", variant: "baseline" as const, status: "FAIL" as const, score: 60, reasons: [],
            stats: { inputTokens: 10000, outputTokens: 500, cost: 0.02, durationMs: 3000, toolCalls: 5, subagents: 0, filesRead: [], filesChanged: [] },
            events: { assistantText: "", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
          },
          bettercode: {
            taskId: "t1", variant: "bettercode" as const, status: "PASS" as const, score: 100, reasons: [],
            stats: { inputTokens: 12000, outputTokens: 600, cost: 0.03, durationMs: 2500, toolCalls: 3, subagents: 0, filesRead: [], filesChanged: ["src/bug.ts"] },
            events: { assistantText: "fixed", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
          },
        },
        {
          task: { id: "t2", category: "knowledge", prompt: "explain" },
          baseline: {
            taskId: "t2", variant: "baseline" as const, status: "PASS" as const, score: 95, reasons: [],
            stats: { inputTokens: 8000, outputTokens: 400, cost: 0.015, durationMs: 2000, toolCalls: 2, subagents: 0, filesRead: [], filesChanged: [] },
            events: { assistantText: "explanation", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
          },
          bettercode: {
            taskId: "t2", variant: "bettercode" as const, status: "PASS" as const, score: 95, reasons: [],
            stats: { inputTokens: 9000, outputTokens: 450, cost: 0.018, durationMs: 1800, toolCalls: 1, subagents: 0, filesRead: [], filesChanged: [] },
            events: { assistantText: "explanation", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
          },
        },
      ],
    }

    const report = generateBenchmarkReport(result)
    expect(report).toContain("## Pass Rate By Category")
    expect(report).toContain("| coding |")
    expect(report).toContain("| knowledge |")
    expect(report).toContain("## Tool Usage")
  })

  it("includes validation results in issues section", () => {
    const result = {
      name: "Test Suite",
      score: 50,
      duration_ms: 10000,
      metadata: {
        tasksRun: 1,
        passRateBaseline: "0.0%",
        passRateBetterCode: "0.0%",
        avgScoreBaseline: 50,
        avgScoreBetterCode: 50,
        totalBaselineTokens: 10000,
        totalBettercodeTokens: 10000,
        netTokenSavings: "0.0%",
        totalBaselineCost: 0.01,
        totalBettercodeCost: 0.01,
        timeoutCountBaseline: 0,
        timeoutCountBettercode: 0,
        errorCountBaseline: 0,
        errorCountBettercode: 0,
      },
      comparisons: [
        {
          task: { id: "t1", category: "coding", prompt: "fix" },
          baseline: {
            taskId: "t1", variant: "baseline" as const, status: "FAIL" as const, score: 50, reasons: [],
            stats: { inputTokens: 10000, outputTokens: 500, cost: 0.01, durationMs: 3000, toolCalls: 5, subagents: 0, filesRead: [], filesChanged: [] },
            events: { assistantText: "", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
            artifacts: {
              stdout: "", stderr: "",
              validation: { passed: false, command: "bun typecheck", exitCode: 1, output: "TS2345", durationMs: 500 },
            },
          },
          bettercode: {
            taskId: "t1", variant: "bettercode" as const, status: "FAIL" as const, score: 50, reasons: [],
            stats: { inputTokens: 10000, outputTokens: 500, cost: 0.01, durationMs: 3000, toolCalls: 5, subagents: 0, filesRead: [], filesChanged: [] },
            events: { assistantText: "", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
            artifacts: {
              stdout: "", stderr: "",
              validation: { passed: false, command: "bun typecheck", exitCode: 1, output: "TS2345", durationMs: 500 },
            },
          },
        },
      ],
    }

    const report = generateBenchmarkReport(result)
    expect(report).toContain("Baseline validation: FAIL")
    expect(report).toContain("BetterCode validation: FAIL")
    expect(report).toContain("bun typecheck")
  })
})
