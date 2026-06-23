export type GateStatus = "PASS" | "WARN" | "FAIL" | "SKIPPED"

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
  risk: RiskLevel
  checks: CheckResult[]
  warnings: string[]
  blockingReasons: string[]
  filesChanged: number
  diffLines: number
}

export interface QualityGateRules {
  failOnBuildError: boolean
  failOnTypecheckError: boolean
  failOnSecrets: boolean
  warnOnMissingTests: boolean
  reviewCriticalPath: boolean
}

export interface QualityGateThresholds {
  passScore: number
  warnScore: number
  maxChangedFiles: number
  maxDiffLines: number
}

export interface QualityGateScoreInput {
  checks: CheckResult[]
  filesChanged: number
  diffLines: number
  risk?: RiskLevel
  warnings?: string[]
  secretDetected?: boolean
  rules?: Partial<QualityGateRules>
  thresholds?: Partial<QualityGateThresholds>
}

export interface DiffRiskResult {
  risk: RiskLevel
  reasons: string[]
  reviewRequired: boolean
  requiredChecks: string[]
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

export type QualityGateCommandConfig = "auto" | string

export interface QualityGateConfig {
  version?: number
  thresholds?: Partial<QualityGateThresholds>
  rules?: Partial<QualityGateRules>
  commands?: Partial<Record<ProjectCommandName, QualityGateCommandConfig>>
  criticalPaths?: string[]
}
