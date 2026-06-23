import { AgentV2 } from "@bettercode/core/agent"
import { Catalog } from "@bettercode/core/catalog"
import { CommandV2 } from "@bettercode/core/command"
import { Credential } from "@bettercode/core/credential"
import { EventV2 } from "@bettercode/core/event"
import { FileSystem } from "@bettercode/core/filesystem"
import { FSUtil } from "@bettercode/core/fs-util"
import { Global } from "@bettercode/core/global"
import { Npm } from "@bettercode/core/npm"
import { PluginV2 } from "@bettercode/core/plugin"
import { Reference } from "@bettercode/core/reference"
import { RepositoryCache } from "@bettercode/core/repository-cache"
import { Ripgrep } from "@bettercode/core/ripgrep"
import { SkillV2 } from "@bettercode/core/skill"
import { SkillDiscovery } from "@bettercode/core/skill/discovery"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

export const PluginTestLayer = Layer.mergeAll(
  AgentV2.locationLayer,
  CommandV2.locationLayer,
  Catalog.locationLayer,
  FileSystem.locationLayer,
  PluginV2.locationLayer,
  Reference.locationLayer,
  SkillV2.locationLayer,
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Credential.defaultLayer,
      EventV2.defaultLayer,
      FSUtil.defaultLayer,
      Global.defaultLayer,
      Layer.succeed(
        Npm.Service,
        Npm.Service.of({
          add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
          install: () => Effect.void,
          which: () => Effect.succeed(undefined),
        }),
      ),
      RepositoryCache.defaultLayer,
      SkillDiscovery.defaultLayer,
      Ripgrep.defaultLayer,
      tempLocationLayer,
    ),
  ),
)
