import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { AbsolutePath, Location, Model, BetterCode, Session, Tool } from "@bettercode/core/public"
import { testEffect } from "./lib/effect"

const it = testEffect(BetterCode.layer)

describe("public native BetterCode API", () => {
  it.effect("exposes only the intentional Session capabilities", () =>
    Effect.gen(function* () {
      const bettercode = yield* BetterCode.Service

      expect(Object.keys(bettercode).sort()).toEqual(["sessions", "tools"])

      expect(Object.keys(bettercode.sessions).sort()).toEqual([
        "context",
        "create",
        "events",
        "get",
        "interrupt",
        "list",
        "message",
        "messages",
        "prompt",
        "switchModel",
      ])
      expect(Session.ID.create()).toStartWith("ses_")
      expect(Session.MessageID.create()).toStartWith("msg_")
      expect(yield* bettercode.sessions.list()).toBeArray()
      yield* bettercode.tools.register({
        public_tool: Tool.make({
          description: "Public tool",
          input: Schema.Struct({}),
          output: Schema.Struct({ ok: Schema.Boolean }),
          execute: () => Effect.succeed({ ok: true }),
        }),
      })
    }),
  )

  it.effect("records model selection without resolving the Location catalog", () =>
    Effect.gen(function* () {
      const bettercode = yield* BetterCode.Service
      const sessionID = Session.ID.make("ses_public_switch_deferred")
      const model = Schema.decodeUnknownSync(Model.Ref)({
        id: "missing",
        providerID: "missing",
        variant: "unknown",
      })
      yield* bettercode.sessions.create({
        id: sessionID,
        location: Location.Ref.make({ directory: AbsolutePath.make("/public-session-switch-model") }),
      })

      yield* bettercode.sessions.switchModel({ sessionID, model })

      expect((yield* bettercode.sessions.get(sessionID)).model).toEqual(model)
    }),
  )

  it.effect("preserves the typed not-found error for a missing Session", () =>
    Effect.gen(function* () {
      const bettercode = yield* BetterCode.Service
      const sessionID = Session.ID.make("ses_public_switch_missing")
      const error = yield* bettercode.sessions
        .switchModel({
          sessionID,
          model: Schema.decodeUnknownSync(Model.Ref)({ id: "claude-sonnet-4-5", providerID: "anthropic" }),
        })
        .pipe(Effect.flip)

      expect(error).toBeInstanceOf(Session.NotFoundError)
      if (error instanceof Session.NotFoundError) expect(error.sessionID).toBe(sessionID)
    }),
  )
})
