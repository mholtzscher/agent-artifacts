import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"

const appConfig = Config.all({
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
  publicBaseUrl: Config.url("PUBLIC_BASE_URL").pipe(
    Config.map((url) => url.href.replace(/\/$/, "")),
    Config.withDefault("http://localhost:3000")
  ),
  databasePath: Config.string("DATABASE_URL").pipe(
    Config.map((value) => value.startsWith("file:") ? value.slice("file:".length) : value),
    Config.validate({
      message: "DATABASE_URL must resolve to a non-empty database path",
      validation: (value) => value.trim() !== ""
    }),
    Config.withDefault("./data/agent-artifacts.db")
  ),
  storageDir: Config.nonEmptyString("STORAGE_DIR").pipe(Config.withDefault("./data/files")),
  writeKey: Config.redacted("AGENT_ARTIFACTS_WRITE_KEY").pipe(
    Config.validate({
      message: "AGENT_ARTIFACTS_WRITE_KEY must not be blank",
      validation: (value) => Redacted.value(value).trim() !== ""
    })
  )
})

export type AppConfig = Effect.Effect.Success<typeof appConfig>

export class AppConfigService extends Effect.Service<AppConfigService>()(
  "AgentArtifacts/AppConfig",
  { effect: appConfig }
) {}

export const AppConfigLive = AppConfigService.Default
