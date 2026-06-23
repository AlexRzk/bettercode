import { describe, expect, test } from "bun:test"
import { analyzeDiffRisk } from "../src"

describe("analyzeDiffRisk", () => {
  test("returns LOW for README only", () => {
    const result = analyzeDiffRisk(["README.md"])
    expect(result.risk).toBe("low")
    expect(result.reasons).toEqual(["Documentation modified"])
    expect(result.reviewRequired).toBe(false)
    expect(result.requiredChecks).toEqual([])
  })

  test("returns LOW for docs only", () => {
    const result = analyzeDiffRisk(["docs/guide.md", "docs/api/reference.md"])
    expect(result.risk).toBe("low")
    expect(result.reasons).toEqual(["Documentation modified"])
    expect(result.reviewRequired).toBe(false)
  })

  test("returns LOW for CSS only", () => {
    const result = analyzeDiffRisk(["src/styles.css"])
    expect(result.risk).toBe("low")
    expect(result.reasons).toEqual(["Stylesheet modified"])
    expect(result.reviewRequired).toBe(false)
    expect(result.requiredChecks).toEqual(["test"])
  })

  test("returns MEDIUM for component", () => {
    const result = analyzeDiffRisk(["src/components/Button.tsx"])
    expect(result.risk).toBe("medium")
    expect(result.reasons).toEqual(["Component code modified"])
    expect(result.reviewRequired).toBe(false)
    expect(result.requiredChecks).toEqual(["typecheck", "test"])
  })

  test("returns HIGH for API route", () => {
    const result = analyzeDiffRisk(["src/app/api/users/route.ts"])
    expect(result.risk).toBe("high")
    expect(result.reasons).toEqual(["API route modified"])
    expect(result.reviewRequired).toBe(true)
    expect(result.requiredChecks).toEqual(["typecheck", "test", "build"])
  })

  test("returns HIGH for middleware", () => {
    const result = analyzeDiffRisk(["middleware.ts"])
    expect(result.risk).toBe("high")
    expect(result.reasons).toEqual(["Middleware modified"])
    expect(result.reviewRequired).toBe(true)
  })

  test("returns HIGH for package.json", () => {
    const result = analyzeDiffRisk(["package.json"])
    expect(result.risk).toBe("high")
    expect(result.reasons).toEqual(["Package manifest modified"])
    expect(result.reviewRequired).toBe(true)
  })

  test("returns HIGH for lockfile", () => {
    const result = analyzeDiffRisk(["bun.lockb"])
    expect(result.risk).toBe("high")
    expect(result.reasons).toEqual(["Lockfile modified"])
    expect(result.reviewRequired).toBe(true)
  })

  test("returns CRITICAL for Prisma migration", () => {
    const result = analyzeDiffRisk(["prisma/migrations/20240101_init/migration.sql"])
    expect(result.risk).toBe("critical")
    expect(result.reasons).toEqual(["Database migration modified"])
    expect(result.reviewRequired).toBe(true)
    expect(result.requiredChecks).toEqual(["typecheck", "test", "build"])
  })

  test("returns CRITICAL for .env", () => {
    const result = analyzeDiffRisk([".env"])
    expect(result.risk).toBe("critical")
    expect(result.reasons).toEqual(["Secrets file modified"])
    expect(result.reviewRequired).toBe(true)
  })

  test("returns CRITICAL for .env.local", () => {
    const result = analyzeDiffRisk([".env.local"])
    expect(result.risk).toBe("critical")
    expect(result.reasons).toEqual(["Secrets file modified"])
    expect(result.reviewRequired).toBe(true)
  })

  test("returns CRITICAL for Solidity contract", () => {
    const result = analyzeDiffRisk(["contracts/Token.sol"])
    expect(result.risk).toBe("critical")
    expect(result.reasons).toEqual(["Solidity contract modified"])
    expect(result.reviewRequired).toBe(true)
  })

  test("returns HIGH for auth code", () => {
    const result = analyzeDiffRisk(["src/auth/session.ts"])
    expect(result.risk).toBe("high")
    expect(result.reasons).toEqual(["Auth code modified"])
    expect(result.reviewRequired).toBe(true)
  })

  test("returns highest risk when multiple files changed", () => {
    const result = analyzeDiffRisk([
      "README.md",
      "src/components/Button.tsx",
      "src/app/api/users/route.ts",
    ])
    expect(result.risk).toBe("high")
    expect(result.reasons).toContain("API route modified")
    expect(result.reasons).toContain("Component code modified")
    expect(result.reasons).toContain("Documentation modified")
    expect(result.reviewRequired).toBe(true)
  })

  test("returns CRITICAL when mixed with lower risks", () => {
    const result = analyzeDiffRisk([
      "README.md",
      ".env",
      "src/components/Button.tsx",
    ])
    expect(result.risk).toBe("critical")
    expect(result.reviewRequired).toBe(true)
  })

  test("returns LOW with no reasons for unknown files", () => {
    const result = analyzeDiffRisk(["src/utils/helper.ts"])
    expect(result.risk).toBe("low")
    expect(result.reasons).toEqual([])
    expect(result.reviewRequired).toBe(false)
    expect(result.requiredChecks).toEqual([])
  })

  test("returns LOW for empty file list", () => {
    const result = analyzeDiffRisk([])
    expect(result.risk).toBe("low")
    expect(result.reasons).toEqual([])
    expect(result.reviewRequired).toBe(false)
  })

  test("deduplicates reasons", () => {
    const result = analyzeDiffRisk(["src/app/api/a/route.ts", "src/app/api/b/route.ts"])
    expect(result.reasons).toEqual(["API route modified"])
  })
})
