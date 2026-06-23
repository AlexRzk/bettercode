import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { loadProjectConfig, scoreQualityGate } from "../src"

const fixtureDir = join(import.meta.dir, "fixtures", "config")

function createFixture(name: string, content?: string) {
  const dir = join(fixtureDir, name)
  mkdirSync(join(dir, ".bettercode"), { recursive: true })
  if (content !== undefined) {
    writeFileSync(join(dir, ".bettercode", "quality-gate.json"), content)
  }
  return dir
}

function cleanupFixture(name: string) {
  rmSync(join(fixtureDir, name), { recursive: true, force: true })
}

describe("loadProjectConfig", () => {
  test("returns empty config when file is absent", () => {
    const dir = createFixture("absent")
    try {
      const config = loadProjectConfig(dir)
      expect(config).toEqual({})
    } finally {
      cleanupFixture("absent")
    }
  })

  test("reads valid config file", () => {
    const dir = createFixture(
      "valid",
      JSON.stringify({
        version: 1,
        thresholds: { passScore: 80, warnScore: 60 },
        rules: { failOnBuildError: false },
        commands: { lint: "eslint .", typecheck: "auto" },
        criticalPaths: ["src/**"],
      }),
    )
    try {
      const config = loadProjectConfig(dir)
      expect(config.version).toBe(1)
      expect(config.thresholds?.passScore).toBe(80)
      expect(config.thresholds?.warnScore).toBe(60)
      expect(config.rules?.failOnBuildError).toBe(false)
      expect(config.commands?.lint).toBe("eslint .")
      expect(config.commands?.typecheck).toBe("auto")
      expect(config.criticalPaths).toEqual(["src/**"])
    } finally {
      cleanupFixture("valid")
    }
  })

  test("returns empty config for unparseable JSON", () => {
    const dir = createFixture("unparseable", "{ invalid json }")
    try {
      const config = loadProjectConfig(dir)
      expect(config).toEqual({})
    } finally {
      cleanupFixture("unparseable")
    }
  })

  test("returns empty config for non-object JSON", () => {
    const dir = createFixture("not-object", '"just a string"')
    try {
      const config = loadProjectConfig(dir)
      expect(config).toEqual({})
    } finally {
      cleanupFixture("not-object")
    }
  })

  test("skips invalid threshold fields, keeps valid ones", () => {
    const dir = createFixture(
      "partial-thresholds",
      JSON.stringify({
        thresholds: { passScore: 80, warnScore: "bad", maxChangedFiles: 5 },
      }),
    )
    try {
      const config = loadProjectConfig(dir)
      expect(config.thresholds?.passScore).toBe(80)
      expect(config.thresholds?.warnScore).toBeUndefined()
      expect(config.thresholds?.maxChangedFiles).toBe(5)
    } finally {
      cleanupFixture("partial-thresholds")
    }
  })

  test("skips invalid rule fields, keeps valid ones", () => {
    const dir = createFixture(
      "partial-rules",
      JSON.stringify({
        rules: { failOnBuildError: false, failOnSecrets: "yes" },
      }),
    )
    try {
      const config = loadProjectConfig(dir)
      expect(config.rules?.failOnBuildError).toBe(false)
      expect(config.rules?.failOnSecrets).toBeUndefined()
    } finally {
      cleanupFixture("partial-rules")
    }
  })

  test("skips commands with non-string values", () => {
    const dir = createFixture(
      "invalid-commands",
      JSON.stringify({
        commands: { lint: "eslint .", test: 123 },
      }),
    )
    try {
      const config = loadProjectConfig(dir)
      expect(config.commands?.lint).toBe("eslint .")
      expect(config.commands?.test).toBeUndefined()
    } finally {
      cleanupFixture("invalid-commands")
    }
  })

  test("ignores unknown top-level keys", () => {
    const dir = createFixture(
      "extra-keys",
      JSON.stringify({
        version: 1,
        unknown: true,
        thresholds: { passScore: 85 },
      }),
    )
    try {
      const config = loadProjectConfig(dir)
      expect(config.version).toBe(1)
      expect(config.thresholds?.passScore).toBe(85)
      expect((config as any).unknown).toBeUndefined()
    } finally {
      cleanupFixture("extra-keys")
    }
  })
})

describe("scoreQualityGate with custom thresholds", () => {
  test("custom passScore threshold changes decision", () => {
    const result = scoreQualityGate({
      checks: [{ name: "lint", status: "FAIL", durationMs: 1 }],
      filesChanged: 0,
      diffLines: 0,
      thresholds: { passScore: 85 },
    })
    expect(result.status).toBe("PASS")
    expect(result.score).toBe(90)
  })

  test("custom warnScore threshold changes decision", () => {
    const withDefault = scoreQualityGate({
      checks: [
        { name: "lint", status: "FAIL", durationMs: 1 },
        { name: "test", status: "FAIL", durationMs: 1 },
      ],
      filesChanged: 0,
      diffLines: 0,
    })
    const withCustom = scoreQualityGate({
      checks: [
        { name: "lint", status: "FAIL", durationMs: 1 },
        { name: "test", status: "FAIL", durationMs: 1 },
      ],
      filesChanged: 0,
      diffLines: 0,
      thresholds: { warnScore: 60 },
    })
    expect(withDefault.status).toBe("FAIL")
    expect(withDefault.score).toBe(65)
    expect(withCustom.status).toBe("WARN")
    expect(withCustom.score).toBe(65)
  })

  test("maxChangedFiles influences score", () => {
    const loose = scoreQualityGate({
      checks: [],
      filesChanged: 13,
      diffLines: 0,
      thresholds: { maxChangedFiles: 20 },
    })
    const strict = scoreQualityGate({
      checks: [],
      filesChanged: 13,
      diffLines: 0,
      thresholds: { maxChangedFiles: 10 },
    })
    expect(loose.score).toBe(100)
    expect(strict.score).toBe(90)
  })

  test("maxDiffLines influences score", () => {
    const loose = scoreQualityGate({
      checks: [],
      filesChanged: 0,
      diffLines: 600,
      thresholds: { maxDiffLines: 1000 },
    })
    const strict = scoreQualityGate({
      checks: [],
      filesChanged: 0,
      diffLines: 600,
      thresholds: { maxDiffLines: 300 },
    })
    expect(loose.score).toBe(100)
    expect(strict.score).toBe(90)
  })
})
