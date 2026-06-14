import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const configFailure = (message: string) => new Config.ConfigError(new ConfigProvider.SourceError({ message }));

const nonBlank = (message: string) => (value: string) =>
  value.trim() === "" ? Effect.fail(configFailure(message)) : Effect.succeed(value);

const appConfig = Config.all({
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
  publicBaseUrl: Config.url("PUBLIC_BASE_URL").pipe(
    Config.map((url) => url.href.replace(/\/$/, "")),
    Config.withDefault("http://localhost:3000"),
  ),
  databasePath: Config.string("DATABASE_URL").pipe(
    Config.map((value) => (value.startsWith("file:") ? value.slice("file:".length) : value)),
    Config.mapOrFail(nonBlank("DATABASE_URL must resolve to a non-empty database path")),
    Config.withDefault("./data/agent-artifacts.db"),
  ),
  storageDir: Config.nonEmptyString("STORAGE_DIR").pipe(Config.withDefault("./data/files")),
  writeKey: Config.redacted("AGENT_ARTIFACTS_WRITE_KEY").pipe(
    Config.mapOrFail((value) =>
      Redacted.value(value).trim() === ""
        ? Effect.fail(configFailure("AGENT_ARTIFACTS_WRITE_KEY must not be blank"))
        : Effect.succeed(value),
    ),
  ),
});

export type AppConfig = Effect.Success<typeof appConfig>;

export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()("AgentArtifacts/AppConfig", {
  make: appConfig,
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export const AppConfigLive = AppConfigService.layer;
