import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { runQualityGate } from "../src"

const fixtures = join(import.meta.dir, "fixtures", "gate")
const diffFixture = join(fixtures, "diff")

afterEach(async () => {
  await rm(diffFixture, { recursive: true, force: true })
})

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
    expect(result.score).toBe(70)
    expect(result.checks[0]?.status).toBe("PASS")
    expect(result.checks[1]?.status).toBe("FAIL")
    expect(result.blockingReasons).toEqual(["typecheck failed"])
  })

  test("marks absent scripts as SKIPPED without inventing commands", async () => {
    const result = await runQualityGate(join(fixtures, "missing"))

    expect(result.status).toBe("WARN")
    expect(result.score).toBe(95)
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

  test("includes git diff summary", async () => {
    const root = diffFixture
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    await run(root, ["init"])
    await run(root, ["config", "user.email", "test@example.com"])
    await run(root, ["config", "user.name", "Test User"])
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: {} }))
    await writeFile(join(root, "file.txt"), "one\n")
    await run(root, ["add", "."])
    await run(root, ["commit", "-m", "initial"])
    await writeFile(join(root, "file.txt"), "one\ntwo\n")

    const result = await runQualityGate(root)

    expect(result.filesChanged).toBe(1)
    expect(result.diffLines).toBe(1)
  })
})

async function run(cwd: string, args: string[]) {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(await new Response(child.stderr).text())
}
