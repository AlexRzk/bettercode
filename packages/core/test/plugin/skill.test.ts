import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@bettercode/core/agent"
import { FSUtil } from "@bettercode/core/fs-util"
import { SkillPlugin } from "@bettercode/core/plugin/skill"
import { SkillV2 } from "@bettercode/core/skill"
import { SkillDiscovery } from "@bettercode/core/skill/discovery"
import { testEffect } from "../lib/effect"
import { host } from "./host"

const it = testEffect(
  SkillV2.layer.pipe(
    Layer.provide(FSUtil.defaultLayer),
    Layer.provide(SkillDiscovery.defaultLayer),
    Layer.provideMerge(AgentV2.locationLayer),
  ),
)

describe("SkillPlugin.Plugin", () => {
  it.effect("registers the built-in customize-bettercode skill", () =>
    Effect.gen(function* () {
      const skill = yield* SkillV2.Service
      yield* SkillPlugin.Plugin.effect(host({ skill }))

      expect(yield* skill.list()).toContainEqual(
        expect.objectContaining({
          name: "customize-bettercode",
          description: expect.stringContaining("bettercode's own configuration"),
        }),
      )
    }),
  )
})
