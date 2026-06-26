import { describe, it, expect } from "bun:test"
import { parseOpenCodeOutput, findSessionID } from "../src/benchmark-parser"

describe("parseOpenCodeOutput", () => {
  describe("OpenCode --format json events", () => {
    it("extracts sessionID from events", () => {
      const stdout = [
        JSON.stringify({ type: "text", sessionID: "ses_123", timestamp: Date.now(), part: { type: "text", text: "hello" } }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.sessionID).toBe("ses_123")
    })

    it("extracts assistant text from text events", () => {
      const stdout = [
        JSON.stringify({
          type: "text",
          sessionID: "ses_123",
          timestamp: Date.now(),
          part: { type: "text", text: "Hello world" },
        }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.assistantText).toBe("Hello world")
    })

    it("concatenates multiple text events", () => {
      const stdout = [
        JSON.stringify({ type: "text", sessionID: "ses_123", timestamp: Date.now(), part: { type: "text", text: "First part." } }),
        JSON.stringify({ type: "text", sessionID: "ses_123", timestamp: Date.now(), part: { type: "text", text: "Second part." } }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.assistantText).toContain("First part.")
      expect(result.assistantText).toContain("Second part.")
    })

    it("skips empty text events", () => {
      const stdout = [
        JSON.stringify({ type: "text", sessionID: "ses_123", timestamp: Date.now(), part: { type: "text", text: "" } }),
        JSON.stringify({ type: "text", sessionID: "ses_123", timestamp: Date.now(), part: { type: "text", text: "real content" } }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.assistantText).toBe("real content")
    })

    it("extracts tool calls from tool_use events", () => {
      const stdout = [
        JSON.stringify({
          type: "tool_use",
          sessionID: "ses_123",
          timestamp: Date.now(),
          part: {
            id: "p1",
            sessionID: "ses_123",
            messageID: "m1",
            callID: "c1",
            tool: "read_file",
            state: { status: "completed", input: { filePath: "src/index.ts" } },
          },
        }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.toolCallNames).toEqual(["read_file"])
      expect(result.toolCallArgs).toEqual([{ filePath: "src/index.ts" }])
    })

    it("extracts tool input from state.input", () => {
      const stdout = [
        JSON.stringify({
          type: "tool_use",
          sessionID: "ses_123",
          timestamp: Date.now(),
          part: {
            id: "p1",
            sessionID: "ses_123",
            messageID: "m1",
            callID: "c1",
            tool: "grep",
            state: { status: "completed", input: { pattern: "foo", path: "src/" } },
          },
        }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.toolCallNames).toEqual(["grep"])
      expect(result.toolCallArgs).toEqual([{ pattern: "foo", path: "src/" }])
    })

    it("counts subagent launches when tool is task", () => {
      const stdout = [
        JSON.stringify({
          type: "tool_use",
          sessionID: "ses_123",
          timestamp: Date.now(),
          part: {
            id: "p1",
            sessionID: "ses_123",
            messageID: "m1",
            callID: "c1",
            tool: "task",
            state: { status: "running", input: { description: "explore" } },
          },
        }),
        JSON.stringify({
          type: "tool_use",
          sessionID: "ses_123",
          timestamp: Date.now(),
          part: {
            id: "p2",
            sessionID: "ses_123",
            messageID: "m1",
            callID: "c2",
            tool: "read_file",
            state: { status: "completed", input: { filePath: "README.md" } },
          },
        }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.subagentLaunches).toBe(1)
      expect(result.toolCallNames).toEqual(["task", "read_file"])
    })

    it("handles tool_use events without state.input", () => {
      const stdout = [
        JSON.stringify({
          type: "tool_use",
          sessionID: "ses_123",
          timestamp: Date.now(),
          part: {
            id: "p1",
            sessionID: "ses_123",
            messageID: "m1",
            callID: "c1",
            tool: "bash",
            state: { status: "completed" },
          },
        }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.toolCallNames).toEqual(["bash"])
      expect(result.toolCallArgs).toEqual([])
    })

    it("extracts files from tool input filePath", () => {
      const stdout = [
        JSON.stringify({
          type: "tool_use",
          sessionID: "ses_123",
          timestamp: Date.now(),
          part: {
            id: "p1",
            sessionID: "ses_123",
            messageID: "m1",
            callID: "c1",
            tool: "read_file",
            state: { status: "completed", input: { filePath: "src/auth/login.ts" } },
          },
        }),
        JSON.stringify({
          type: "tool_use",
          sessionID: "ses_123",
          timestamp: Date.now(),
          part: {
            id: "p2",
            sessionID: "ses_123",
            messageID: "m1",
            callID: "c2",
            tool: "write_file",
            state: { status: "completed", input: { filePath: "src/auth/logout.ts", content: "..." } },
          },
        }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.toolCallNames).toEqual(["read_file", "write_file"])
      expect(result.toolCallArgs).toEqual([
        { filePath: "src/auth/login.ts" },
        { filePath: "src/auth/logout.ts", content: "..." },
      ])
    })
  })

  describe("fallback: OpenAI-style events", () => {
    it("extracts assistant text from role/content events", () => {
      const stdout = [
        JSON.stringify({ role: "assistant", content: "Hello world" }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.assistantText).toBe("Hello world")
    })

    it("extracts tool calls from function_call format", () => {
      const stdout = [
        JSON.stringify({
          role: "assistant",
          tool_calls: [
            { function: { name: "read_file", arguments: '{"filePath":"src/index.ts"}' } },
            { function: { name: "grep", arguments: '{"pattern":"foo"}' } },
          ],
        }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.toolCallNames).toEqual(["read_file", "grep"])
      expect(result.toolCallArgs).toEqual([{ filePath: "src/index.ts" }, { pattern: "foo" }])
    })

    it("counts subagent launches from type=subagent", () => {
      const stdout = [
        JSON.stringify({ type: "subagent" }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.subagentLaunches).toBe(1)
    })

    it("handles tool call with invalid JSON arguments", () => {
      const stdout = [
        JSON.stringify({
          role: "assistant",
          tool_calls: [
            { function: { name: "test", arguments: "not-json" } },
          ],
        }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.toolCallNames).toEqual(["test"])
      expect(result.toolCallArgs).toEqual([{}])
    })
  })

  describe("edge cases", () => {
    it("ignores malformed JSON lines", () => {
      const stdout = [
        "not json at all",
        JSON.stringify({ type: "text", sessionID: "ses_456", timestamp: Date.now(), part: { type: "text", text: "ok" } }),
        "another bad line",
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.sessionID).toBe("ses_456")
      expect(result.rawEvents.length).toBe(1)
    })

    it("returns empty results for empty output", () => {
      const result = parseOpenCodeOutput("")
      expect(result.sessionID).toBeUndefined()
      expect(result.assistantText).toBe("")
      expect(result.toolCallNames).toEqual([])
      expect(result.subagentLaunches).toBe(0)
    })

    it("skips reasoning events from assistant text", () => {
      const stdout = [
        JSON.stringify({ type: "reasoning", sessionID: "ses_123", timestamp: Date.now(), part: { type: "reasoning", text: "thinking..." } }),
        JSON.stringify({ type: "text", sessionID: "ses_123", timestamp: Date.now(), part: { type: "text", text: "actual answer" } }),
      ].join("\n")

      const result = parseOpenCodeOutput(stdout)
      expect(result.assistantText).toBe("actual answer")
      expect(result.assistantText).not.toContain("thinking")
    })
  })
})

describe("findSessionID", () => {
  it("finds sessionID from JSON lines", () => {
    const stdout = [
      "some log line",
      JSON.stringify({ sessionID: "ses_789", type: "text", timestamp: Date.now(), part: { type: "text", text: "ok" } }),
    ].join("\n")

    expect(findSessionID(stdout)).toBe("ses_789")
  })

  it("returns undefined when no sessionID found", () => {
    const stdout = [
      JSON.stringify({ type: "text", timestamp: Date.now() }),
      "not json",
    ].join("\n")

    expect(findSessionID(stdout)).toBeUndefined()
  })

  it("returns undefined for empty output", () => {
    expect(findSessionID("")).toBeUndefined()
  })
})
