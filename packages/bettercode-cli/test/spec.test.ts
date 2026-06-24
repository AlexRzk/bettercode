import { describe, it, expect, afterEach } from "bun:test"
import { generateSpec, inferLikelyFiles } from "../src/spec"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

let fixtureDir: string

afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true })
    fixtureDir = ""
  }
})

function makeFixture(prefix: string) {
  fixtureDir = mkdtempSync(join(tmpdir(), `spec-${prefix}-`))
  return fixtureDir
}

describe("inferLikelyFiles", () => {
  it("returns empty array for description with no matches", () => {
    const result = inferLikelyFiles("refactor internal helper", [])
    expect(result).toEqual([])
  })

  it("matches blog/SEO keywords", () => {
    const result = inferLikelyFiles("update the blog post metadata", [])
    expect(result).toEqual(expect.arrayContaining(["src/app/blog", "src/app/posts", "pages/blog"]))
  })

  it("matches auth/login keywords", () => {
    const result = inferLikelyFiles("add login session token", [])
    expect(result).toEqual(expect.arrayContaining(["src/auth", "src/middleware.ts"]))
  })

  it("matches API endpoint keywords", () => {
    const result = inferLikelyFiles("add new api endpoint for fetch", [])
    expect(result).toEqual(expect.arrayContaining(["src/app/api", "src/lib/api"]))
  })

  it("matches UI/component keywords", () => {
    const result = inferLikelyFiles("redesign form button component", [])
    expect(result).toEqual(expect.arrayContaining(["src/components", "src/styles"]))
  })

  it("matches multiple keyword categories", () => {
    const result = inferLikelyFiles("add auth endpoint with api", [])
    expect(result).toEqual(expect.arrayContaining(["src/auth", "src/app/api"]))
  })

  it("dedupes results across categories", () => {
    const result = inferLikelyFiles("auth api login", [])
    const unique = new Set(result)
    expect(result.length).toBe(unique.size)
  })

  it("falls back to diff file directories when no keyword match", () => {
    const result = inferLikelyFiles("some random description", ["src/foo/bar.ts", "src/foo/baz.ts", "lib/utils.ts"])
    expect(result).toEqual(expect.arrayContaining(["src/**", "lib/**"]))
  })
})

describe("generateSpec", () => {
  it("generates spec with low risk for empty diff", async () => {
    const root = makeFixture("spec-low-risk")
    const spec = await generateSpec(root, "update readme")

    expect(spec.goal).toBe("update readme")
    expect(spec.risks).toEqual([])
    expect(spec.requiredChecks).toEqual(["lint"])
    expect(spec.acceptanceCriteria.some((c) => c.includes("update readme"))).toBe(true)
  })

  it("includes brain alignment criterion when profile exists", async () => {
    const root = makeFixture("spec-brain")
    mkdirSync(join(root, ".bettercode", "brain"), { recursive: true })
    writeFileSync(join(root, ".bettercode", "brain", "profile.md"), "# Project Profile\n\n## Stack\n- Type: node\n")

    const spec = await generateSpec(root, "add feature")

    expect(spec.acceptanceCriteria).toEqual(expect.arrayContaining(["Changes align with project profile"]))
  })

  it("does not include brain criterion when profile is absent", async () => {
    const root = makeFixture("spec-no-brain")
    const spec = await generateSpec(root, "add feature")

    expect(spec.acceptanceCriteria).not.toEqual(expect.arrayContaining([expect.stringContaining("project profile")]))
  })

  it("infers required checks from risk level", async () => {
    const root = makeFixture("spec-risk-checks")
    const spec = await generateSpec(root, "add feature")

    // No diff, so risk is low
    expect(spec.requiredChecks).toEqual(["lint"])
  })

  it("handles missing brain profile gracefully", async () => {
    const root = makeFixture("spec-missing-brain")
    const spec = await generateSpec(root, "do something")

    expect(spec.goal).toBe("do something")
    expect(spec.acceptanceCriteria.length).toBeGreaterThanOrEqual(2)
  })
})
