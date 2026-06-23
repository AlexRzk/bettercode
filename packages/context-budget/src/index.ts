export interface CompressOptions {
  maxTokens?: number
  mode?: "aggressive" | "balanced" | "conservative"
}

export interface BudgetConfig {
  mode: "aggressive" | "balanced" | "conservative"
  maxMemoryTokens: number
  maxDiffTokens: number
  maxLogTokens: number
  maxReviewerRuns: number
  maxRepairAttempts: number
}

export const defaultBudget: BudgetConfig = {
  mode: "balanced",
  maxMemoryTokens: 2000,
  maxDiffTokens: 4000,
  maxLogTokens: 1500,
  maxReviewerRuns: 1,
  maxRepairAttempts: 3,
}

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function approxWords(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 0.75)
}

const errorPatterns = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /\bSyntaxError\b/,
  /\bRangeError\b/,
  /\bTS\d{4,6}\b/,
  /\bstack\b/i,
  /\bat\b/,
  /\bFAIL\b/,
  /\bpanic\b/i,
  /\bfatal\b/i,
  /\bcritical\b/i,
]

function isImportantLogLine(line: string): boolean {
  return errorPatterns.some((p) => p.test(line))
}

export function compressLogs(text: string, options?: CompressOptions): string {
  if (!text) return ""
  const maxTokens = options?.maxTokens ?? defaultBudget.maxLogTokens
  const maxChars = maxTokens * 4

  const lines = text.split("\n")
  const important: string[] = []
  const rest: string[] = []

  for (const line of lines) {
    if (isImportantLogLine(line)) {
      important.push(line)
    } else {
      rest.push(line)
    }
  }

  const importantText = important.join("\n")
  if (approxTokens(importantText) <= maxTokens) {
    const remaining = maxChars - importantText.length
    if (remaining > 0) {
      const restText = rest.join("\n")
      const trimmed = restText.length > remaining ? restText.slice(0, remaining) + "\n[truncated]" : restText
      return `${importantText}\n${trimmed}`.trim()
    }
    return importantText.trim()
  }

  return importantText.slice(0, maxChars).trim() + "\n[truncated]"
}

export function compressDiff(text: string, options?: CompressOptions): string {
  if (!text) return ""
  const maxTokens = options?.maxTokens ?? defaultBudget.maxDiffTokens
  const maxChars = maxTokens * 4

  if (text.length <= maxChars) return text

  const lines = text.split("\n")
  const kept: string[] = []
  let currentHunk: string[] = []
  let inHunk = false

  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@")) {
      if (inHunk && currentHunk.length > 0) {
        kept.push(...currentHunk)
        currentHunk = []
      }
      inHunk = true
      currentHunk.push(line)
    } else if (inHunk) {
      if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) {
        currentHunk.push(line)
      } else {
        if (currentHunk.length > 0) {
          kept.push(...currentHunk)
          currentHunk = []
        }
        inHunk = false
      }
    } else {
      kept.push(line)
    }
  }

  if (currentHunk.length > 0) kept.push(...currentHunk)

  const result = kept.join("\n")
  if (result.length <= maxChars) return result

  return result.slice(0, maxChars).trim() + "\n[diff truncated]"
}

export function limitTextByBudget(text: string, maxApproxTokens: number): string {
  if (!text) return ""
  const maxChars = maxApproxTokens * 4
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars).trim() + "\n[truncated]"
}

export function selectRelevantBrainSections(query: string, brainText: string, maxApproxTokens: number): string {
  if (!brainText || !query) return ""

  const sections = brainText.split(/^(?=## )/m).filter((s) => s.trim().length > 0)
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

  const scored = sections
    .map((section) => {
      const lower = section.toLowerCase()
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0)
      return { section, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return ""

  const maxChars = maxApproxTokens * 4
  const result: string[] = []
  let totalLen = 0

  for (const { section } of scored) {
    if (totalLen + section.length > maxChars) break
    result.push(section)
    totalLen += section.length
  }

  return result.join("").trim()
}
