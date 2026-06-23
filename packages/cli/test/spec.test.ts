import { describe, expect, test } from "bun:test"
import { generateSpec, inferLikelyFiles } from "../src/spec"

describe("inferLikelyFiles", () => {
  test("returns empty for no matches", () => {
    expect(inferLikelyFiles("fix typo", [])).toEqual([])
  })

  test("maps blog keywords", () => {
    const result = inferLikelyFiles("add blog post page", [])
    expect(result).toContain("src/app/blog")
    expect(result).toContain("src/app/posts")
  })

  test("maps api keywords", () => {
    const result = inferLikelyFiles("create new API endpoint", [])
    expect(result).toContain("src/app/api")
    expect(result).toContain("src/lib/api")
  })

  test("maps auth keywords", () => {
    const result = inferLikelyFiles("fix login session bug", [])
    expect(result).toContain("src/auth")
    expect(result).toContain("src/middleware.ts")
  })

  test("maps ui keywords", () => {
    const result = inferLikelyFiles("redesign button component", [])
    expect(result).toContain("src/components")
    expect(result).toContain("src/styles")
  })

  test("maps test keywords", () => {
    const result = inferLikelyFiles("add e2e tests", [])
    expect(result.some((f) => f.includes("test"))).toBe(true)
  })

  test("falls back to diff file directories", () => {
    const result = inferLikelyFiles("fix typo", ["src/utils/helper.ts", "lib/format.ts"])
    expect(result).toContain("src/**")
    expect(result).toContain("lib/**")
  })

  test("deduplicates results", () => {
    const result = inferLikelyFiles("auth API endpoint", [])
    expect(new Set(result).size).toBe(result.length)
  })
})

describe("generateSpec", () => {
  test("returns valid JSON structure", async () => {
    const spec = await generateSpec(process.cwd(), "add user authentication")
    expect(spec).toHaveProperty("goal")
    expect(spec).toHaveProperty("nonGoals")
    expect(spec).toHaveProperty("likelyFiles")
    expect(spec).toHaveProperty("risks")
    expect(spec).toHaveProperty("requiredChecks")
    expect(spec).toHaveProperty("acceptanceCriteria")
    expect(spec.goal).toBe("add user authentication")
  })

  test("includes keyword-based likely files", async () => {
    const spec = await generateSpec(process.cwd(), "add blog SEO metadata")
    expect(spec.likelyFiles.some((f) => f.includes("blog"))).toBe(true)
  })

  test("does not crash when brain does not exist", async () => {
    const spec = await generateSpec(process.cwd(), "simple fix")
    expect(spec.goal).toBe("simple fix")
    expect(Array.isArray(spec.requiredChecks)).toBe(true)
  })

  test("required checks are non-empty", async () => {
    const spec = await generateSpec(process.cwd(), "update configuration")
    expect(spec.requiredChecks.length).toBeGreaterThan(0)
  })

  test("acceptance criteria include the description", async () => {
    const spec = await generateSpec(process.cwd(), "fix login bug")
    expect(spec.acceptanceCriteria.some((c) => c.includes("fix login bug"))).toBe(true)
  })
})
