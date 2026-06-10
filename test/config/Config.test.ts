import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"

import { AppConfigLive, AppConfigService } from "../../src/config/Config.js"

const configProvider = (env: NodeJS.ProcessEnv): ConfigProvider.ConfigProvider =>
  ConfigProvider.fromMap(
    new Map(
      Object.entries(env).flatMap(([key, value]) => value === undefined ? [] : [[key, value]])
    )
  ).pipe(ConfigProvider.constantCase)

const readConfig = (env: NodeJS.ProcessEnv) =>
  AppConfigService.pipe(
    Effect.provide(AppConfigLive),
    Effect.withConfigProvider(configProvider(env))
  )

describe("configuration", () => {
  it.effect("requires the write key because write routes must fail closed", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(readConfig({}))
      expect(Exit.isFailure(exit)).toBe(true)
    }))

  it.effect("reads deployment defaults and strips file: from DATABASE_URL", () =>
    Effect.gen(function*() {
      const config = yield* readConfig({
        AGENT_ARTIFACTS_WRITE_KEY: "ap_test",
        DATABASE_URL: "file:/data/agent-artifacts.db"
      })

      expect(config.port).toBe(3000)
      expect(config.databasePath).toBe("/data/agent-artifacts.db")
      expect(config.publicBaseUrl).toBe("http://localhost:3000")
    }))

  it.effect("rejects invalid deployment config instead of silently defaulting", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(readConfig({
        AGENT_ARTIFACTS_WRITE_KEY: "ap_test",
        PORT: "not-a-port"
      }))

      expect(Exit.isFailure(exit)).toBe(true)
    }))

  it.effect("rejects DATABASE_URL values that normalize to an empty path", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(readConfig({
        AGENT_ARTIFACTS_WRITE_KEY: "ap_test",
        DATABASE_URL: "file:"
      }))

      expect(Exit.isFailure(exit)).toBe(true)
    }))

  it.effect("rejects blank write keys because write routes must fail closed", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(readConfig({
        AGENT_ARTIFACTS_WRITE_KEY: "   "
      }))

      expect(Exit.isFailure(exit)).toBe(true)
    }))
})
