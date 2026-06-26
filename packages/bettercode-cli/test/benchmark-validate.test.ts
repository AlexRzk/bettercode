import { describe, it, expect } from "bun:test"
import { runValidationCommands } from "../src/benchmark-validate"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("runValidationCommands", () => {
  it("runs a passing command", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-pass-"))
    try {
      const results = runValidationCommands(dir, ["echo hello"])
      expect(results.length).toBe(1)
      expect(results[0]!.passed).toBe(true)
      expect(results[0]!.exitCode).toBe(0)
      expect(results[0]!.output).toContain("hello")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("runs a failing command", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-fail-"))
    try {
      const results = runValidationCommands(dir, ["exit 1"])
      expect(results.length).toBe(1)
      expect(results[0]!.passed).toBe(false)
      expect(results[0]!.exitCode).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("runs multiple commands", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-multi-"))
    try {
      const results = runValidationCommands(dir, ["echo a", "echo b", "exit 1"])
      expect(results.length).toBe(3)
      expect(results[0]!.passed).toBe(true)
      expect(results[1]!.passed).toBe(true)
      expect(results[2]!.passed).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns error for nonexistent directory", () => {
    const results = runValidationCommands("/nonexistent-dir-12345", ["echo test"])
    expect(results.length).toBe(1)
    expect(results[0]!.passed).toBe(false)
    expect(results[0]!.error).toContain("does not exist")
  })

  it("returns empty array for empty commands", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-empty-"))
    try {
      const results = runValidationCommands(dir, [])
      expect(results).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("captures stderr output", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-stderr-"))
    try {
      const results = runValidationCommands(dir, ["echo error-msg >&2"])
      expect(results.length).toBe(1)
      expect(results[0]!.output).toContain("error-msg")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("reports duration", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-duration-"))
    try {
      const results = runValidationCommands(dir, ["echo done"])
      expect(results[0]!.durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
