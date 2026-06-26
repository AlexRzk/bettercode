import { describe, it, expect } from "bun:test"
import { scoreRun } from "../src/benchmark-scorer"
import type { BenchmarkTask, ParsedEvents, RunStats } from "../src/benchmark-types"

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

describe("scoreRun", () => {
  it("returns PASS with score 100 when no expectations", () => {
    const result = scoreRun({
      task: makeTask(),
      events: makeEvents({ assistantText: "anything" }),
      stats: makeStats(),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.status).toBe("PASS")
    expect(result.score).toBe(100)
    expect(result.reasons).toEqual([])
  })

  it("returns TIMEOUT when timed out", () => {
    const result = scoreRun({
      task: makeTask({ expected: { contains: ["foo"] } }),
      events: makeEvents(),
      stats: makeStats(),
      exitedNormally: true,
      timedOut: true,
    })

    expect(result.status).toBe("TIMEOUT")
    expect(result.score).toBe(0)
    expect(result.reasons).toContain("Process timed out")
  })

  it("returns ERROR when process exited abnormally", () => {
    const result = scoreRun({
      task: makeTask({ expected: { contains: ["foo"] } }),
      events: makeEvents(),
      stats: makeStats(),
      exitedNormally: false,
      timedOut: false,
    })

    expect(result.status).toBe("ERROR")
    expect(result.score).toBe(0)
    expect(result.reasons).toContain("Process exited with error")
  })

  it("deducts points for missing expected content", () => {
    const result = scoreRun({
      task: makeTask({ expected: { contains: ["foo", "bar"] } }),
      events: makeEvents({ assistantText: "nothing here" }),
      stats: makeStats(),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(60)
    expect(result.reasons.length).toBe(2)
    expect(result.reasons.some((r) => r.includes("foo"))).toBe(true)
    expect(result.reasons.some((r) => r.includes("bar"))).toBe(true)
  })

  it("deducts points for forbidden content", () => {
    const result = scoreRun({
      task: makeTask({ expected: { notContains: ["secret"] } }),
      events: makeEvents({ assistantText: "the secret is here" }),
      stats: makeStats(),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(80)
    expect(result.reasons.some((r) => r.includes("secret"))).toBe(true)
  })

  it("deducts points for missing expected file change", () => {
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

  it("deducts points for unexpected file change", () => {
    const result = scoreRun({
      task: makeTask({ expected: { filesNotChanged: [".env"] } }),
      events: makeEvents(),
      stats: makeStats({ filesChanged: [".env.production"] }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(75)
  })

  it("deducts points when tool calls exceed max", () => {
    const result = scoreRun({
      task: makeTask({ expected: { maxToolCalls: 2 } }),
      events: makeEvents(),
      stats: makeStats({ toolCalls: 5 }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(90)
    expect(result.reasons.some((r) => r.includes("Tool calls"))).toBe(true)
  })

  it("deducts points when subagents exceed max", () => {
    const result = scoreRun({
      task: makeTask({ expected: { maxSubagents: 0 } }),
      events: makeEvents(),
      stats: makeStats({ subagents: 2 }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(85)
    expect(result.reasons.some((r) => r.includes("Subagent"))).toBe(true)
  })

  it("does not deduct for tool calls within budget", () => {
    const result = scoreRun({
      task: makeTask({ expected: { maxToolCalls: 10 } }),
      events: makeEvents(),
      stats: makeStats({ toolCalls: 5 }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(100)
  })

  it("clamps score to minimum 0", () => {
    const result = scoreRun({
      task: makeTask({
        expected: {
          contains: ["a", "b", "c", "d", "e", "f", "g"],
          maxToolCalls: 0,
          maxSubagents: 0,
        },
      }),
      events: makeEvents({ assistantText: "" }),
      stats: makeStats({ toolCalls: 10, subagents: 5 }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(0)
  })

  it("clamps score to maximum 100", () => {
    const result = scoreRun({
      task: makeTask({ expected: { contains: ["test"] } }),
      events: makeEvents({ assistantText: "this is a test" }),
      stats: makeStats(),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.score).toBe(100)
  })

  it("returns PASS when score >= 90", () => {
    const result = scoreRun({
      task: makeTask({ expected: { maxToolCalls: 10 } }),
      events: makeEvents({ assistantText: "test" }),
      stats: makeStats({ toolCalls: 5 }),
      exitedNormally: true,
      timedOut: false,
    })

    expect(result.status).toBe("PASS")
  })
})
