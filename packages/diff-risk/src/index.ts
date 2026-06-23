import type { DiffRiskResult, GitDiffSummary, RiskLevel } from "@better-code/shared"

type RiskRule = {
  pattern: RegExp
  risk: RiskLevel
  reason: string
  checks: string[]
}

const riskRules: RiskRule[] = [
  { pattern: /^\.env/, risk: "critical", reason: "Secrets file modified", checks: ["typecheck", "test", "build"] },
  { pattern: /secret/i, risk: "critical", reason: "Potential secrets file modified", checks: ["typecheck", "test", "build"] },
  { pattern: /^prisma\/migrations\//, risk: "critical", reason: "Database migration modified", checks: ["typecheck", "test", "build"] },
  { pattern: /^contracts\/.*\.sol$/, risk: "critical", reason: "Solidity contract modified", checks: ["typecheck", "test", "build"] },
  { pattern: /^src\/auth\//, risk: "high", reason: "Auth code modified", checks: ["typecheck", "test", "build"] },
  { pattern: /^src\/app\/api\//, risk: "high", reason: "API route modified", checks: ["typecheck", "test", "build"] },
  { pattern: /^middleware\.ts$/, risk: "high", reason: "Middleware modified", checks: ["typecheck", "test", "build"] },
  { pattern: /(^|\/)package\.json$/, risk: "high", reason: "Package manifest modified", checks: ["typecheck", "test", "build"] },
  { pattern: /^(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|bun\.lockb)$/, risk: "high", reason: "Lockfile modified", checks: ["typecheck", "test", "build"] },
  { pattern: /^src\/components\//, risk: "medium", reason: "Component code modified", checks: ["typecheck", "test"] },
  { pattern: /\.css$/, risk: "low", reason: "Stylesheet modified", checks: ["test"] },
  { pattern: /^README\.md$/, risk: "low", reason: "Documentation modified", checks: [] },
  { pattern: /^docs\//, risk: "low", reason: "Documentation modified", checks: [] },
  { pattern: /\.md$/, risk: "low", reason: "Markdown documentation modified", checks: [] },
]

const riskOrder: RiskLevel[] = ["low", "medium", "high", "critical"]

export function analyzeDiffRisk(changedFiles: string[]): DiffRiskResult {
  const matchedReasons: { risk: RiskLevel; reason: string; checks: string[] }[] = []

  for (const file of changedFiles) {
    for (const rule of riskRules) {
      if (rule.pattern.test(file)) {
        matchedReasons.push({ risk: rule.risk, reason: rule.reason, checks: rule.checks })
        break
      }
    }
  }

  if (matchedReasons.length === 0) {
    return { risk: "low", reasons: [], reviewRequired: false, requiredChecks: [] }
  }

  const highestRisk = matchedReasons.reduce<RiskLevel>((highest, match) => {
    return riskOrder.indexOf(match.risk) > riskOrder.indexOf(highest) ? match.risk : highest
  }, "low")

  const reasons = [...new Set(matchedReasons.map((m) => m.reason))]
  const requiredChecksSet = new Set<string>()
  for (const match of matchedReasons) {
    if (riskOrder.indexOf(match.risk) >= riskOrder.indexOf(highestRisk)) {
      for (const check of match.checks) requiredChecksSet.add(check)
    }
  }

  return {
    risk: highestRisk,
    reasons,
    reviewRequired: highestRisk === "high" || highestRisk === "critical",
    requiredChecks: [...requiredChecksSet],
  }
}

export function createPlaceholderDiffRiskResult(): DiffRiskResult {
  return {
    risk: "low",
    reasons: ["Diff risk analyzer placeholder is ready."],
    reviewRequired: false,
    requiredChecks: [],
  }
}

export async function analyzeGitDiff(rootPath: string): Promise<GitDiffSummary> {
  const insideWorkTree = await runGit(rootPath, ["rev-parse", "--is-inside-work-tree"])
  if (insideWorkTree.exitCode !== 0 || insideWorkTree.stdout.trim() !== "true")
    return emptyGitDiffSummary(["Not a Git repository."])

  const [nameOnly, numstat, stat] = await Promise.all([
    runGit(rootPath, ["diff", "--name-only"]),
    runGit(rootPath, ["diff", "--numstat"]),
    runGit(rootPath, ["diff", "--stat"]),
  ])

  return {
    ...parseNumstat(numstat.stdout),
    changedFiles: nameOnly.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    warnings: [nameOnly, numstat, stat]
      .filter((result) => result.exitCode !== 0)
      .map((result) => result.stderr.trim())
      .filter(Boolean),
    stat: stat.stdout.trim(),
  }
}

function parseNumstat(output: string) {
  const entries = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const totals = entries.reduce(
    (result, line) => {
      const [added, deleted] = line.split(/\s+/)
      return {
        addedLines: result.addedLines + parseGitLineCount(added),
        deletedLines: result.deletedLines + parseGitLineCount(deleted),
      }
    },
    { addedLines: 0, deletedLines: 0 },
  )

  return {
    filesChanged: entries.length,
    diffLines: totals.addedLines + totals.deletedLines,
    ...totals,
  }
}

function parseGitLineCount(value: string | undefined) {
  if (!value || value === "-") return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

async function runGit(rootPath: string, args: string[]) {
  try {
    const child = Bun.spawn(["git", ...args], {
      cwd: rootPath,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { stdout, stderr, exitCode }
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : "Git command failed.",
      exitCode: 1,
    }
  }
}

function emptyGitDiffSummary(warnings: string[]): GitDiffSummary {
  return {
    changedFiles: [],
    filesChanged: 0,
    diffLines: 0,
    addedLines: 0,
    deletedLines: 0,
    warnings,
    stat: "",
  }
}
