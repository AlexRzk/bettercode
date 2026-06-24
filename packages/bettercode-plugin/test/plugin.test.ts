import { describe, it, expect, afterEach } from "bun:test"
import pluginModule from "../src/index"
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

function makeInput(dir: string) {
  return {
    client: {} as any,
    project: {} as any,
    directory: dir,
    worktree: dir,
    experimental_workspace: { register: () => {} },
    serverUrl: new URL("http://localhost:3000"),
    $: {} as any,
  }
}

const toolContext = (dir: string) => ({
  directory: dir,
  worktree: dir,
  sessionID: "test",
  messageID: "m1",
  agent: "test",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
})

const modelStub = { providerID: "test", id: "test", name: "test" } as any

function makeFixture(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), `bettercode-plugin-${prefix}-`))
  return root
}

let activeRoot: string

afterEach(() => {
  if (activeRoot) {
    rmSync(activeRoot, { recursive: true, force: true })
    activeRoot = ""
  }
})

describe("plugin module shape", () => {
  it("default-exports { id, server }", () => {
    expect(pluginModule.id).toBe("bettercode")
    expect(typeof pluginModule.server).toBe("function")
  })
})

describe("experimental.chat.system.transform", () => {
  it("injects brain sections into system prompt", async () => {
    activeRoot = makeFixture("system-transform")
    mkdirSync(join(activeRoot, ".bettercode", "brain"), { recursive: true })
    const brainPath = join(activeRoot, ".bettercode", "brain", "profile.md")
    writeFileSync(brainPath, [
      "# Project Profile",
      "",
      "## Stack",
      "- Type: node",
      "- Framework: Express",
      "",
      "## Package Manager",
      "- bun",
      "",
      "## Available Commands",
      "- typecheck: bun run typecheck",
      "- test: bun test",
      "",
    ].join("\n"))

    const hooks = await pluginModule.server(makeInput(activeRoot), {})
    const output = { system: ["base system prompt"] }
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system.length).toBeGreaterThan(1)
    const injected = output.system.join("\n")
    expect(injected).toContain("Stack")
    expect(injected).toContain("Package Manager")
    expect(injected).toContain("bun")
  })

  it("does not inject if brain file is missing", async () => {
    activeRoot = makeFixture("system-transform-missing")
    const hooks = await pluginModule.server(makeInput("/nonexistent"), {})
    const output = { system: ["base system prompt"] }
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system).toEqual(["base system prompt"])
  })

  it("does not inject if brain file is empty", async () => {
    activeRoot = makeFixture("system-transform-empty")
    mkdirSync(join(activeRoot, ".bettercode", "brain"), { recursive: true })
    const brainPath = join(activeRoot, ".bettercode", "brain", "profile.md")
    writeFileSync(brainPath, "")

    const hooks = await pluginModule.server(makeInput(activeRoot), {})
    const output = { system: ["base system prompt"] }
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system).toEqual(["base system prompt"])
  })

  it("skips injection when autoInject is false", async () => {
    activeRoot = makeFixture("system-transform-skip")
    mkdirSync(join(activeRoot, ".bettercode", "brain"), { recursive: true })
    const brainPath = join(activeRoot, ".bettercode", "brain", "profile.md")
    writeFileSync(brainPath, "# Project Profile\n\n## Stack\n- Type: node\n")

    const hooks = await pluginModule.server(makeInput(activeRoot), { brain: { autoInject: false } })
    const output = { system: ["base system prompt"] }
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system).toEqual(["base system prompt"])
  })

  it("uses custom sections from plugin options", async () => {
    activeRoot = makeFixture("system-transform-custom")
    mkdirSync(join(activeRoot, ".bettercode", "brain"), { recursive: true })
    const brainPath = join(activeRoot, ".bettercode", "brain", "profile.md")
    writeFileSync(brainPath, [
      "# Project Profile",
      "",
      "## Stack",
      "- Type: python",
      "",
      "## Package Manager",
      "- pip",
      "",
    ].join("\n"))

    const hooks = await pluginModule.server(makeInput(activeRoot), { brain: { sections: ["package", "pip"] } })
    const output = { system: ["base system prompt"] }
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    const injected = output.system.join("\n")
    expect(injected).toContain("Package Manager")
    expect(injected).toContain("pip")
  })

  it("injects nothing when sections list is empty", async () => {
    activeRoot = makeFixture("system-transform-empty-sections")
    mkdirSync(join(activeRoot, ".bettercode", "brain"), { recursive: true })
    const brainPath = join(activeRoot, ".bettercode", "brain", "profile.md")
    writeFileSync(brainPath, "# Project Profile\n\n## Stack\n- Type: node\n")

    const hooks = await pluginModule.server(makeInput(activeRoot), { brain: { sections: [] } })
    const output = { system: ["base system prompt"] }
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system).toEqual(["base system prompt"])
  })
})

describe("bettercode_brain_search tool", () => {
  it("returns search results from brain files", async () => {
    activeRoot = makeFixture("brain-search")
    mkdirSync(join(activeRoot, ".bettercode", "brain"), { recursive: true })
    writeFileSync(join(activeRoot, ".bettercode", "brain", "architecture.md"), "# Architecture\n\n## Stack\n- Uses Effect v4\n- Uses Bun runtime\n")

    const hooks = await pluginModule.server(makeInput(activeRoot), {})
    const tools = hooks.tool!
    const result = await (tools.bettercode_brain_search as any).execute({ query: "Effect" }, toolContext(activeRoot))

    expect(result.title).toBe("Brain search")
    expect(result.output).toContain("Effect")
  })

  it("returns no-results message when brain is empty", async () => {
    activeRoot = makeFixture("brain-search-empty")
    const hooks = await pluginModule.server(makeInput("/nonexistent"), {})
    const tools = hooks.tool!
    const result = await (tools.bettercode_brain_search as any).execute({ query: "nonexistent" }, toolContext("/nonexistent"))

    expect(result.output).toContain("No results")
  })
})

describe("bettercode_context_compress tool", () => {
  it("compresses logs and returns metadata", async () => {
    activeRoot = makeFixture("compress-logs")
    const hooks = await pluginModule.server(makeInput(activeRoot), {})
    const tools = hooks.tool!
    const longLogs = Array.from({ length: 200 }, (_, i) => `Line ${i}: some log output here`).join("\n")

    const result = await (tools.bettercode_context_compress as any).execute(
      { text: longLogs, mode: "logs", maxTokens: 100 },
      toolContext(activeRoot),
    )

    expect(result.title).toBe("Context compressed")
    expect(result.metadata.compressedTokens).toBeLessThan(result.metadata.originalTokens)
  })

  it("compresses diffs preserving file headers", async () => {
    activeRoot = makeFixture("compress-diff")
    const hooks = await pluginModule.server(makeInput(activeRoot), {})
    const tools = hooks.tool!
    const longDiff = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,100 +1,100 @@",
      ...Array.from({ length: 100 }, (_, i) => `+line ${i}`),
      "context line",
    ].join("\n")

    const result = await (tools.bettercode_context_compress as any).execute(
      { text: longDiff, mode: "diff", maxTokens: 50 },
      toolContext(activeRoot),
    )

    expect(result.title).toBe("Context compressed")
    expect(result.output.length).toBeLessThan(longDiff.length)
    expect(result.output).toContain("diff --git a/file.ts b/file.ts")
    expect(result.output).toContain("@@ -1,100 +1,100 @@")
  })

  it("truncates plain text to budget", async () => {
    activeRoot = makeFixture("compress-limit")
    const hooks = await pluginModule.server(makeInput(activeRoot), {})
    const tools = hooks.tool!
    const longText = "word ".repeat(500)

    const result = await (tools.bettercode_context_compress as any).execute(
      { text: longText, mode: "limit", maxTokens: 10 },
      toolContext(activeRoot),
    )

    expect(result.title).toBe("Context compressed")
    expect(result.metadata.compressedTokens).toBeLessThanOrEqual(15)
  })
})
