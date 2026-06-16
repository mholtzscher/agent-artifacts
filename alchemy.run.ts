import alchemy from "alchemy";
import { D1Database, R2Bucket, Worker } from "alchemy/cloudflare";

const alchemyPassword = process.env.ALCHEMY_PASSWORD;
if (alchemyPassword === undefined || alchemyPassword.trim() === "") {
  throw new Error("ALCHEMY_PASSWORD is required to encrypt Alchemy secrets.");
}

const app = await alchemy(
  "agent-artifacts",
  process.env.ALCHEMY_LOCAL === "true" ? { local: true, password: alchemyPassword } : { password: alchemyPassword },
);

if (app.stage !== "staging" && app.stage !== "production" && app.stage !== "local") {
  throw new Error(`Unsupported stage '${app.stage}'. Use staging or production.`);
}

const writeKey = process.env.AGENT_ARTIFACTS_WRITE_KEY;
if (writeKey === undefined || writeKey.trim() === "") {
  throw new Error("AGENT_ARTIFACTS_WRITE_KEY is required for Alchemy deployments and dev.");
}

const resourcePrefix = `${app.name}-${app.stage}`;

export const database = await D1Database("database", {
  name: `${resourcePrefix}-d1`,
  adopt: true,
  migrationsDir: "migrations/d1",
  dev: { remote: false },
});

export const sources = await R2Bucket("sources", {
  name: `${resourcePrefix}-sources`,
  adopt: true,
  empty: app.stage !== "production",
  dev: { remote: false },
});

export const worker = await Worker("worker", {
  name: `${resourcePrefix}-worker`,
  entrypoint: "./src/runtime/cloudflare/Worker.ts",
  adopt: true,
  url: true,
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    DB: database,
    SOURCES: sources,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "",
    AGENT_ARTIFACTS_WRITE_KEY: alchemy.secret(writeKey),
  },
  bundle: {
    format: "esm",
    target: "es2022",
  },
});

console.log({ stage: app.stage, url: worker.url });

await app.finalize();
