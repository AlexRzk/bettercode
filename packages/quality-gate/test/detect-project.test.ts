import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { detectProject } from "../src"

const fixtures = join(import.meta.dir, "fixtures")

describe("detectProject", () => {
  test("detects node projects", () => {
    expect(detectProject(join(fixtures, "node")).type).toBe("node")
  })

  test("detects nextjs projects", () => {
    expect(detectProject(join(fixtures, "nextjs")).type).toBe("nextjs")
  })

  test("detects vite projects", () => {
    expect(detectProject(join(fixtures, "vite")).type).toBe("vite")
  })

  test("returns unknown without matching files", () => {
    expect(detectProject(join(fixtures, "unknown")).type).toBe("unknown")
  })

  test("does not crash when the root path is missing", () => {
    expect(detectProject(join(fixtures, "missing")).type).toBe("unknown")
  })

  test("prioritizes nextjs over node", () => {
    expect(detectProject(join(fixtures, "nextjs")).type).toBe("nextjs")
  })
})
