import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { WriteKey } from "../domain/Artifact.js"

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  message: Schema.String
}) {}

export const AppConfigSchema = Schema.Struct({
  port: Schema.Number,
  publicBaseUrl: Schema.String,
  databasePath: Schema.String,
  storageDir: Schema.String,
  writeKey: Schema.String
})

export interface AppConfig extends Schema.Schema.Type<typeof AppConfigSchema> {
  readonly writeKey: WriteKey
}

const readNumber = (value: string | undefined, fallback: number) => {
  if (value === undefined || value.trim() === "") {
    return fallback
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const databasePathFromEnv = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") {
    return "./data/agent-artifacts.db"
  }
  return value.startsWith("file:") ? value.slice("file:".length) : value
}

export const makeConfig = (env: NodeJS.ProcessEnv): Effect.Effect<AppConfig, ConfigError> =>
  Effect.gen(function*() {
    const writeKey = env.AGENT_ARTIFACTS_WRITE_KEY
    if (writeKey === undefined || writeKey.trim() === "") {
      return yield* Effect.fail(new ConfigError({ message: "Missing AGENT_ARTIFACTS_WRITE_KEY" }))
    }

    const decoded = yield* Schema.decodeUnknown(AppConfigSchema)({
      port: readNumber(env.PORT, 3000),
      publicBaseUrl: env.PUBLIC_BASE_URL ?? "http://localhost:3000",
      databasePath: databasePathFromEnv(env.DATABASE_URL),
      storageDir: env.STORAGE_DIR ?? "./data/files",
      writeKey
    }).pipe(
      Effect.mapError((error) => new ConfigError({ message: String(error) }))
    )

    return {
      ...decoded,
      writeKey: WriteKey(decoded.writeKey)
    }
  })

export class AppConfigService extends Context.Tag("AgentArtifacts/AppConfig")<AppConfigService, AppConfig>() {}

export const AppConfigLive = Layer.effect(AppConfigService, makeConfig(process.env))
