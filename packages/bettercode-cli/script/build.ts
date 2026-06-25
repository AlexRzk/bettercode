import { $ } from "bun"

const outdir = "dist"

// Clean dist/
await $`rm -rf ${outdir}`

// Build CLI bundle
const cliResult = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir,
  target: "node",
  format: "esm",
  naming: "cli.js",
})

if (!cliResult.success) {
  console.error("CLI build failed:")
  for (const msg of cliResult.logs) console.error(msg)
  process.exit(1)
}

// Build plugin bundle
const pluginResult = await Bun.build({
  entrypoints: ["../bettercode-plugin/src/index.ts"],
  outdir,
  target: "node",
  format: "esm",
  naming: "plugin.js",
})

if (!pluginResult.success) {
  console.error("Plugin build failed:")
  for (const msg of pluginResult.logs) console.error(msg)
  process.exit(1)
}

console.log("Build complete:")
for (const output of cliResult.outputs) console.log(`  CLI: ${output.path} (${(output.size / 1024).toFixed(1)}KB)`)
for (const output of pluginResult.outputs) console.log(`  Plugin: ${output.path} (${(output.size / 1024).toFixed(1)}KB)`)
