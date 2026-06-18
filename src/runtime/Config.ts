import * as Context from "effect/Context";
import * as Redacted from "effect/Redacted";

export interface AppConfig {
  readonly publicBaseUrl: string;
  readonly writeKey: Redacted.Redacted<string>;
}

export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()("AgentArtifacts/AppConfig") {}

export const makeAppConfig = (input: { readonly publicBaseUrl?: string | undefined; readonly writeKey: string }) =>
  AppConfigService.of({
    publicBaseUrl: input.publicBaseUrl?.replace(/\/$/, "") ?? "",
    writeKey: Redacted.make(input.writeKey),
  });
