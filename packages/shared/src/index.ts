export type GateStatus = "PASS" | "FAIL" | "SKIPPED"

export type CheckStatus = "PASS" | "FAIL" | "SKIPPED"

export type RiskLevel = "low" | "medium" | "high" | "critical"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"

export type ProjectCommandName = "lint" | "typecheck" | "test" | "build" | "format" | "format:check"

export type ProjectType =
  | "node"
  | "nextjs"
  | "vite"
  | "python"
  | "rust"
  | "go"
  | "solidity-foundry"
  | "solidity-hardhat"
  | "unknown"

export interface ProjectInfo {
  type: ProjectType
  rootPath: string
  signals: string[]
}

export interface ProjectCommand {
  name: ProjectCommandName
  command: string
  available: true
}

export type AvailableCommands = Partial<Record<ProjectCommandName, ProjectCommand>>

export interface CheckResult {
  name: string
  status: CheckStatus
  command?: string
  output?: string
  durationMs: number
  reason?: string
}

export interface QualityGateResult {
  status: GateStatus
  score: number
  checks: CheckResult[]
  warnings: string[]
  blockingReasons: string[]
  filesChanged: number
  diffLines: number
}

export interface DiffRiskResult {
  level: RiskLevel
  score: number
  reasons: string[]
}

export interface GitDiffSummary {
  changedFiles: string[]
  filesChanged: number
  diffLines: number
  addedLines: number
  deletedLines: number
  warnings: string[]
  stat: string
}

export interface BenchmarkResult {
  id: string
  name: string
  score: number
  duration_ms: number
  metadata?: Record<string, unknown>
}
