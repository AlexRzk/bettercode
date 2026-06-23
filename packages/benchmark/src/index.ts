import type { BenchmarkResult } from "@bettercode/shared"

export function createPlaceholderBenchmarkResult(): BenchmarkResult {
  return {
    id: "placeholder",
    name: "Placeholder benchmark",
    score: 0,
    duration_ms: 0,
    metadata: {
      status: "ready",
    },
  }
}
