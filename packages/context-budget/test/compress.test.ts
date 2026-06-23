import { describe, expect, test } from "bun:test"
import { approxTokens, compressLogs, compressDiff, limitTextByBudget, selectRelevantBrainSections } from "../src"

describe("approxTokens", () => {
  test("estimates tokens as chars / 4", () => {
    expect(approxTokens("1234")).toBe(1)
    expect(approxTokens("12345")).toBe(2)
    expect(approxTokens("")).toBe(0)
  })
})

describe("compressLogs", () => {
  test("returns empty for empty input", () => {
    expect(compressLogs("")).toBe("")
  })

  test("returns short logs unchanged", () => {
    const input = "line one\nline two\nline three"
    expect(compressLogs(input)).toBe(input)
  })

  test("keeps error lines when long", () => {
    const errorLine = "TypeError: Cannot read property 'map' of undefined"
    const padding = Array.from({ length: 200 }, (_, i) => `info: process ${i} running`).join("\n")
    const input = `${padding}\n${errorLine}`
    const result = compressLogs(input, { maxTokens: 50 })
    expect(result).toContain("TypeError")
    expect(result).toContain("[truncated]")
  })

  test("keeps FAIL lines", () => {
    const input = "info: ok\nFAIL: build failed\ninfo: ok\ninfo: ok"
    const result = compressLogs(input, { maxTokens: 20 })
    expect(result).toContain("FAIL")
  })

  test("keeps exception lines", () => {
    const input = "info: running\nException: something broke\ninfo: running"
    const result = compressLogs(input, { maxTokens: 20 })
    expect(result).toContain("Exception")
  })

  test("result does not exceed budget", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `log line ${i}: some message`).join("\n")
    const result = compressLogs(lines, { maxTokens: 100 })
    expect(approxTokens(result)).toBeLessThanOrEqual(110)
  })

  test("result does not exceed budget when many errors", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `Error ${i}: failed at step ${i}`).join("\n")
    const result = compressLogs(lines, { maxTokens: 50 })
    expect(approxTokens(result)).toBeLessThanOrEqual(60)
  })
})

describe("compressDiff", () => {
  test("returns empty for empty input", () => {
    expect(compressDiff("")).toBe("")
  })

  test("returns short diff unchanged", () => {
    const input = "diff --git a/file.ts b/file.ts\n@@ -1 +1 @@\n-old\n+new"
    expect(compressDiff(input)).toBe(input)
  })

  test("truncates long diffs", () => {
    const hunk = Array.from({ length: 200 }, (_, i) => `+line ${i}`).join("\n")
    const input = `diff --git a/file.ts b/file.ts\n@@ -1 +1 @@\n${hunk}`
    const result = compressDiff(input, { maxTokens: 100 })
    expect(result.length).toBeLessThanOrEqual(400 + 50)
    expect(result).toContain("[diff truncated]")
  })

  test("preserves file headers in long diff", () => {
    const hunk = Array.from({ length: 300 }, (_, i) => `+line ${i}`).join("\n")
    const input = `diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n${hunk}`
    const result = compressDiff(input, { maxTokens: 100 })
    expect(result).toContain("diff --git")
  })

  test("result is never longer than original", () => {
    const hunk = Array.from({ length: 500 }, (_, i) => `+line ${i}`).join("\n")
    const input = `diff --git a/file.ts b/file.ts\n@@ -1 +1 @@\n${hunk}`
    const result = compressDiff(input, { maxTokens: 50 })
    expect(result.length).toBeLessThanOrEqual(input.length)
  })
})

describe("limitTextByBudget", () => {
  test("returns empty for empty input", () => {
    expect(limitTextByBudget("", 100)).toBe("")
  })

  test("returns short text unchanged", () => {
    expect(limitTextByBudget("hello", 100)).toBe("hello")
  })

  test("truncates long text", () => {
    const text = "a".repeat(1000)
    const result = limitTextByBudget(text, 100)
    expect(approxTokens(result)).toBeLessThanOrEqual(110)
    expect(result).toContain("[truncated]")
  })

  test("result does not exceed budget", () => {
    const text = "word ".repeat(500)
    const result = limitTextByBudget(text, 50)
    expect(approxTokens(result)).toBeLessThanOrEqual(60)
  })
})

describe("selectRelevantBrainSections", () => {
  test("returns empty for empty input", () => {
    expect(selectRelevantBrainSections("", "", 100)).toBe("")
  })

  test("returns empty for no match", () => {
    const brain = "## Stack\n- node\n\n## Package Manager\n- npm"
    expect(selectRelevantBrainSections("python", brain, 100)).toBe("")
  })

  test("returns matching sections", () => {
    const brain = "## Stack\n- Type: node\n\n## Package Manager\n- npm"
    const result = selectRelevantBrainSections("stack", brain, 100)
    expect(result).toContain("## Stack")
    expect(result).toContain("node")
  })

  test("respects token budget", () => {
    const sections = Array.from({ length: 20}, (_, i) => `## Section ${i}\n- content ${i}`).join("\n\n")
    const result = selectRelevantBrainSections("section", sections, 20)
    expect(approxTokens(result)).toBeLessThanOrEqual(30)
  })

  test("ranks by relevance", () => {
    const brain = "## Stack\n- Type: node\n\n## Errors\n- auth error\n\n## Deploy\n- aws"
    const result = selectRelevantBrainSections("error auth", brain, 200)
    expect(result).toContain("## Errors")
  })
})
