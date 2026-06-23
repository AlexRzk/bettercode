import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { Catalog } from "@bettercode/core/catalog"
import { Integration } from "@bettercode/core/integration"
import { Credential } from "@bettercode/core/credential"
import { Database } from "@bettercode/core/database/database"
import { EventV2 } from "@bettercode/core/event"
import { Flag } from "@bettercode/core/flag/flag"
import { Location } from "@bettercode/core/location"
import { ModelsDev } from "@bettercode/core/models-dev"
import { PluginV2 } from "@bettercode/core/plugin"
import { ModelsDevPlugin } from "@bettercode/core/plugin/models-dev"
import { Policy } from "@bettercode/core/policy"
import { AbsolutePath } from "@bettercode/core/schema"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"
import { catalogHost, host, integrationHost } from "./host"

const events = EventV2.defaultLayer
const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make(import.meta.dir) })),
)
const plugins = PluginV2.layer.pipe(Layer.provide(events))
const policy = Policy.layer.pipe(Layer.provide(locationLayer))
const connections = Credential.defaultLayer.pipe(Layer.fresh)
const integrations = Integration.locationLayer.pipe(Layer.provide(events), Layer.provide(connections))
const catalog = Catalog.layer.pipe(
  Layer.provide(Layer.mergeAll(events, locationLayer, plugins, policy, connections, integrations)),
)
const layer = Layer.mergeAll(
  catalog.pipe(Layer.provide(connections)),
  integrations,
  connections,
  events,
  locationLayer,
  plugins,
)
const it = testEffect(layer)

describe("ModelsDevPlugin", () => {
  it.effect("registers key methods for providers with environment variables", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = {
          path: Flag.BETTERCODE_MODELS_PATH,
          disabled: Flag.BETTERCODE_DISABLE_MODELS_FETCH,
        }
        Flag.BETTERCODE_MODELS_PATH = path.join(import.meta.dir, "fixtures", "models-dev.json")
        Flag.BETTERCODE_DISABLE_MODELS_FETCH = true
        return previous
      }),
      () =>
        Effect.gen(function* () {
          const integrations = yield* Integration.Service
          const catalog = yield* Catalog.Service
          yield* ModelsDevPlugin.effect(
            host({
              catalog: catalogHost(catalog),
              event: { subscribe: () => Stream.never },
              integration: integrationHost(integrations),
            }),
          )
          expect(yield* integrations.list()).toEqual([
            new Integration.Info({
              id: Integration.ID.make("acme"),
              name: "Acme",
              methods: [
                { type: "key" },
                {
                  type: "env",
                  names: ["ACME_API_KEY"],
                },
              ],
              connections: [],
            }),
          ])
        }).pipe(Effect.provide(ModelsDev.defaultLayer)),
      (previous) =>
        Effect.sync(() => {
          Flag.BETTERCODE_MODELS_PATH = previous.path
          Flag.BETTERCODE_DISABLE_MODELS_FETCH = previous.disabled
        }),
    ),
  )
})
