import { describe, expect, test, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

const fixtureDir = join(import.meta.dir, ".tmp")
const cliPath = join(import.meta.dir, "..", "src", "bettercode.ts")

function createFixture(name: string, structure: Record<string, string>) {
  const dir = join(fixtureDir, name)
  mkdirSync(join(dir, ".git"), { recursive: true })
  for (const [relPath, content] of Object.entries(structure)) {
    const fullPath = join(dir, relPath)
    mkdirSync(join(fullPath, ".."), { recursive: true })
    writeFileSync(fullPath, content)
  }
  return dir
}

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

describe("legacy config migration", () => {
  test("migrates .better-code to .bettercode", () => {
    const dir = createFixture("migrate-basic", {
      ".better-code/quality-gate.json": '{"version":1}',
      ".better-code/brain/profile.md": "# Profile\n",
    })

    execSync(`bun ${cliPath} init`, { cwd: dir, stdio: "pipe" })

    expect(existsSync(join(dir, ".bettercode", "quality-gate.json"))).toBe(true)
    expect(readFileSync(join(dir, ".bettercode", "quality-gate.json"), "utf8")).toBe('{"version":1}')
    expect(existsSync(join(dir, ".bettercode", "brain", "profile.md"))).toBe(true)
    expect(readFileSync(join(dir, ".bettercode", "brain", "profile.md"), "utf8")).toBe("# Profile\n")
  })

  test("does not crash when .better-code/brain exists", () => {
    const dir = createFixture("migrate-brain-exists", {
      ".better-code/quality-gate.json": "{}",
      ".better-code/brain/profile.md": "# Profile\n",
      ".better-code/brain/commands.md": "# Commands\n",
    })

    const result = execSync(`bun ${cliPath} init`, { cwd: dir, stdio: "pipe" })
    expect(result).toBeDefined()
    expect(existsSync(join(dir, ".bettercode", "brain", "commands.md"))).toBe(true)
  })

  test("is idempotent - running twice does not fail", () => {
    const dir = createFixture("migrate-idempotent", {
      ".better-code/quality-gate.json": "{}",
    })

    execSync(`bun ${cliPath} init`, { cwd: dir, stdio: "pipe" })
    execSync(`bun ${cliPath} init`, { cwd: dir, stdio: "pipe" })

    expect(existsSync(join(dir, ".bettercode", "quality-gate.json"))).toBe(true)
  })

  test("does not overwrite edited migrated files on later commands", () => {
    const dir = createFixture("migrate-preserve-edits", {
      ".better-code/quality-gate.json": '{"legacy":true}',
      ".better-code/brain/profile.md": "# Legacy Profile\n",
    })

    execSync(`bun ${cliPath} init`, { cwd: dir, stdio: "pipe" })
    writeFileSync(join(dir, ".bettercode", "quality-gate.json"), '{"edited":true}')
    writeFileSync(join(dir, ".bettercode", "brain", "profile.md"), "# Edited Profile\n")
    execSync(`bun ${cliPath} brain init`, { cwd: dir, stdio: "pipe" })

    expect(readFileSync(join(dir, ".bettercode", "quality-gate.json"), "utf8")).toBe('{"edited":true}')
    expect(readFileSync(join(dir, ".bettercode", "brain", "profile.md"), "utf8")).toBe("# Edited Profile\n")
  })

  test("repairs missing files without overwriting existing migrated files", () => {
    const dir = createFixture("migrate-partial", {
      ".better-code/quality-gate.json": '{"legacy":true}',
      ".better-code/brain/profile.md": "# Legacy Profile\n",
      ".bettercode/quality-gate.json": '{"edited":true}',
    })

    execSync(`bun ${cliPath} brain init`, { cwd: dir, stdio: "pipe" })

    expect(readFileSync(join(dir, ".bettercode", "quality-gate.json"), "utf8")).toBe('{"edited":true}')
    expect(readFileSync(join(dir, ".bettercode", "brain", "profile.md"), "utf8")).toBe("# Legacy Profile\n")
  })
})
