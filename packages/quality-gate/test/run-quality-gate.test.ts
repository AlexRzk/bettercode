import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { runQualityGate } from "../src"

const fixtures = join(import.meta.dir, "fixtures", "gate")

describe("runQualityGate", () => {
  test("marks successful commands as PASS", async () => {
    const result = await runQualityGate(join(fixtures, "pass"))

    expect(result.status).toBe("PASS")
    expect(result.score).toBe(100)
    expect(result.checks.map((check) => check.status)).toEqual(["PASS", "PASS", "PASS", "PASS"])
  })

  test("marks failing commands as FAIL", async () => {
    const result = await runQualityGate(join(fixtures, "fail"))

    expect(result.status).toBe("FAIL")
    expect(result.score).toBe(0)
    expect(result.checks[0]?.status).toBe("PASS")
    expect(result.checks[1]?.status).toBe("FAIL")
    expect(result.blockingReasons).toEqual(["typecheck failed"])
  })

  test("marks absent scripts as SKIPPED without inventing commands", async () => {
    const result = await runQualityGate(join(fixtures, "missing"))

    expect(result.status).toBe("PASS")
    expect(result.checks).toEqual([
      { name: "lint", status: "SKIPPED", durationMs: 0, reason: "No lint script found" },
      { name: "typecheck", status: "SKIPPED", durationMs: 0, reason: "No typecheck script found" },
      { name: "test", status: "SKIPPED", durationMs: 0, reason: "No test script found" },
      { name: "build", status: "SKIPPED", durationMs: 0, reason: "No build script found" },
    ])
  })

  test("truncates long stderr output without crashing", async () => {
    const result = await runQualityGate(join(fixtures, "long-stderr"))

    expect(result.status).toBe("PASS")
    expect(result.checks[0]?.status).toBe("PASS")
    expect(result.checks[0]?.output?.length).toBeLessThan(4100)
    expect(result.checks[0]?.output).toContain("[output truncated]")
  })
})
