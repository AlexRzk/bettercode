/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "@bettercode/plugin/v2/effect"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeOpencodeContent from "./skill/customize-bettercode.md" with { type: "text" }

export const CustomizeOpencodeContent = customizeOpencodeContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        new SkillV2.EmbeddedSource({
          type: "embedded",
          skill: new SkillV2.Info({
            name: "customize-bettercode",
            description:
              "Use ONLY when the user is editing or creating bettercode's own configuration: bettercode.json, bettercode.jsonc, files under .bettercode/, or files under ~/.config/bettercode/. Also use when creating or fixing bettercode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring bettercode itself.",
            location: AbsolutePath.make("/builtin/customize-bettercode.md"),
            content: CustomizeOpencodeContent,
          }),
        }),
      )
    })
  }),
})
