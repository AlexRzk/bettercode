#!/usr/bin/env bun

import { Script } from "@bettercode/script"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

await Bun.build({
  target: "node",
  entrypoints: ["./src/node.ts"],
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  external: ["jsonc-parser", "@lydell/node-pty"],
  define: {
    BETTERCODE_MODELS_DEV: generated.modelsData,
    BETTERCODE_CHANNEL: `'${Script.channel}'`,
  },
  files: {
    "bettercode-web-ui.gen.ts": "",
  },
})

console.log("Build complete")
