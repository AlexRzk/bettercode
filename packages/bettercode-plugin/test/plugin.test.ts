import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import pluginModule from "../src/index"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
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

const tmpRoot = join(tmpdir(), "bettercode-plugin-test-" + Date.now())

describe("plugin module shape", () => {
  it("default-exports { id, server }", () => {
    expect(pluginModule.id).toBe("bettercode")
    expect(typeof pluginModule.server).toBe("function")
  })
})

describe("experimental.chat.system.transform", () => {
  beforeEach(() => {
    mkdirSync(join(tmpRoot, ".bettercode", "brain"), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it("injects brain sections into system prompt", async () => {
    const brainPath = join(tmpRoot, ".bettercode", "brain", "profile.md")
    writeFileSync(brainPath, "# Project Profile\n\n## Stack\n- Type: node\n- Framework: Express\n\n## Package Manager\n- bun\n")

    const hooks = await pluginModule.server(makeInput(tmpRoot), {})
    const output = { system: ["base system prompt"] }
    const modelStub = { providerID: "test", id: "test", name: "test" } as any
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system.length).toBeGreaterThan(1)
    expect(output.system.some((s) => s.includes("node") || s.includes("bun"))).toBe(true)
  })

  it("does not inject if brain file is missing", async () => {
    const hooks = await pluginModule.server(makeInput("/nonexistent"), {})
    const output = { system: ["base system prompt"] }
    const modelStub = { providerID: "test", id: "test", name: "test" } as any
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system).toEqual(["base system prompt"])
  })

  it("does not inject if brain file is empty", async () => {
    const brainPath = join(tmpRoot, ".bettercode", "brain", "profile.md")
    writeFileSync(brainPath, "")

    const hooks = await pluginModule.server(makeInput(tmpRoot), {})
    const output = { system: ["base system prompt"] }
    const modelStub = { providerID: "test", id: "test", name: "test" } as any
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system).toEqual(["base system prompt"])
  })

  it("skips injection when autoInject is false", async () => {
    const brainPath = join(tmpRoot, ".bettercode", "brain", "profile.md")
    writeFileSync(brainPath, "# Project Profile\n\n## Stack\n- Type: node\n")

    const hooks = await pluginModule.server(makeInput(tmpRoot), { brain: { autoInject: false } })
    const output = { system: ["base system prompt"] }
    const modelStub = { providerID: "test", id: "test", name: "test" } as any
    await hooks["experimental.chat.system.transform"]!({ model: modelStub }, output)

    expect(output.system).toEqual(["base system prompt"])
  })
})

describe("bettercode_brain_search tool", () => {
  beforeEach(() => {
    mkdirSync(join(tmpRoot, ".bettercode", "brain"), { recursive: true })
  })

  afterEach(() => {
    rmSync(join(tmpRoot, ".bettercode", "brain"), { recursive: true, force: true })
  })

  it("returns search results from brain files", async () => {
    writeFileSync(join(tmpRoot, ".bettercode", "brain", "architecture.md"), "# Architecture\n\n## Stack\n- Uses Effect v4\n- Uses Bun runtime\n")

    const hooks = await pluginModule.server(makeInput(tmpRoot), {})
    const tools = hooks.tool!
    const result = await (tools.bettercode_brain_search as any).execute(
      { query: "Effect" },
      { directory: tmpRoot, worktree: tmpRoot, sessionID: "test", messageID: "m1", agent: "test", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} },
    )

    expect(result.title).toBe("Brain search")
    expect(result.output).toContain("Effect")
  })

  it("returns no-results message when brain is empty", async () => {
    const hooks = await pluginModule.server(makeInput(tmpRoot), {})
    const tools = hooks.tool!
    const result = await (tools.bettercode_brain_search as any).execute(
      { query: "nonexistent" },
      { directory: tmpRoot, worktree: tmpRoot, sessionID: "test", messageID: "m1", agent: "test", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} },
    )

    expect(result.output).toContain("No results")
  })
})

describe("bettercode_context_compress tool", () => {
  it("compresses logs and returns metadata", async () => {
    const hooks = await pluginModule.server(makeInput(tmpRoot), {})
    const tools = hooks.tool!
    const longLogs = Array.from({ length: 200 }, (_, i) => `Line ${i}: some log output here`).join("\n")

    const result = await (tools.bettercode_context_compress as any).execute(
      { text: longLogs, mode: "logs", maxTokens: 100 },
      { directory: tmpRoot, worktree: tmpRoot, sessionID: "test", messageID: "m1", agent: "test", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} },
    )

    expect(result.title).toBe("Context compressed")
    expect(result.metadata.compressedTokens).toBeLessThan(result.metadata.originalTokens)
  })

  it("compresses diffs preserving file headers", async () => {
    const hooks = await pluginModule.server(makeInput(tmpRoot), {})
    const tools = hooks.tool!
    const longDiff = "diff --git a/file.ts b/file.ts\n" + Array.from({ length: 100 }, (_, i) => `+line ${i}`).join("\n")

    const result = await (tools.bettercode_context_compress as any).execute(
      { text: longDiff, mode: "diff", maxTokens: 50 },
      { directory: tmpRoot, worktree: tmpRoot, sessionID: "test", messageID: "m1", agent: "test", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} },
    )

    expect(result.title).toBe("Context compressed")
    expect(result.output.length).toBeLessThan(longDiff.length)
  })

  it("truncates plain text to budget", async () => {
    const hooks = await pluginModule.server(makeInput(tmpRoot), {})
    const tools = hooks.tool!
    const longText = "word ".repeat(500)

    const result = await (tools.bettercode_context_compress as any).execute(
      { text: longText, mode: "limit", maxTokens: 10 },
      { directory: tmpRoot, worktree: tmpRoot, sessionID: "test", messageID: "m1", agent: "test", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} },
    )

    expect(result.title).toBe("Context compressed")
    expect(result.metadata.compressedTokens).toBeLessThanOrEqual(15)
  })
})

describe("chat.message hook", () => {
  it("is defined and callable", async () => {
    const hooks = await pluginModule.server(makeInput(tmpRoot), {})
    expect(typeof hooks["chat.message"]).toBe("function")
  })
})
