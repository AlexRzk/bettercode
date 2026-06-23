import { run as runTui, type TuiInput } from "@bettercode/tui"
import { Global } from "@bettercode/core/global"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(Global.defaultLayer))
}
