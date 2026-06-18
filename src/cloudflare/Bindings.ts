import { D1Client } from "@effect/sql-d1";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AppConfigService, makeAppConfig } from "../config/Config.js";

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

export const CloudflareD1SqlLive = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* CloudflareBindingsService;
    return D1Client.layer({ db: env.DB });
  }),
);

export const CloudflareAppConfigLive = Layer.effect(
  AppConfigService,
  Effect.gen(function* () {
    const env = yield* CloudflareBindingsService;
    return makeAppConfig({
      publicBaseUrl: env.PUBLIC_BASE_URL,
      writeKey: env.AGENT_ARTIFACTS_WRITE_KEY,
    });
  }),
);
