export type GateStatus = "passed" | "warning" | "failed" | "skipped"

export type CheckStatus = "passed" | "warning" | "failed" | "skipped"

export type RiskLevel = "low" | "medium" | "high" | "critical"

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

export interface CheckResult {
  id: string
  name: string
  status: CheckStatus
  message?: string
  details?: Record<string, unknown>
}

export interface QualityGateResult {
  status: GateStatus
  checks: CheckResult[]
  summary?: string
}

export interface DiffRiskResult {
  level: RiskLevel
  score: number
  reasons: string[]
}

export interface BenchmarkResult {
  id: string
  name: string
  score: number
  duration_ms: number
  metadata?: Record<string, unknown>
}
