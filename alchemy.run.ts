import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { seedPreviewArtifacts } from "./scripts/seed-preview.js";

export default Alchemy.Stack(
  "agent-artifacts",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    const resourcePrefix = `agent-artifacts-${stage}`;

    const database = yield* Cloudflare.D1Database("database", {
      name: `${resourcePrefix}-d1`,
      migrationsDir: "migrations/d1",
      primaryLocationHint: "wnam",
      // Route reads to the nearest D1 replica. This is safe for the public
      // read paths (feed, artifact page, source download) because artifacts are
      // immutable after publish. The publish path checks slug uniqueness, but
      // collisions are unlikely because slug suffixes are random; a duplicate
      // would still fail the unique constraint on insert.
      readReplication: { mode: "auto" },
    });

    const sources = yield* Cloudflare.R2Bucket("sources", {
      name: `${resourcePrefix}-sources`,
      locationHint: "wnam",
    });

    const productionDomain = "artifacts.holtzscher.com";
    const isProduction = stage === "production";

    const publicBaseUrl = isProduction ? `https://${productionDomain}` : (process.env.PUBLIC_BASE_URL ?? "");

    const worker = yield* Cloudflare.Worker("worker", {
      name: `${resourcePrefix}-worker`,
      main: "./src/cloudflare/Worker.ts",
      url: !isProduction,
      ...(isProduction ? { domain: productionDomain } : {}),
      compatibility: {
        // Pin to a recent stable date. nodejs_compat is still required.
        date: "2025-12-02",
        flags: ["nodejs_compat"],
      },
      // Place the Worker near D1/R2 instead of at the edge. This reduces
      // round-trip time for backend calls, which is the dominant source of
      // latency for this DB/R2-heavy app.
      placement: { mode: "smart" },
      observability: {
        enabled: true,
        headSamplingRate: isProduction ? 0.1 : 1,
        logs: {
          enabled: true,
          invocationLogs: true,
          headSamplingRate: isProduction ? 0.1 : 1,
          persist: true,
        },
        traces: {
          enabled: true,
          headSamplingRate: isProduction ? 0.1 : 1,
          persist: true,
        },
      },
      env: {
        DB: database,
        SOURCES: sources,
        PUBLIC_BASE_URL: publicBaseUrl,
        AGENT_ARTIFACTS_WRITE_KEY: Config.redacted("WRITE_KEY"),
      },
    });

    // Post a preview URL comment on PR deployments, and seed a couple of
    // sample artifacts so reviewers see a non-empty feed. The comment is
    // created on the first deploy and auto-updates on subsequent pushes
    // because the logical ID stays the same. Seeding is idempotent: it skips
    // when the catalog already has artifacts, so redeploys of the same PR do
    // not create duplicates.
    if (process.env.PULL_REQUEST) {
      const writeKey = process.env.WRITE_KEY;
      if (writeKey) {
        // `worker.url` is an alchemy Output expression, not a resolved string,
        // so the seed side effect must run through `Output.mapEffect` to get
        // the resolved URL at evaluation time. The seed is best-effort and
        // swallows its own errors, so a failed seed never breaks the deploy.
        yield* worker.url.pipe(
          Output.mapEffect((url) =>
            url === undefined
              ? Effect.logWarning("preview seed skipped: worker url unresolved")
              : Effect.promise(() => seedPreviewArtifacts({ baseUrl: url, writeKey })),
          ),
        );
      } else {
        yield* Effect.logWarning("preview seed skipped: WRITE_KEY not set");
      }

      yield* GitHub.Comment("preview-comment", {
        owner: process.env.GITHUB_REPOSITORY_OWNER!,
        repository: process.env.GITHUB_REPOSITORY_NAME!,
        issueNumber: Number(process.env.PULL_REQUEST),
        body: Output.interpolate`
          ## Preview Deployed

          **URL:** ${worker.url}

          This preview was built from commit ${process.env.GITHUB_SHA ?? "unknown"}.

          ---
          _This comment updates automatically with each push._
        `,
      });
    }

    return { stage, url: worker.url };
  }),
);
