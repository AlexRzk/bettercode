import type { BenchmarkTask, TaskRunResult, ParsedEvents, RunStats } from "./benchmark-types"

interface ScoreInput {
  task: BenchmarkTask
  events: ParsedEvents
  stats: RunStats
  exitedNormally: boolean
  timedOut: boolean
}

const PENALTY = {
  MISSING_CONTAINS: 20,
  FORBIDDEN_CONTAINS: 20,
  MISSING_FILE_CHANGE: 25,
  UNEXPECTED_FILE_CHANGE: 25,
  VALIDATION_FAILED: 40,
  TOOL_CALLS_EXCEEDED: 10,
  SUBAGENTS_EXCEEDED: 15,
} as const

export function scoreRun(input: ScoreInput): TaskRunResult {
  const { task, events, stats, exitedNormally, timedOut } = input
  const reasons: string[] = []
  let score = 100

  if (timedOut) {
    return makeResult(task, "bettercode", "TIMEOUT", 0, ["Process timed out"], stats, events)
  }

  if (!exitedNormally) {
    return makeResult(task, "bettercode", "ERROR", 0, ["Process exited with error"], stats, events)
  }

  const expected = task.expected
  if (!expected) {
    return makeResult(task, "bettercode", "PASS", 100, [], stats, events)
  }

  if (expected.contains) {
    for (const term of expected.contains) {
      if (!events.assistantText.toLowerCase().includes(term.toLowerCase())) {
        score -= PENALTY.MISSING_CONTAINS
        reasons.push(`Missing expected content: "${term}"`)
      }
    }
  }

  if (expected.notContains) {
    for (const term of expected.notContains) {
      if (events.assistantText.toLowerCase().includes(term.toLowerCase())) {
        score -= PENALTY.FORBIDDEN_CONTAINS
        reasons.push(`Contains forbidden content: "${term}"`)
      }
    }
  }

  if (expected.filesChanged) {
    for (const file of expected.filesChanged) {
      if (!stats.filesChanged.some((f) => f.includes(file))) {
        score -= PENALTY.MISSING_FILE_CHANGE
        reasons.push(`Expected file not changed: "${file}"`)
      }
    }
  }

  if (expected.filesNotChanged) {
    for (const file of expected.filesNotChanged) {
      if (stats.filesChanged.some((f) => f.includes(file))) {
        score -= PENALTY.UNEXPECTED_FILE_CHANGE
        reasons.push(`Unexpected file changed: "${file}"`)
      }
    }
  }

  if (expected.maxToolCalls !== undefined && stats.toolCalls > expected.maxToolCalls) {
    score -= PENALTY.TOOL_CALLS_EXCEEDED
    reasons.push(`Tool calls ${stats.toolCalls} exceeded max ${expected.maxToolCalls}`)
  }

  if (expected.maxSubagents !== undefined && stats.subagents > expected.maxSubagents) {
    score -= PENALTY.SUBAGENTS_EXCEEDED
    reasons.push(`Subagent launches ${stats.subagents} exceeded max ${expected.maxSubagents}`)
  }

  score = Math.max(0, Math.min(100, score))

  const status = score >= 90 ? "PASS" : score >= 70 ? "FAIL" : "FAIL"

  return makeResult(task, "bettercode", status, score, reasons, stats, events)
}

function makeResult(
  task: BenchmarkTask,
  variant: "baseline" | "bettercode",
  status: TaskRunResult["status"],
  score: number,
  reasons: string[],
  stats: RunStats,
  events: ParsedEvents,
): TaskRunResult {
  return { taskId: task.id, variant, status, score, reasons, stats, events }
}
