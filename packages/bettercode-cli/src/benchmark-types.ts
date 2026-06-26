export interface BenchmarkTask {
  id: string
  category: string
  prompt: string
  timeoutMs?: number
  fixture?: string
  setupCommands?: string[]
  validationCwd?: string
  expected?: TaskExpectations
}

export interface TaskExpectations {
  contains?: string[]
  notContains?: string[]
  filesChanged?: string[]
  filesNotChanged?: string[]
  filesRead?: string[]
  filesNotRead?: string[]
  commandsPass?: string[]
  minQualityScore?: number
  maxToolCalls?: number
  maxSubagents?: number
}

export interface TaskRunResult {
  taskId: string
  variant: "baseline" | "bettercode"
  status: "PASS" | "FAIL" | "TIMEOUT" | "ERROR"
  score: number
  reasons: string[]
  stats: RunStats
  events: ParsedEvents
  artifacts?: TaskArtifacts
}

export interface TaskArtifacts {
  stdout: string
  stderr: string
  validation?: ValidationResult
}

export interface ValidationResult {
  passed: boolean
  command: string
  exitCode: number
  output: string
  durationMs: number
  error?: string
}

export interface RunStats {
  inputTokens: number
  outputTokens: number
  cost: number
  durationMs: number
  toolCalls: number
  subagents: number
  filesRead: string[]
  filesChanged: string[]
}

export interface ParsedEvents {
  sessionID?: string
  assistantText: string
  toolCallNames: string[]
  toolCallArgs: Record<string, unknown>[]
  subagentLaunches: number
  rawEvents: unknown[]
}

export interface TaskComparison {
  task: BenchmarkTask
  baseline: TaskRunResult
  bettercode: TaskRunResult
}

export interface BenchmarkSuiteResult {
  name: string
  score: number
  duration_ms: number
  metadata: {
    tasksRun: number
    passRateBaseline: string
    passRateBetterCode: string
    avgScoreBaseline: number
    avgScoreBetterCode: number
    totalBaselineTokens: number
    totalBettercodeTokens: number
    netTokenSavings: string
    totalBaselineCost: number
    totalBettercodeCost: number
    timeoutCountBaseline: number
    timeoutCountBettercode: number
    errorCountBaseline: number
    errorCountBettercode: number
  }
  comparisons: TaskComparison[]
}
