import { describe, it, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"

const CLI_PATH = join(import.meta.dir, "..", "src", "index.ts")

let fixtureDir: string

afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true })
    fixtureDir = ""
  }
})

function makeFixture(prefix: string) {
  fixtureDir = mkdtempSync(join(tmpdir(), `bettercode-setup-${prefix}-`))
  return fixtureDir
}

function runCli(args: string[], cwd: string) {
  return execFileSync("bun", ["run", CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
    stdio: ["pipe", "pipe", "pipe"],
  })
}

describe("bettercode setup --no-input", () => {
  it("creates all expected files", () => {
    fixtureDir = makeFixture("setup-full")
    const output = runCli(["--no-input", "setup"], fixtureDir)

    expect(existsSync(join(fixtureDir, ".bettercode", "quality-gate.json"))).toBe(true)
    expect(existsSync(join(fixtureDir, ".bettercode", "brain", "profile.md"))).toBe(true)
    expect(existsSync(join(fixtureDir, ".bettercode", "bettercode.jsonc"))).toBe(true)
    expect(existsSync(join(fixtureDir, ".opencode", "plugin", "bettercode.js"))).toBe(true)
    expect(output).toContain("bettercode setup complete")
  })

  it("runs doctor at the end", () => {
    fixtureDir = makeFixture("setup-doctor")
    const output = runCli(["--no-input", "setup"], fixtureDir)

    expect(output).toContain("Health check")
  })

  it("is idempotent", () => {
    fixtureDir = makeFixture("setup-idempotent")
    runCli(["--no-input", "setup"], fixtureDir)
    const output2 = runCli(["--no-input", "setup"], fixtureDir)

    expect(output2).toContain("bettercode setup complete")
  })

  it("creates valid bettercode.jsonc with sensible defaults", () => {
    fixtureDir = makeFixture("setup-config")
    runCli(["--no-input", "setup"], fixtureDir)

    const raw = readFileSync(join(fixtureDir, ".bettercode", "bettercode.jsonc"), "utf8")
    const config = JSON.parse(raw)
    expect(config.plugin.brain.autoInject).toBe(true)
    expect(config.plugin.brain.maxTokens).toBe(2000)
    expect(config.plugin.qualityGate.autoRun).toBe(false)
    expect(config.plugin.contextBudget.mode).toBe("balanced")
  })
})

describe("bettercode setup --no-brain", () => {
  it("skips brain init but still creates quality-gate.json", () => {
    fixtureDir = makeFixture("setup-no-brain")
    runCli(["--no-input", "--no-brain", "setup"], fixtureDir)

    expect(existsSync(join(fixtureDir, ".bettercode", "quality-gate.json"))).toBe(true)
    expect(existsSync(join(fixtureDir, ".bettercode", "brain"))).toBe(false)
  })
})

describe("bettercode setup --no-plugin", () => {
  it("skips plugin sync", () => {
    fixtureDir = makeFixture("setup-no-plugin")
    runCli(["--no-input", "--no-plugin", "setup"], fixtureDir)

    expect(existsSync(join(fixtureDir, ".opencode", "plugin", "bettercode.js"))).toBe(false)
  })
})

describe("bettercode setup --no-options", () => {
  it("skips options config", () => {
    fixtureDir = makeFixture("setup-no-options")
    runCli(["--no-input", "--no-options", "setup"], fixtureDir)

    expect(existsSync(join(fixtureDir, ".bettercode", "bettercode.jsonc"))).toBe(false)
    expect(existsSync(join(fixtureDir, ".bettercode", "quality-gate.json"))).toBe(true)
    expect(existsSync(join(fixtureDir, ".opencode", "plugin", "bettercode.js"))).toBe(true)
  })
})
