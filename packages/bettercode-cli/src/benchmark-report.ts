import type { TaskComparison, BenchmarkSuiteResult, TaskRunResult } from "./benchmark-types"

export function generateBenchmarkReport(result: BenchmarkSuiteResult): string {
  const lines: string[] = []

  lines.push(`# BetterCode Benchmark Report`)
  lines.push("")
  lines.push(`Generated on: ${new Date().toLocaleString()}`)
  lines.push(`Model: auto (resolved by OpenCode)`)
  lines.push("")

  lines.push(`## Summary`)
  lines.push("")
  lines.push(`| Metric | Baseline | BetterCode | Delta |`)
  lines.push(`| --- | ---: | ---: | ---: |`)
  lines.push(`| Pass rate | ${result.metadata.passRateBaseline} | ${result.metadata.passRateBetterCode} | ${deltaPercent(result.metadata.passRateBaseline, result.metadata.passRateBetterCode)} |`)
  lines.push(`| Avg score | ${result.metadata.avgScoreBaseline} | ${result.metadata.avgScoreBetterCode} | ${result.metadata.avgScoreBetterCode - result.metadata.avgScoreBaseline} |`)
  lines.push(`| Total tokens | ${result.metadata.totalBaselineTokens} | ${result.metadata.totalBettercodeTokens} | ${result.metadata.netTokenSavings} |`)
  lines.push(`| Total cost | $${result.metadata.totalBaselineCost.toFixed(4)} | $${result.metadata.totalBettercodeCost.toFixed(4)} | $${(result.metadata.totalBaselineCost - result.metadata.totalBettercodeCost).toFixed(4)} |`)
  lines.push(`| Timeouts | ${result.metadata.timeoutCountBaseline} | ${result.metadata.timeoutCountBettercode} | ${result.metadata.timeoutCountBaseline - result.metadata.timeoutCountBettercode} |`)
  lines.push(`| Errors | ${result.metadata.errorCountBaseline} | ${result.metadata.errorCountBettercode} | ${result.metadata.errorCountBaseline - result.metadata.errorCountBettercode} |`)
  lines.push("")

  lines.push(`## Per-Task Results`)
  lines.push("")
  lines.push(`| Task | Category | Base Score | BC Score | Base Tokens | BC Tokens | Base Status | BC Status |`)
  lines.push(`| --- | --- | ---: | ---: | ---: | ---: | --- | --- |`)

  for (const comp of result.comparisons) {
    const baseTotal = comp.baseline.stats.inputTokens + comp.baseline.stats.outputTokens
    const bcTotal = comp.bettercode.stats.inputTokens + comp.bettercode.stats.outputTokens
    lines.push(`| ${comp.task.id} | ${comp.task.category} | ${comp.baseline.score} | ${comp.bettercode.score} | ${baseTotal} | ${bcTotal} | ${statusIcon(comp.baseline.status)} ${comp.baseline.status} | ${statusIcon(comp.bettercode.status)} ${comp.bettercode.status} |`)
  }
  lines.push("")

  const failures = result.comparisons.filter(
    (c) =>
      c.bettercode.status !== "PASS" ||
      c.baseline.status !== "PASS" ||
      c.baseline.score >= c.bettercode.score,
  )

  if (failures.length > 0) {
    lines.push(`## Issues And Warnings`)
    lines.push("")

    for (const comp of failures) {
      lines.push(`### ${comp.task.id}`)
      lines.push("")

      if (comp.baseline.status === "TIMEOUT") {
        lines.push(`- Baseline timed out.`)
      }
      if (comp.bettercode.status === "TIMEOUT") {
        lines.push(`- BetterCode timed out.`)
      }
      if (comp.baseline.status === "ERROR") {
        lines.push(`- Baseline error: ${comp.baseline.reasons.join(", ")}`)
      }
      if (comp.bettercode.status === "ERROR") {
        lines.push(`- BetterCode error: ${comp.bettercode.reasons.join(", ")}`)
      }
      for (const reason of comp.bettercode.reasons) {
        lines.push(`- ${reason}`)
      }
      if (comp.baseline.score > comp.bettercode.score) {
        lines.push(`- Warning: Baseline scored higher (${comp.baseline.score} > ${comp.bettercode.score}). BetterCode may be adding irrelevant context or overhead.`)
      }
      lines.push("")
    }
  }

  return lines.join("\n")
}

function statusIcon(status: TaskRunResult["status"]): string {
  if (status === "PASS") return "`"
  if (status === "FAIL") return "`"
  if (status === "TIMEOUT") return "`"
  return "`"
}

function deltaPercent(base: string, bc: string): string {
  const b = parseFloat(base)
  const c = parseFloat(bc)
  if (isNaN(b) || isNaN(c)) return "N/A"
  const delta = c - b
  const sign = delta >= 0 ? "+" : ""
  return `${sign}${delta.toFixed(1)}%`
}
