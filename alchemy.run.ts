import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required for Alchemy deployments and dev.`);
  }
  return value;
};

const writeKey = requireEnv("AGENT_ARTIFACTS_WRITE_KEY");

type CloudflareProviders = Layer.Success<ReturnType<typeof Cloudflare.providers>>;

const ensureSupportedStage = (stage: string) =>
  stage === "staging" || stage === "production" || stage === "local"
    ? Effect.void
    : Effect.die(new Error(`Unsupported stage '${stage}'. Use local, staging, or production.`));

export default Alchemy.Stack<
  { readonly stage: string; readonly url: Alchemy.Output<string | undefined, never> },
  CloudflareProviders
>(
  "agent-artifacts",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    yield* ensureSupportedStage(stage);

    const resourcePrefix = `agent-artifacts-${stage}`;

    const database = yield* Cloudflare.D1Database("database", {
      name: `${resourcePrefix}-d1`,
      migrationsDir: "migrations/d1",
    });

    const sources = yield* Cloudflare.R2Bucket("sources", {
      name: `${resourcePrefix}-sources`,
    });

    const worker = yield* Cloudflare.Worker("worker", {
      name: `${resourcePrefix}-worker`,
      main: "./src/worker.ts",
      url: true,
      compatibility: { flags: ["nodejs_compat"] },
      env: {
        DB: database,
        SOURCES: sources,
        PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "",
        AGENT_ARTIFACTS_WRITE_KEY: Redacted.make(writeKey),
      },
    });

    return { stage, url: worker.url };
  }),
);
