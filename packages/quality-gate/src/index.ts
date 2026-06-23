import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type {
  AvailableCommands,
  PackageManager,
  ProjectCommandName,
  ProjectInfo,
  ProjectType,
  QualityGateResult,
} from "@better-code/shared"

type ProjectSignal = {
  type: ProjectType
  files: string[]
}

const projectSignals: ProjectSignal[] = [
  { type: "nextjs", files: ["next.config.js", "next.config.ts"] },
  { type: "vite", files: ["vite.config.js", "vite.config.ts"] },
  { type: "node", files: ["package.json"] },
  { type: "python", files: ["pyproject.toml", "requirements.txt"] },
  { type: "rust", files: ["Cargo.toml"] },
  { type: "go", files: ["go.mod"] },
  { type: "solidity-foundry", files: ["foundry.toml"] },
  { type: "solidity-hardhat", files: ["hardhat.config.ts", "hardhat.config.js"] },
]

const commandNames: ProjectCommandName[] = ["lint", "typecheck", "test", "build", "format", "format:check"]

export function createPlaceholderQualityGateResult(): QualityGateResult {
  return {
    status: "skipped",
    checks: [],
    summary: "Quality gate placeholder is ready.",
  }
}

export function detectPackageManager(rootPath: string): PackageManager {
  if (existsSync(join(rootPath, "pnpm-lock.yaml"))) return "pnpm"
  if (existsSync(join(rootPath, "yarn.lock"))) return "yarn"
  if (existsSync(join(rootPath, "bun.lockb")) || existsSync(join(rootPath, "bun.lock"))) return "bun"
  if (existsSync(join(rootPath, "package-lock.json"))) return "npm"
  return "npm"
}

export function detectAvailableCommands(rootPath: string): AvailableCommands {
  const packageJson = readPackageJson(rootPath)
  if (!packageJson?.scripts || typeof packageJson.scripts !== "object") return {}

  const scripts = packageJson.scripts
  const packageManager = detectPackageManager(rootPath)

  return Object.fromEntries(
    commandNames
      .filter((name) => typeof scripts[name] === "string")
      .map((name) => [
        name,
        {
          name,
          command: formatScriptCommand(packageManager, name),
          available: true,
        },
      ]),
  )
}

export function detectProject(rootPath: string): ProjectInfo {
  const match = projectSignals
    .map((signal) => ({
      type: signal.type,
      signals: signal.files.filter((file) => existsSync(join(rootPath, file))),
    }))
    .find((signal) => signal.signals.length > 0)

  return {
    type: match?.type ?? "unknown",
    rootPath,
    signals: match?.signals ?? [],
  }
}

function readPackageJson(rootPath: string): { scripts?: Record<string, unknown> } | undefined {
  if (!existsSync(join(rootPath, "package.json"))) return undefined
  try {
    return JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"))
  } catch {
    return undefined
  }
}

function formatScriptCommand(packageManager: PackageManager, name: ProjectCommandName) {
  if (packageManager === "npm") return `npm run ${name}`
  if (packageManager === "pnpm") return `pnpm ${name}`
  if (packageManager === "yarn") return `yarn ${name}`
  return `bun run ${name}`
}
