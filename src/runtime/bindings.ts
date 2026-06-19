import { D1Client } from "@effect/sql-d1";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface CloudflareEnv {
  readonly DB: D1Database;
  readonly SOURCES: R2Bucket;
  readonly PUBLIC_BASE_URL?: string | undefined;
  readonly AGENT_ARTIFACTS_WRITE_KEY: string;
}

export class CloudflareBindings extends Context.Service<CloudflareBindings, CloudflareEnv>()(
  "AgentArtifacts/CloudflareBindings",
) {}

export const CloudflareBindingsLive = (env: CloudflareEnv) => Layer.succeed(CloudflareBindings, env);

export const CloudflareD1SqlLive = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* CloudflareBindings;
    return D1Client.layer({ db: env.DB });
  }),
);

export const CloudflareConfigProviderLive = Layer.effect(
  ConfigProvider.ConfigProvider,
  Effect.gen(function* () {
    const env = yield* CloudflareBindings;
    return ConfigProvider.fromEnv({
      env: {
        ...(env.PUBLIC_BASE_URL === undefined ? {} : { PUBLIC_BASE_URL: env.PUBLIC_BASE_URL }),
        AGENT_ARTIFACTS_WRITE_KEY: env.AGENT_ARTIFACTS_WRITE_KEY,
      },
    });
  }),
);
