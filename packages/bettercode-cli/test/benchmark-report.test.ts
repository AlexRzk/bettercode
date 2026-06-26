import { describe, it, expect } from "bun:test"
import { generateBenchmarkReport } from "../src/benchmark-report"
import type { BenchmarkSuiteResult } from "../src/benchmark-types"

function makeSuiteResult(overrides?: Partial<BenchmarkSuiteResult>): BenchmarkSuiteResult {
  return {
    name: "Test Suite",
    score: 85,
    duration_ms: 10000,
    metadata: {
      tasksRun: 3,
      passRateBaseline: "33.3%",
      passRateBetterCode: "66.7%",
      avgScoreBaseline: 60,
      avgScoreBetterCode: 85,
      totalBaselineTokens: 50000,
      totalBettercodeTokens: 45000,
      netTokenSavings: "10.0%",
      totalBaselineCost: 0.1,
      totalBettercodeCost: 0.08,
      timeoutCountBaseline: 1,
      timeoutCountBettercode: 0,
      errorCountBaseline: 0,
      errorCountBettercode: 0,
    },
    comparisons: [
      {
        task: { id: "task-1", category: "knowledge", prompt: "test" },
        baseline: {
          taskId: "task-1",
          variant: "baseline",
          status: "FAIL",
          score: 60,
          reasons: ["Missing expected content: \"foo\""],
          stats: { inputTokens: 10000, outputTokens: 500, cost: 0.02, durationMs: 3000, toolCalls: 5, subagents: 0, filesRead: [], filesChanged: [] },
          events: { assistantText: "no foo here", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
        },
        bettercode: {
          taskId: "task-1",
          variant: "bettercode",
          status: "PASS",
          score: 100,
          reasons: [],
          stats: { inputTokens: 12000, outputTokens: 600, cost: 0.03, durationMs: 2500, toolCalls: 3, subagents: 0, filesRead: [], filesChanged: [] },
          events: { assistantText: "foo is great", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
        },
      },
      {
        task: { id: "task-2", category: "debugging", prompt: "test2" },
        baseline: {
          taskId: "task-2",
          variant: "baseline",
          status: "TIMEOUT",
          score: 0,
          reasons: ["Process timed out"],
          stats: { inputTokens: 0, outputTokens: 0, cost: 0, durationMs: 300000, toolCalls: 0, subagents: 0, filesRead: [], filesChanged: [] },
          events: { assistantText: "", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
        },
        bettercode: {
          taskId: "task-2",
          variant: "bettercode",
          status: "PASS",
          score: 95,
          reasons: [],
          stats: { inputTokens: 8000, outputTokens: 400, cost: 0.015, durationMs: 4000, toolCalls: 2, subagents: 0, filesRead: [], filesChanged: [] },
          events: { assistantText: "symlink fix", toolCallNames: [], toolCallArgs: [], subagentLaunches: 0, rawEvents: [] },
        },
      },
    ],
    ...overrides,
  }
}

describe("generateBenchmarkReport", () => {
  it("generates a markdown report", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("# BetterCode Benchmark Report")
    expect(report).toContain("Generated on:")
  })

  it("includes summary table", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("## Summary")
    expect(report).toContain("| Metric | Baseline | BetterCode | Delta |")
    expect(report).toContain("Pass rate")
    expect(report).toContain("Avg score")
  })

  it("includes per-task results", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("## Per-Task Results")
    expect(report).toContain("task-1")
    expect(report).toContain("task-2")
  })

  it("shows pass rates with delta", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("33.3%")
    expect(report).toContain("66.7%")
  })

  it("shows token savings", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("10.0%")
    expect(report).toContain("50000")
    expect(report).toContain("45000")
  })

  it("shows cost comparison", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("$0.1000")
    expect(report).toContain("$0.0800")
  })

  it("shows timeout counts", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("Timeouts")
    expect(report).toContain("1")
  })

  it("includes issues and warnings section when there are failures", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("## Issues And Warnings")
    expect(report).toContain("### task-1")
  })

  it("warns when baseline scored higher", () => {
    const suite = makeSuiteResult()
    suite.comparisons[0]!.baseline.score = 95
    suite.comparisons[0]!.bettercode.score = 80
    const report = generateBenchmarkReport(suite)
    expect(report).toContain("Warning: Baseline scored higher")
  })

  it("reports timeout in issues section", () => {
    const report = generateBenchmarkReport(makeSuiteResult())
    expect(report).toContain("Baseline timed out")
  })

  it("generates valid report with no comparisons", () => {
    const suite = makeSuiteResult({ comparisons: [] })
    const report = generateBenchmarkReport(suite)
    expect(report).toContain("# BetterCode Benchmark Report")
    expect(report).toContain("| Task | Category |")
  })
})
