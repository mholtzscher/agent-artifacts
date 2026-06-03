import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"

import { makeConfig } from "../src/Config.js"

describe("configuration", () => {
  it.effect("requires the write key because write routes must fail closed", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(makeConfig({}))
      expect(Exit.isFailure(exit)).toBe(true)
    }))

  it.effect("reads deployment defaults and strips file: from DATABASE_URL", () =>
    Effect.gen(function*() {
      const config = yield* makeConfig({
        AGENT_ARTIFACTS_WRITE_KEY: "ap_test",
        DATABASE_URL: "file:/data/agent-artifacts.db"
      })

      expect(config.port).toBe(3000)
      expect(config.databasePath).toBe("/data/agent-artifacts.db")
      expect(config.publicBaseUrl).toBe("http://localhost:3000")
    }))
})
