import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { detectProject } from "../src"

const fixtures = join(import.meta.dir, "fixtures")

describe("detectProject", () => {
  const cases = [
    ["node", "node"],
    ["nextjs", "nextjs"],
    ["vite", "vite"],
    ["python-pyproject", "python"],
    ["python-requirements", "python"],
    ["rust", "rust"],
    ["go", "go"],
    ["solidity-foundry", "solidity-foundry"],
    ["solidity-hardhat-ts", "solidity-hardhat"],
    ["solidity-hardhat-js", "solidity-hardhat"],
  ] as const

  for (const item of cases) {
    test(`detects ${item[1]} projects from ${item[0]}`, () => {
      expect(detectProject(join(fixtures, item[0])).type).toBe(item[1])
    })
  }

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
