import { describe, expect, test, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { brainInit, brainUpdate, brainSearch } from "../src"

const fixtureDir = join(import.meta.dir, ".tmp")

function createFixture(name: string) {
  const dir = join(fixtureDir, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupFixture(name: string) {
  rmSync(join(fixtureDir, name), { recursive: true, force: true })
}

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

describe("brainInit", () => {
  test("creates brain files when absent", async () => {
    const dir = createFixture("init-new")
    const created = await brainInit(dir)

    expect(created).toContain("profile.md")
    expect(created).toContain("commands.md")
    expect(created).toContain("architecture.md")
    expect(created).toContain("known-errors.md")
    expect(created).toContain("quality-rules.md")
    expect(created).toContain("task-history.jsonl")
    expect(existsSync(join(dir, ".better-code", "brain", "profile.md"))).toBe(true)
  })

  test("does not overwrite existing files", async () => {
    const dir = createFixture("init-existing")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(join(dir, ".better-code", "brain", "profile.md"), "# Custom Profile\n")

    const created = await brainInit(dir)

    expect(created).not.toContain("profile.md")
    expect(readFileSync(join(dir, ".better-code", "brain", "profile.md"), "utf8")).toBe("# Custom Profile\n")
  })

  test("returns empty array when all files exist", async () => {
    const dir = createFixture("init-all-exist")
    await brainInit(dir)
    const created = await brainInit(dir)

    expect(created).toEqual([])
  })
})

describe("brainUpdate", () => {
  test("updates profile.md with detected stack", async () => {
    const dir = createFixture("update-stack")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { lint: "echo ok" } }))

    const result = await brainUpdate(dir)

    expect(result.profileUpdated).toBe(true)
    const profile = readFileSync(join(dir, ".better-code", "brain", "profile.md"), "utf8")
    expect(profile).toContain("## Stack")
    expect(profile).toContain("## Package Manager")
    expect(profile).toContain("## Available Commands")
    expect(profile).toContain("lint:")
  })

  test("does not erase existing profile content", async () => {
    const dir = createFixture("update-preserve")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(join(dir, ".better-code", "brain", "profile.md"), "# Existing\n\nCustom content\n")

    await brainUpdate(dir)

    const profile = readFileSync(join(dir, ".better-code", "brain", "profile.md"), "utf8")
    expect(profile).toContain("## Stack")
  })

  test("appends to task-history.jsonl when gate result exists", async () => {
    const dir = createFixture("update-history")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(
      join(dir, ".better-code", "last-gate-result.json"),
      JSON.stringify({ status: "PASS", score: 95, risk: "low" }),
    )

    const result = await brainUpdate(dir)

    expect(result.historyAppended).toBe(true)
    const history = readFileSync(join(dir, ".better-code", "brain", "task-history.jsonl"), "utf8")
    const lines = history.trim().split("\n")
    expect(lines.length).toBe(1)
    const entry = JSON.parse(lines[0]!)
    expect(entry.status).toBe("PASS")
    expect(entry.score).toBe(95)
    expect(entry.risk).toBe("low")
    expect(entry.timestamp).toBeDefined()
  })

  test("does not append when no gate result exists", async () => {
    const dir = createFixture("update-no-history")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })

    const result = await brainUpdate(dir)

    expect(result.historyAppended).toBe(false)
  })

  test("includes critical paths from config", async () => {
    const dir = createFixture("update-critical")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(
      join(dir, ".better-code", "quality-gate.json"),
      JSON.stringify({ criticalPaths: ["src/auth/**", "prisma/migrations/**"] }),
    )

    await brainUpdate(dir)

    const profile = readFileSync(join(dir, ".better-code", "brain", "profile.md"), "utf8")
    expect(profile).toContain("## Critical Paths")
    expect(profile).toContain("src/auth/**")
    expect(profile).toContain("prisma/migrations/**")
  })
})

describe("brainSearch", () => {
  test("finds matching lines in brain files", async () => {
    const dir = createFixture("search-match")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(join(dir, ".better-code", "brain", "quality-rules.md"), "# Quality Rules\n\n- Always run tests before commit\n- No secrets in code\n")

    const results = brainSearch(dir, "tests")

    expect(results.length).toBe(1)
    expect(results[0]!.file).toBe("quality-rules.md")
    expect(results[0]!.content).toContain("tests")
  })

  test("returns empty for no matches", async () => {
    const dir = createFixture("search-empty")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(join(dir, ".better-code", "brain", "quality-rules.md"), "# Quality Rules\n\n- Always run tests\n")

    const results = brainSearch(dir, "nonexistent")

    expect(results).toEqual([])
  })

  test("returns empty when brain dir does not exist", () => {
    const dir = createFixture("search-no-brain")
    const results = brainSearch(dir, "anything")
    expect(results).toEqual([])
  })

  test("searches across multiple brain files", async () => {
    const dir = createFixture("search-multi")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(join(dir, ".better-code", "brain", "profile.md"), "# Profile\n\nStack: node\n")
    writeFileSync(join(dir, ".better-code", "brain", "known-errors.md"), "# Known Errors\n\n- ECONNREFUSED when DB is down\n")

    const results = brainSearch(dir, "db")

    expect(results.length).toBe(1)
    expect(results[0]!.file).toBe("known-errors.md")
  })

  test("supports multi-term search", async () => {
    const dir = createFixture("search-multi-term")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(join(dir, ".better-code", "brain", "quality-rules.md"), "# Quality Rules\n\n- Run lint before commit\n- Run test before push\n")

    const results = brainSearch(dir, "run lint")

    expect(results.length).toBe(1)
    expect(results[0]!.content).toContain("lint")
  })

  test("skips task-history.jsonl", async () => {
    const dir = createFixture("search-skip-jsonl")
    mkdirSync(join(dir, ".better-code", "brain"), { recursive: true })
    writeFileSync(join(dir, ".better-code", "brain", "task-history.jsonl"), '{"status":"PASS"}\n')
    writeFileSync(join(dir, ".better-code", "brain", "profile.md"), "# Profile\n\n- Important rule\n")

    const results = brainSearch(dir, "PASS")

    expect(results.length).toBe(0)
  })
})
