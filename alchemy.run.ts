import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

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

    // Post a preview URL comment on PR deployments.
    // The comment is created on the first deploy and auto-updates on
    // subsequent pushes because the logical ID stays the same.
    if (process.env.PULL_REQUEST) {
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
