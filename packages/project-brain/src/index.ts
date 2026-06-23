import { existsSync, readFileSync } from "node:fs"
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises"
import { join } from "node:path"
import { detectProject, detectPackageManager, detectAvailableCommands } from "@better-code/quality-gate"

const brainDir = ".better-code/brain"

const brainFiles = [
  { name: "profile.md", content: "# Project Profile\n\n" },
  { name: "commands.md", content: "# Commands\n\n" },
  { name: "architecture.md", content: "# Architecture\n\n" },
  { name: "known-errors.md", content: "# Known Errors\n\n" },
  { name: "quality-rules.md", content: "# Quality Rules\n\n" },
  { name: "task-history.jsonl", content: "" },
]

export async function brainInit(rootPath: string): Promise<string[]> {
  const dir = join(rootPath, brainDir)
  await mkdir(dir, { recursive: true })

  const created: string[] = []
  for (const file of brainFiles) {
    const filePath = join(dir, file.name)
    if (!existsSync(filePath)) {
      await writeFile(filePath, file.content)
      created.push(file.name)
    }
  }
  return created
}

const startMarker = "<!-- better-code:generated-profile:start -->"
const endMarker = "<!-- better-code:generated-profile:end -->"

function isLegacyGeneratedProfile(content: string): boolean {
  if (content.includes(startMarker) || content.includes(endMarker)) return false
  const lower = content.toLowerCase()
  return lower.startsWith("# project profile") && lower.includes("## stack") && lower.includes("## package manager") && lower.includes("## available commands")
}

const legacyGeneratedHeadings = ["## stack", "## package manager", "## available commands", "## critical paths"]
const packageManagerValues = ["npm", "pnpm", "yarn", "bun"]

function isLegacyGeneratedRow(line: string, activeHeading: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith("- ")) return false

  if (activeHeading === "## stack") {
    return /^- (Type|Signals): /.test(trimmed)
  }
  if (activeHeading === "## package manager") {
    const value = trimmed.slice(2).toLowerCase()
    return packageManagerValues.includes(value)
  }
  if (activeHeading === "## available commands") {
    return /^- \w[\w-]*: .+/.test(trimmed)
  }
  if (activeHeading === "## critical paths") {
    return /^- .+/.test(trimmed)
  }
  return false
}

function migrateLegacyProfile(content: string): string {
  const lines = content.split("\n")
  const preserved: string[] = []
  let activeHeading = ""

  for (const line of lines) {
    const lower = line.trim().toLowerCase()

    if (lower === "# project profile") continue

    if (legacyGeneratedHeadings.includes(lower)) {
      activeHeading = lower
      continue
    }

    if (lower.startsWith("## ")) {
      activeHeading = ""
      preserved.push(line)
      continue
    }

    if (activeHeading && isLegacyGeneratedRow(line, activeHeading)) {
      continue
    }

    if (activeHeading && lower !== "") {
      activeHeading = ""
    }

    preserved.push(line)
  }

  const cleaned = preserved.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()
  return cleaned ? `${cleaned}\n\n` : ""
}

export async function brainUpdate(rootPath: string): Promise<{ profileUpdated: boolean; historyAppended: boolean }> {
  const dir = join(rootPath, brainDir)
  await mkdir(dir, { recursive: true })

  const project = detectProject(rootPath)
  const packageManager = detectPackageManager(rootPath)
  const commands = detectAvailableCommands(rootPath)

  const generatedLines = [
    startMarker,
    "## Stack",
    `- Type: ${project.type}`,
    `- Signals: ${project.signals.length > 0 ? project.signals.join(", ") : "none detected"}`,
    "",
    `## Package Manager`,
    `- ${packageManager}`,
    "",
    `## Available Commands`,
  ]

  for (const [name, cmd] of Object.entries(commands)) {
    if (cmd && typeof cmd === "object" && "command" in cmd) {
      generatedLines.push(`- ${name}: ${(cmd as { command: string }).command}`)
    }
  }

  const configPath = join(rootPath, ".better-code", "quality-gate.json")
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"))
      if (Array.isArray(config.criticalPaths) && config.criticalPaths.length > 0) {
        generatedLines.push("", "## Critical Paths")
        for (const p of config.criticalPaths) {
          generatedLines.push(`- ${p}`)
        }
      }
    } catch {
      // ignore invalid config
    }
  }

  generatedLines.push(endMarker, "")
  const generatedSection = generatedLines.join("\n")

  const profilePath = join(dir, "profile.md")
  if (!existsSync(profilePath)) {
    await writeFile(profilePath, `# Project Profile\n\n${generatedSection}`)
  } else {
    const existing = readFileSync(profilePath, "utf8")
    const startIdx = existing.indexOf(startMarker)
    const endIdx = existing.indexOf(endMarker)

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const before = existing.slice(0, startIdx)
      const after = existing.slice(endIdx + endMarker.length)
      await writeFile(profilePath, `${before}${generatedSection}${after}`)
    } else if (isLegacyGeneratedProfile(existing)) {
      const preserved = migrateLegacyProfile(existing)
      await writeFile(profilePath, `# Project Profile\n\n${preserved}${generatedSection}`)
    } else {
      await writeFile(profilePath, `${existing.trimEnd()}\n\n${generatedSection}`)
    }
  }

  let historyAppended = false
  const gateResultPath = join(rootPath, ".better-code", "last-gate-result.json")
  if (existsSync(gateResultPath)) {
    try {
      const result = JSON.parse(readFileSync(gateResultPath, "utf8"))
      const entry = {
        timestamp: new Date().toISOString(),
        status: result.status,
        score: result.score,
        risk: result.risk,
      }
      await appendFile(join(dir, "task-history.jsonl"), JSON.stringify(entry) + "\n")
      historyAppended = true
    } catch {
      // ignore invalid result
    }
  }

  return { profileUpdated: true, historyAppended }
}

export function brainSearch(rootPath: string, query: string): SearchResult[] {
  const dir = join(rootPath, brainDir)
  if (!existsSync(dir)) return []

  const results: SearchResult[] = []
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

  for (const file of brainFiles) {
    if (file.name.endsWith(".jsonl")) continue
    const filePath = join(dir, file.name)
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, "utf8")
    const lines = content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const lower = line.toLowerCase()
      if (terms.every((term) => lower.includes(term))) {
        results.push({
          file: file.name,
          line: i + 1,
          content: line.trim(),
        })
      }
    }
  }

  return results
}

export interface SearchResult {
  file: string
  line: number
  content: string
}
