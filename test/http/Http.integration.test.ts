import { describe, expect, it } from "vitest";

import type { CloudflareBindings } from "../../src/cloudflare/Bindings.js";
import Worker from "../../src/cloudflare/App.js";

const writeKey = "ap_integration";
const baseUrl = "http://agent-artifacts.test";

const makeD1 = () => {
  const rows = new Map<string, Record<string, unknown>>();

  const db = {
    prepare: (sql: string) => {
      let bound: ReadonlyArray<unknown> = [];
      const statement = {
        bind: (...values: ReadonlyArray<unknown>) => {
          bound = values;
          return statement;
        },
        run: async () => {
          if (sql.startsWith("insert into artifacts")) {
            rows.set(String(bound[1]), {
              id: bound[0],
              slug: bound[1],
              title: bound[2],
              description: bound[3],
              source_type: bound[4],
              source_filename: bound[5],
              sha256: bound[6],
              size_bytes: bound[7],
              project: bound[8],
              repo_full_name: bound[9],
              branch: bound[10],
              commit_sha: bound[11],
              dirty: bound[12],
              agent: bound[13],
              generator: bound[14],
              state: bound[15],
              created_at: bound[16],
              updated_at: bound[17],
            });
          }
          return { success: true };
        },
        first: async () => {
          if (sql.startsWith("select count(*)")) {
            return { count: rows.has(String(bound[0])) ? 1 : 0 };
          }
          return rows.get(String(bound[0])) ?? null;
        },
        all: async () => ({ results: Array.from(rows.values()) }),
      };
      return statement;
    },
  } as unknown as D1Database;

  return db;
};

const makeR2 = () => {
  const objects = new Map<string, Uint8Array>();
  return {
    put: async (key: string, value: Uint8Array) => {
      objects.set(key, value);
      return null;
    },
    get: async (key: string) => {
      const value = objects.get(key);
      return value === undefined
        ? null
        : {
            arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
          };
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
  } as unknown as R2Bucket;
};

const makeEnv = (): CloudflareBindings => ({
  DB: makeD1(),
  SOURCES: makeR2(),
  PUBLIC_BASE_URL: baseUrl,
  AGENT_ARTIFACTS_WRITE_KEY: writeKey,
});

const request = (env: CloudflareBindings, path: string, init?: RequestInit) =>
  Worker.fetch(new Request(`${baseUrl}${path}`, init), env);

const publish = async (env: CloudflareBindings, filename: string, source: string, title: string) => {
  const form = new FormData();
  form.append("file", new Blob([source]), filename);
  form.append("title", title);

  const response = await request(env, "/api/artifacts", {
    method: "POST",
    headers: { "X-Write-Key": writeKey },
    body: form,
  });

  expect(response.status).toBe(201);
  return (await response.json()) as {
    readonly slug: string;
    readonly title: string;
    readonly sourceType: "markdown" | "html";
    readonly sourceUrl: string;
    readonly artifactUrl: string;
  };
};

describe("HTTP artifact routes", () => {
  it("rejects publish attempts without the write key", async () => {
    const env = makeEnv();
    const form = new FormData();
    form.append("file", new Blob(["# Secretless"]), "secretless.md");

    const response = await request(env, "/api/artifacts", {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(401);
  });

  it("publishes Markdown and serves feed, rendered view, and immutable source", async () => {
    const env = makeEnv();
    const published = await publish(env, "PLAN.md", "# Hello\n\nWorld", "Hello Plan");

    expect(published.title).toBe("Hello Plan");
    expect(published.sourceType).toBe("markdown");
    expect(published.sourceUrl).toBe(`${baseUrl}/source/${published.slug}`);
    expect(published.artifactUrl).toBe(`${baseUrl}/a/${published.slug}`);

    const feed = (await request(env, "/api/artifacts").then((response) => response.json())) as {
      readonly artifacts: ReadonlyArray<{ readonly slug: string }>;
    };
    expect(feed.artifacts.some((artifact) => artifact.slug === published.slug)).toBe(true);

    const source = await request(env, `/source/${published.slug}`).then((response) => response.text());
    expect(source).toBe("# Hello\n\nWorld");

    const rendered = await request(env, `/a/${published.slug}`).then((response) => response.text());
    expect(rendered).toContain("<h1>Hello");
  });

  it("continues serving source from D1 metadata and R2 storage across Worker handler instances", async () => {
    const env = makeEnv();
    const published = await publish(env, "persistent.md", "# Still here", "Persistent Artifact");

    const source = await request(env, `/source/${published.slug}`).then((response) => response.text());
    expect(source).toBe("# Still here");
  });

  it("publishes scripted HTML and renders it through the artifact wrapper", async () => {
    const env = makeEnv();
    const published = await publish(
      env,
      "report.html",
      "<h1>HTML Artifact</h1><script>window.__agentArtifact = true</script>",
      "HTML Report",
    );

    expect(published.sourceType).toBe("html");

    const source = await request(env, `/source/${published.slug}`).then((response) => response.text());
    expect(source).toContain("window.__agentArtifact");

    const rendered = await request(env, `/a/${published.slug}`).then((response) => response.text());
    expect(rendered).toContain("source-frame");
    expect(rendered).toContain("window.__agentArtifact");
  });
});
