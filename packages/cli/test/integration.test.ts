import { describe, expect, test, afterEach, beforeAll } from "bun:test"
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

const fixtureDir = join(import.meta.dir, ".tmp")
const cliPath = join(import.meta.dir, "..", "src", "bettercode.ts")

function runCli(args: string, cwd: string) {
  return execSync(`bun ${cliPath} ${args}`, { cwd, stdio: "pipe", encoding: "utf8", timeout: 60000 })
}

function runCliJson(args: string, cwd: string) {
  const out = runCli(`${args} --json`, cwd)
  return JSON.parse(out)
}

beforeAll(() => {
  mkdirSync(fixtureDir, { recursive: true })
  const nextDir = join(fixtureDir, "nextjs-app")
  mkdirSync(nextDir, { recursive: true })
  mkdirSync(join(nextDir, ".git"), { recursive: true })
  writeFileSync(join(nextDir, "package.json"), JSON.stringify({
    name: "test-nextjs",
    scripts: { lint: "echo ok", typecheck: "echo ok", test: "echo ok", build: "echo ok" },
  }))
  writeFileSync(join(nextDir, "next.config.ts"), "export default {}")
})

afterEach(() => {
  rmSync(join(fixtureDir, "nextjs-app", ".bettercode"), { recursive: true, force: true })
})

const appDir = () => join(fixtureDir, "nextjs-app")

describe("full CLI flow on Next.js fixture", () => {
  test("init creates config", () => {
    const out = runCli("init", appDir())
    expect(out).toContain("BetterCode initialized")
    expect(existsSync(join(appDir(), ".bettercode", "quality-gate.json"))).toBe(true)
    expect(existsSync(join(appDir(), ".bettercode", "brain", "profile.md"))).toBe(true)
  })

  test("init --json returns valid JSON", () => {
    const result = runCliJson("init", appDir())
    expect(result.status).toBe("ok")
    expect(result.configDir).toBe(".bettercode")
  })

  test("brain init creates brain files", () => {
    runCli("init", appDir())
    const result = runCliJson("brain init", appDir())
    expect(result.status).toBe("ok")
    expect(existsSync(join(appDir(), ".bettercode", "brain", "commands.md"))).toBe(true)
  })

  test("brain init --json returns valid JSON", () => {
    runCli("init", appDir())
    const result = runCliJson("brain init", appDir())
    expect(result.status).toBe("ok")
    expect(Array.isArray(result.created)).toBe(true)
  })

  test("spec generates a spec", () => {
    runCli("init", appDir())
    const result = runCliJson('spec "add blog page"', appDir())
    expect(result.goal).toBe("add blog page")
    expect(Array.isArray(result.requiredChecks)).toBe(true)
    expect(result.requiredChecks.length).toBeGreaterThan(0)
    expect(Array.isArray(result.likelyFiles)).toBe(true)
  }, 60000)

  test("gate run produces a result", () => {
    runCli("init", appDir())
    const result = runCliJson("gate run", appDir())
    expect(result).toHaveProperty("status")
    expect(result).toHaveProperty("score")
    expect(result).toHaveProperty("risk")
    expect(result).toHaveProperty("checks")
    expect(typeof result.score).toBe("number")
  }, 60000)

  test("brain update writes profile", () => {
    runCli("init", appDir())
    runCli("brain init", appDir())
    const result = runCliJson("brain update", appDir())
    expect(result.profileUpdated).toBe(true)
    const profile = readFileSync(join(appDir(), ".bettercode", "brain", "profile.md"), "utf8")
    expect(profile).toContain("## Stack")
  })

  test("brain search finds content", () => {
    runCli("init", appDir())
    runCli("brain init", appDir())
    runCli("brain update", appDir())
    const result = runCliJson('brain search node', appDir())
    expect(result.query).toBe("node")
    expect(Array.isArray(result.results)).toBe(true)
  })

  test("benchmark run produces a result", () => {
    runCli("init", appDir())
    const result = runCliJson("benchmark run", appDir())
    expect(result).toHaveProperty("id")
    expect(result).toHaveProperty("score")
    expect(result).toHaveProperty("duration_ms")
    expect(typeof result.score).toBe("number")
  }, 60000)

  test("report produces a summary", () => {
    runCli("init", appDir())
    runCli("brain init", appDir())
    const result = runCliJson("report", appDir())
    expect(result).toHaveProperty("gate")
    expect(result).toHaveProperty("brain")
    expect(result.gate).toHaveProperty("status")
    expect(result.brain).toHaveProperty("hasProfile")
  }, 60000)

  test("--root flag works", () => {
    const result = runCliJson(`--root ${appDir()} init`, appDir())
    expect(result.status).toBe("ok")
  })
})
