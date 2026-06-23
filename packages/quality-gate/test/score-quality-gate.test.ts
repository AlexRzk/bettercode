import { describe, expect, test } from "bun:test"
import { scoreQualityGate } from "../src"

describe("scoreQualityGate", () => {
  test("returns FAIL for build failures when build errors are blocking", () => {
    const result = scoreQualityGate({
      checks: [{ name: "build", status: "FAIL", durationMs: 1 }],
      filesChanged: 0,
      diffLines: 0,
    })

    expect(result.status).toBe("FAIL")
    expect(result.score).toBe(70)
    expect(result.blockingReasons).toEqual(["build failed"])
  })

  test("returns FAIL for typecheck failures when typecheck errors are blocking", () => {
    const result = scoreQualityGate({
      checks: [{ name: "typecheck", status: "FAIL", durationMs: 1 }],
      filesChanged: 0,
      diffLines: 0,
    })

    expect(result.status).toBe("FAIL")
    expect(result.score).toBe(75)
    expect(result.blockingReasons).toEqual(["typecheck failed"])
  })

  test("returns WARN when tests are absent and missing tests are warnings", () => {
    const result = scoreQualityGate({
      checks: [{ name: "test", status: "SKIPPED", durationMs: 0, reason: "No test script found" }],
      filesChanged: 0,
      diffLines: 0,
    })

    expect(result.status).toBe("WARN")
    expect(result.score).toBe(95)
    expect(result.warnings).toEqual(["No test script found"])
    expect(result.blockingReasons).toEqual([])
  })

  test("subtracts several penalties deterministically", () => {
    const result = scoreQualityGate({
      checks: [
        { name: "lint", status: "FAIL", durationMs: 1 },
        { name: "test", status: "FAIL", durationMs: 1 },
        { name: "format", status: "FAIL", durationMs: 1 },
      ],
      filesChanged: 13,
      diffLines: 501,
    })

    expect(result.status).toBe("FAIL")
    expect(result.score).toBe(40)
  })

  test("respects pass and warn thresholds", () => {
    expect(
      scoreQualityGate({
        checks: [{ name: "lint", status: "FAIL", durationMs: 1 }],
        filesChanged: 0,
        diffLines: 0,
      }).status,
    ).toBe("PASS")
    expect(
      scoreQualityGate({
        checks: [{ name: "test", status: "FAIL", durationMs: 1 }],
        filesChanged: 0,
        diffLines: 0,
      }).status,
    ).toBe("WARN")
    expect(
      scoreQualityGate({
        checks: [
          { name: "lint", status: "FAIL", durationMs: 1 },
          { name: "test", status: "FAIL", durationMs: 1 },
        ],
        filesChanged: 13,
        diffLines: 501,
      }).status,
    ).toBe("FAIL")
  })

  test("sets score to zero when a secret is detected", () => {
    const result = scoreQualityGate({
      checks: [],
      filesChanged: 0,
      diffLines: 0,
      secretDetected: true,
    })

    expect(result.status).toBe("FAIL")
    expect(result.score).toBe(0)
    expect(result.blockingReasons).toEqual(["secret detected"])
  })
})
