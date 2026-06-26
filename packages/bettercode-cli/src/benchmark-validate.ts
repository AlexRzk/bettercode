import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

export interface ValidationResult {
  passed: boolean
  command: string
  exitCode: number
  output: string
  durationMs: number
  error?: string
}

export function runValidationCommands(
  cwd: string,
  commands: string[],
): ValidationResult[] {
  return commands.map((command) => runSingleValidation(cwd, command))
}

function runSingleValidation(cwd: string, command: string): ValidationResult {
  if (!existsSync(cwd)) {
    return {
      passed: false,
      command,
      exitCode: 1,
      output: "",
      durationMs: 0,
      error: `Directory does not exist: ${cwd}`,
    }
  }

  const started = performance.now()
  try {
    const args = shellCommandArgs(command)
    const result = spawnSync(args[0]!, args.slice(1), {
      cwd,
      encoding: "utf8",
      timeout: 120_000,
    })

    const output = trimOutput(`${result.stdout ?? ""}${result.stderr ? `\n${result.stderr}` : ""}`)
    return {
      passed: (result.status ?? 1) === 0,
      command,
      exitCode: result.status ?? 1,
      output,
      durationMs: Math.round(performance.now() - started),
    }
  } catch (error) {
    return {
      passed: false,
      command,
      exitCode: 1,
      output: "",
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "Validation command failed.",
    }
  }
}

function shellCommandArgs(command: string) {
  if (process.platform === "win32") return ["cmd.exe", "/d", "/s", "/c", command]
  return ["sh", "-c", command]
}

function trimOutput(output: string) {
  const normalized = output.trim()
  const maxLen = 4000
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen)}\n[output truncated]`
}
