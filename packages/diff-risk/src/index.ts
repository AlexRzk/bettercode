import type { DiffRiskResult, GitDiffSummary } from "@better-code/shared"

export function createPlaceholderDiffRiskResult(): DiffRiskResult {
  return {
    level: "low",
    score: 0,
    reasons: ["Diff risk analyzer placeholder is ready."],
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
