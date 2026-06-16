import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { AppConfigService, makeAppConfig } from "../../config/Config.js";

export interface CloudflareBindings {
  readonly DB: D1Database;
  readonly SOURCES: R2Bucket;
  readonly PUBLIC_BASE_URL?: string | undefined;
  readonly AGENT_ARTIFACTS_WRITE_KEY: string;
}

export class CloudflareBindingsService extends Context.Service<CloudflareBindingsService, CloudflareBindings>()(
  "AgentArtifacts/CloudflareBindings",
) {}

export const CloudflareBindingsLive = (env: CloudflareBindings) => Layer.succeed(CloudflareBindingsService, env);

export const CloudflareAppConfigLive = (env: CloudflareBindings) =>
  Layer.succeed(
    AppConfigService,
    makeAppConfig({
      publicBaseUrl: env.PUBLIC_BASE_URL,
      writeKey: env.AGENT_ARTIFACTS_WRITE_KEY,
    }),
  );
