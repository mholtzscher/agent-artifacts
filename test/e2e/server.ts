import { Miniflare } from "miniflare";
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import worker from "../../src/runtime/Worker.js";
import type { CloudflareBindings } from "../../src/runtime/Bindings.js";

const port = Number(process.env.PORT ?? "1339");
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const writeKey = process.env.WRITE_KEY ?? "ap_test";

const applyD1Migrations = async (db: D1Database) => {
  const migrationsDir = join(process.cwd(), "migrations/d1");
  const migrationFiles = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of migrationFiles) {
    const migration = await readFile(join(migrationsDir, file), "utf8");
    const statements = migration
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  }
};

const miniflare = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('unused') } }",
  d1Databases: { DB: "test-db" },
  r2Buckets: { SOURCES: "test-sources" },
});

const db = await miniflare.getD1Database("DB");
await applyD1Migrations(db);

const env: CloudflareBindings = {
  DB: db,
  SOURCES: (await miniflare.getR2Bucket("SOURCES")) as unknown as R2Bucket,
  PUBLIC_BASE_URL: publicBaseUrl,
  AGENT_ARTIFACTS_WRITE_KEY: writeKey,
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url ?? "/", publicBaseUrl);
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers as HeadersInit,
      body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : incoming,
      duplex: "half",
    } as unknown as RequestInit);

    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));

    if (response.body === null) {
      outgoing.end();
      return;
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outgoing.write(value);
    }
    outgoing.end();
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end("Internal Server Error");
  }
});

server.listen(port, () => {
  console.log(`E2E server listening on ${publicBaseUrl}`);
});

const shutdown = async () => {
  server.close();
  await miniflare.dispose();
};

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));
