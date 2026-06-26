import type { ParsedEvents } from "./benchmark-types"

export function parseOpenCodeOutput(stdout: string): ParsedEvents {
  const result: ParsedEvents = {
    assistantText: "",
    toolCallNames: [],
    toolCallArgs: [],
    subagentLaunches: 0,
    rawEvents: [],
  }

  const lines = stdout.split("\n")
  const textParts: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let event: unknown
    try {
      event = JSON.parse(trimmed)
    } catch {
      continue
    }

    if (!event || typeof event !== "object") continue

    result.rawEvents.push(event)

    const obj = event as Record<string, unknown>

    if (typeof obj.sessionID === "string" && !result.sessionID) {
      result.sessionID = obj.sessionID
    }

    if (typeof obj.content === "string" && obj.role === "assistant") {
      textParts.push(obj.content)
    }

    if (obj.role === "assistant" && Array.isArray(obj.tool_calls)) {
      for (const tc of obj.tool_calls) {
        if (tc && typeof tc === "object") {
          const fn = tc.function as Record<string, unknown> | undefined
          if (fn && typeof fn.name === "string") {
            result.toolCallNames.push(fn.name)
            if (typeof fn.arguments === "string") {
              try {
                result.toolCallArgs.push(JSON.parse(fn.arguments))
              } catch {
                result.toolCallArgs.push({})
              }
            }
          }
        }
      }
    }

    if (obj.type === "tool_use" || obj.type === "function_call") {
      const name = obj.name ?? obj.function_name
      if (typeof name === "string") {
        result.toolCallNames.push(name)
      }
    }

    if (obj.type === "subagent" || obj.type === "task") {
      result.subagentLaunches++
    }
  }

  result.assistantText = textParts.join("\n").trim()
  return result
}

export function findSessionID(stdout: string): string | undefined {
  const lines = stdout.split("\n")
  for (const line of lines) {
    try {
      const event = JSON.parse(line.trim())
      if (event && typeof event === "object" && "sessionID" in event) {
        return event.sessionID as string
      }
    } catch {
      continue
    }
  }
  return undefined
}
