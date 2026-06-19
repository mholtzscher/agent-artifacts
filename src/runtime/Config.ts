import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const AppConfig = Config.all({
  publicBaseUrl: Config.option(Config.url("PUBLIC_BASE_URL")).pipe(Config.map(Option.getOrUndefined)),
  writeKey: Config.schema(Schema.RedactedFromValue(Schema.NonEmptyString), "AGENT_ARTIFACTS_WRITE_KEY"),
});
export type AppConfig = Config.Success<typeof AppConfig>;

export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()("AgentArtifacts/AppConfig") {}

export const AppConfigLive = Layer.effect(AppConfigService, AppConfig);
