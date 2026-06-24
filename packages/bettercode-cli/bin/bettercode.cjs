#!/usr/bin/env node

const childProcess = require("child_process")
const path = require("path")

const child = childProcess.spawn("bun", [path.join(__dirname, "..", "src", "index.ts"), ...process.argv.slice(2)], {
  stdio: "inherit",
})

child.on("error", (error) => {
  console.error(error.message)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (signal) return process.kill(process.pid, signal)
  process.exit(typeof code === "number" ? code : 0)
})
