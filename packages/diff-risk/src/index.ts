import type { DiffRiskResult } from "@better-code/shared"

export function createPlaceholderDiffRiskResult(): DiffRiskResult {
  return {
    level: "low",
    score: 0,
    reasons: ["Diff risk analyzer placeholder is ready."],
  }
}
