import { existsSync } from "node:fs"
import { join } from "node:path"
import type { ProjectInfo, ProjectType, QualityGateResult } from "@better-code/shared"

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

export function createPlaceholderQualityGateResult(): QualityGateResult {
  return {
    status: "skipped",
    checks: [],
    summary: "Quality gate placeholder is ready.",
  }
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
