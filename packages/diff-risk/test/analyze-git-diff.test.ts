import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { analyzeGitDiff } from "../src"

const tmp = join(import.meta.dir, ".tmp")

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe("analyzeGitDiff", () => {
  test("returns empty summary for repo without diff", async () => {
    const repo = await createRepo("clean")

    expect(await analyzeGitDiff(repo)).toMatchObject({
      changedFiles: [],
      filesChanged: 0,
      diffLines: 0,
      addedLines: 0,
      deletedLines: 0,
      warnings: [],
    })
  })

  test("summarizes one modified file", async () => {
    const repo = await createRepo("single")
    await writeFile(join(repo, "a.txt"), "one\ntwo\nthree\n")

    expect(await analyzeGitDiff(repo)).toMatchObject({
      changedFiles: ["a.txt"],
      filesChanged: 1,
      addedLines: 2,
      deletedLines: 0,
      diffLines: 2,
      warnings: [],
    })
  })

  test("summarizes several modified files", async () => {
    const repo = await createRepo("multiple", { files: { "a.txt": "one\n", "b.txt": "" } })
    await writeFile(join(repo, "a.txt"), "one\ntwo\n")
    await writeFile(join(repo, "b.txt"), "one\n")

    expect(await analyzeGitDiff(repo)).toMatchObject({
      changedFiles: ["a.txt", "b.txt"],
      filesChanged: 2,
      addedLines: 2,
      deletedLines: 0,
      diffLines: 2,
      warnings: [],
    })
  })

  test("returns empty summary with warning outside git repos", async () => {
    const root = join("C:\\tmp", "bettercode-diff-risk-test", "not-git")

    expect(await analyzeGitDiff(root)).toMatchObject({
      changedFiles: [],
      filesChanged: 0,
      diffLines: 0,
      addedLines: 0,
      deletedLines: 0,
      warnings: ["Not a Git repository."],
    })
  })

  test("does not crash on binary files", async () => {
    const repo = await createRepo("binary", { files: { "image.bin": "\u0000\u0001" } })
    await writeFile(join(repo, "image.bin"), Buffer.from([0, 1, 2, 3, 4]))

    expect(await analyzeGitDiff(repo)).toMatchObject({
      changedFiles: ["image.bin"],
      filesChanged: 1,
      addedLines: 0,
      deletedLines: 0,
      diffLines: 0,
      warnings: [],
    })
  })
})

async function createRepo(name: string, options: { files?: Record<string, string> } = {}) {
  const repo = join(tmp, name)
  await mkdir(repo, { recursive: true })
  await run(repo, ["init"])
  await run(repo, ["config", "user.email", "test@example.com"])
  await run(repo, ["config", "user.name", "Test User"])
  const files = options.files ?? { "a.txt": "one\n" }
  await Promise.all(Object.entries(files).map(([file, content]) => writeFile(join(repo, file), content)))
  await run(repo, ["add", "."])
  await run(repo, ["commit", "-m", "initial"])
  return repo
}

async function run(cwd: string, args: string[]) {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(await new Response(child.stderr).text())
}
