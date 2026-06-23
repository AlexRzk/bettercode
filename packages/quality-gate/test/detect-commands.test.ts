import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { detectAvailableCommands, detectPackageManager } from "../src"

const fixtures = join(import.meta.dir, "fixtures", "commands")

describe("detectPackageManager", () => {
  test("detects npm", () => {
    expect(detectPackageManager(join(fixtures, "npm"))).toBe("npm")
  })

  test("detects pnpm", () => {
    expect(detectPackageManager(join(fixtures, "pnpm"))).toBe("pnpm")
  })

  test("detects yarn", () => {
    expect(detectPackageManager(join(fixtures, "yarn"))).toBe("yarn")
  })

  test("detects bun", () => {
    expect(detectPackageManager(join(fixtures, "bun"))).toBe("bun")
  })

  test("defaults to npm", () => {
    expect(detectPackageManager(join(fixtures, "missing-package-json"))).toBe("npm")
  })
})

describe("detectAvailableCommands", () => {
  test("detects existing scripts and formats npm commands", () => {
    expect(detectAvailableCommands(join(fixtures, "npm"))).toEqual({
      lint: { name: "lint", command: "npm run lint", available: true },
      typecheck: { name: "typecheck", command: "npm run typecheck", available: true },
      test: { name: "test", command: "npm run test", available: true },
      build: { name: "build", command: "npm run build", available: true },
      format: { name: "format", command: "npm run format", available: true },
      "format:check": { name: "format:check", command: "npm run format:check", available: true },
    })
  })

  test("formats pnpm commands", () => {
    expect(detectAvailableCommands(join(fixtures, "pnpm")).lint?.command).toBe("pnpm lint")
  })

  test("formats yarn commands", () => {
    expect(detectAvailableCommands(join(fixtures, "yarn")).lint?.command).toBe("yarn lint")
  })

  test("formats bun commands", () => {
    expect(detectAvailableCommands(join(fixtures, "bun")).lint?.command).toBe("bun run lint")
  })

  test("does not invent missing scripts", () => {
    expect(detectAvailableCommands(join(fixtures, "partial"))).toEqual({
      lint: { name: "lint", command: "npm run lint", available: true },
    })
  })

  test("does not crash without package.json", () => {
    expect(detectAvailableCommands(join(fixtures, "missing-package-json"))).toEqual({})
  })

  test("does not crash with invalid package.json", () => {
    expect(detectAvailableCommands(join(fixtures, "invalid-package-json"))).toEqual({})
  })
})
