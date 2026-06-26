import { describe, it, expect } from "bun:test"
import { parseOpenCodeOutput, findSessionID } from "../src/benchmark-parser"

describe("parseOpenCodeOutput", () => {
  it("extracts sessionID from events", () => {
    const stdout = [
      JSON.stringify({ sessionID: "ses_123", type: "session.create" }),
      JSON.stringify({ sessionID: "ses_123", type: "message" }),
    ].join("\n")

    const result = parseOpenCodeOutput(stdout)
    expect(result.sessionID).toBe("ses_123")
  })

  it("extracts assistant text from content events", () => {
    const stdout = [
      JSON.stringify({ role: "assistant", content: "Hello world" }),
      JSON.stringify({ role: "user", content: "question" }),
    ].join("\n")

    const result = parseOpenCodeOutput(stdout)
    expect(result.assistantText).toBe("Hello world")
  })

  it("concatenates multiple assistant content events", () => {
    const stdout = [
      JSON.stringify({ role: "assistant", content: "First part." }),
      JSON.stringify({ role: "assistant", content: "Second part." }),
    ].join("\n")

    const result = parseOpenCodeOutput(stdout)
    expect(result.assistantText).toContain("First part.")
    expect(result.assistantText).toContain("Second part.")
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

  it("extracts tool_use events", () => {
    const stdout = [
      JSON.stringify({ type: "tool_use", name: "bash" }),
    ].join("\n")

    const result = parseOpenCodeOutput(stdout)
    expect(result.toolCallNames).toContain("bash")
  })

  it("counts subagent launches", () => {
    const stdout = [
      JSON.stringify({ type: "subagent" }),
      JSON.stringify({ type: "task" }),
      JSON.stringify({ type: "message" }),
    ].join("\n")

    const result = parseOpenCodeOutput(stdout)
    expect(result.subagentLaunches).toBe(2)
  })

  it("ignores malformed JSON lines", () => {
    const stdout = [
      "not json at all",
      JSON.stringify({ sessionID: "ses_456" }),
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

describe("findSessionID", () => {
  it("finds sessionID from JSON lines", () => {
    const stdout = [
      "some log line",
      JSON.stringify({ sessionID: "ses_789", type: "event" }),
    ].join("\n")

    expect(findSessionID(stdout)).toBe("ses_789")
  })

  it("returns undefined when no sessionID found", () => {
    const stdout = [
      JSON.stringify({ type: "event" }),
      "not json",
    ].join("\n")

    expect(findSessionID(stdout)).toBeUndefined()
  })

  it("returns undefined for empty output", () => {
    expect(findSessionID("")).toBeUndefined()
  })
})
