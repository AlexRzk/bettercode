import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { analyzeDiffRisk, analyzeGitDiff } from "@bettercode/diff-risk"

export interface Spec {
  goal: string
  nonGoals: string[]
  likelyFiles: string[]
  risks: string[]
  requiredChecks: string[]
  acceptanceCriteria: string[]
}

const keywordFileMap: [RegExp, string[]][] = [
  [/\b(blog|seo|metadata|post|article)\b/i, ["src/app/blog", "src/app/posts", "pages/blog"]],
  [/\b(api|endpoint|route|fetch)\b/i, ["src/app/api", "src/lib/api"]],
  [/\b(auth|login|session|token|password)\b/i, ["src/auth", "src/middleware.ts"]],
  [/\b(style|ui|component|button|form|layout)\b/i, ["src/components", "src/styles"]],
  [/\b(test|spec|e2e)\b/i, ["src/**/*.test.*", "src/**/*.spec.*", "__tests__"]],
  [/\b(config|env|environment)\b/i, [".env*", "src/config"]],
  [/\b(database|db|prisma|migration|schema)\b/i, ["prisma", "src/db"]],
  [/\b(deploy|ci|pipeline|docker)\b/i, ["Dockerfile", ".github/workflows", "docker-compose"]],
]

const riskChecksMap: Record<string, string[]> = {
  low: ["lint"],
  medium: ["lint", "typecheck", "build"],
  high: ["lint", "typecheck", "test", "build"],
  critical: ["lint", "typecheck", "test", "build"],
}

export async function generateSpec(root: string, description: string): Promise<Spec> {
  let risk: string = "low"
  let diffSummary: string[] = []

  try {
    const diff = await analyzeGitDiff(root)
    if (diff.changedFiles.length > 0) {
      const riskResult = analyzeDiffRisk(diff.changedFiles)
      risk = riskResult.risk
      diffSummary = diff.changedFiles.slice(0, 10)
    }
  } catch {
    // ignore diff errors
  }

  let brainContext = ""
  try {
    const brainPath = join(root, ".bettercode", "brain", "profile.md")
    if (existsSync(brainPath)) {
      brainContext = readFileSync(brainPath, "utf8")
    }
  } catch {
    // ignore brain errors
  }

  const likelyFiles = inferLikelyFiles(description, diffSummary)
  const requiredChecks = riskChecksMap[risk] ?? riskChecksMap.low

  const risks: string[] = []
  if (risk === "high" || risk === "critical") {
    risks.push(`Diff risk is ${risk}`)
  }
  if (diffSummary.length > 5) {
    risks.push(`${diffSummary.length} files currently modified`)
  }

  const acceptanceCriteria = [
    `Change addresses: ${description}`,
    `${requiredChecks.join(", ")} must pass`,
  ]

  if (brainContext) {
    acceptanceCriteria.push("Changes align with project profile")
  }

  return {
    goal: description,
    nonGoals: [],
    likelyFiles,
    risks,
    requiredChecks,
    acceptanceCriteria,
  }
}

export function inferLikelyFiles(description: string, diffFiles: string[]): string[] {
  const matches: string[] = []

  for (const [pattern, paths] of keywordFileMap) {
    if (pattern.test(description)) {
      matches.push(...paths)
    }
  }

  if (diffFiles.length > 0 && matches.length === 0) {
    const dirs = new Set<string>()
    for (const file of diffFiles) {
      const parts = file.split("/")
      if (parts.length > 1) dirs.add(parts[0]!)
    }
    for (const dir of dirs) matches.push(`${dir}/**`)
  }

  return [...new Set(matches)]
}
