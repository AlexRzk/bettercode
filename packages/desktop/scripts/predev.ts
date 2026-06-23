import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.BETTERCODE_CHANNEL ?? "dev"}`

await $`cd ../bettercode && bun script/build-node.ts`
