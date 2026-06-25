#!/usr/bin/env node

const childProcess = require("child_process")
const path = require("path")

const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"]

function run(target, args) {
  const child = childProcess.spawn(target, args, { stdio: "inherit" })
  child.on("error", (error) => {
    console.error(error.message)
    process.exit(1)
  })
  const forwarders = {}
  for (const signal of forwardedSignals) {
    forwarders[signal] = () => {
      try { child.kill(signal) } catch {}
    }
    process.on(signal, forwarders[signal])
  }
  child.on("exit", (code, signal) => {
    for (const s of forwardedSignals) process.removeListener(s, forwarders[s])
    if (signal) return process.kill(process.pid, signal)
    process.exit(typeof code === "number" ? code : 0)
  })
}

// In development (monorepo), run the TypeScript source directly via bun.
// In production (published package), run the bundled dist/cli.js via node.
const devEntry = path.join(__dirname, "..", "src", "index.ts")
const prodEntry = path.join(__dirname, "..", "dist", "cli.js")

const fs = require("fs")
if (fs.existsSync(prodEntry)) {
  run(process.execPath, [prodEntry, ...process.argv.slice(2)])
} else if (fs.existsSync(devEntry)) {
  run("bun", [devEntry, ...process.argv.slice(2)])
} else {
  console.error("bettercode: neither dist/cli.js nor src/index.ts found. Run 'bun run build' first.")
  process.exit(1)
}
