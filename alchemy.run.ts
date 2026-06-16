import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";

type CloudflareProviders = Layer.Success<ReturnType<typeof Cloudflare.providers>>;

export default Alchemy.Stack<
  {
    readonly stage: string;
    readonly url: Alchemy.Output<string | undefined, never>;
  },
  CloudflareProviders
>(
  "agent-artifacts",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    const resourcePrefix = `agent-artifacts-${stage}`;

    const database = yield* Cloudflare.D1Database("database", {
      name: `${resourcePrefix}-d1`,
      migrationsDir: "migrations/d1",
    });

    const sources = yield* Cloudflare.R2Bucket("sources", {
      name: `${resourcePrefix}-sources`,
    });

    const productionDomain = "artifacts.holtzscher.com";
    const isProduction = stage === "production";

    const publicBaseUrl = isProduction ? `https://${productionDomain}` : (process.env.PUBLIC_BASE_URL ?? "");

    const worker = yield* Cloudflare.Worker("worker", {
      name: `${resourcePrefix}-worker`,
      main: "./src/worker.ts",
      url: !isProduction,
      ...(isProduction ? { domain: productionDomain } : {}),
      compatibility: { flags: ["nodejs_compat"] },
      observability: {
        enabled: true,
        headSamplingRate: 1,
        logs: {
          enabled: true,
          invocationLogs: true,
          headSamplingRate: 1,
          persist: true,
        },
        traces: {
          enabled: true,
          headSamplingRate: 1,
          persist: true,
        },
      },
      env: {
        DB: database,
        SOURCES: sources,
        PUBLIC_BASE_URL: publicBaseUrl,
        AGENT_ARTIFACTS_WRITE_KEY: Config.redacted("AGENT_ARTIFACTS_WRITE_KEY"),
      },
    });

    return { stage, url: worker.url };
  }),
);
