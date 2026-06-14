import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const writeKey = "ap_integration";

let child: ChildProcessWithoutNullStreams | undefined;
let baseUrl: string;
let tempDir: string;
let port: number;
let stderr = "";

const getFreePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a test port")));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });

const startServer = () => {
  stderr = "";
  child = spawn("pnpm", ["start"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENT_ARTIFACTS_WRITE_KEY: writeKey,
      DATABASE_URL: `file:${path.join(tempDir, "app.db")}`,
      STORAGE_DIR: path.join(tempDir, "files"),
      PUBLIC_BASE_URL: baseUrl,
      PORT: String(port),
    },
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
};

const stopServer = async () => {
  if (child === undefined || child.exitCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    child?.once("exit", () => resolve());
    child?.kill();
    setTimeout(resolve, 2_000).unref();
  });
};

const waitForServer = async () => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Server exited before readiness. stderr:\n${stderr}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling until the server accepts connections
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready. stderr:\n${stderr}`);
};

const publish = async (filename: string, source: string, title: string) => {
  const form = new FormData();
  form.append("file", new Blob([source]), filename);
  form.append("title", title);

  const response = await fetch(`${baseUrl}/api/artifacts`, {
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
  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-artifacts-http-"));
    port = await getFreePort();
    baseUrl = `http://localhost:${port}`;

    startServer();
    await waitForServer();
  }, 15_000);

  afterAll(async () => {
    await stopServer();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rejects publish attempts without the write key", async () => {
    const form = new FormData();
    form.append("file", new Blob(["# Secretless"]), "secretless.md");

    const response = await fetch(`${baseUrl}/api/artifacts`, {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(401);
  });

  it("publishes Markdown and serves feed, rendered view, and immutable source", async () => {
    const published = await publish("PLAN.md", "# Hello\n\nWorld", "Hello Plan");

    expect(published.title).toBe("Hello Plan");
    expect(published.sourceType).toBe("markdown");
    expect(published.sourceUrl).toBe(`${baseUrl}/source/${published.slug}`);
    expect(published.artifactUrl).toBe(`${baseUrl}/a/${published.slug}`);

    const feed = (await fetch(`${baseUrl}/api/artifacts`).then((response) => response.json())) as {
      readonly artifacts: ReadonlyArray<{ readonly slug: string }>;
    };
    expect(feed.artifacts.some((artifact) => artifact.slug === published.slug)).toBe(true);

    const source = await fetch(`${baseUrl}/source/${published.slug}`).then((response) => response.text());
    expect(source).toBe("# Hello\n\nWorld");

    const rendered = await fetch(`${baseUrl}/a/${published.slug}`).then((response) => response.text());
    expect(rendered).toContain("<h1>Hello");
  });

  it("continues serving source from SQLite metadata and filesystem storage after restart", async () => {
    const published = await publish("persistent.md", "# Still here", "Persistent Artifact");

    await stopServer();
    startServer();
    await waitForServer();

    const source = await fetch(`${baseUrl}/source/${published.slug}`).then((response) => response.text());
    expect(source).toBe("# Still here");
  });

  it("publishes scripted HTML and renders it through the artifact wrapper", async () => {
    const published = await publish(
      "report.html",
      "<h1>HTML Artifact</h1><script>window.__agentArtifact = true</script>",
      "HTML Report",
    );

    expect(published.sourceType).toBe("html");

    const source = await fetch(`${baseUrl}/source/${published.slug}`).then((response) => response.text());
    expect(source).toContain("window.__agentArtifact");

    const rendered = await fetch(`${baseUrl}/a/${published.slug}`).then((response) => response.text());
    expect(rendered).toContain("source-frame");
    expect(rendered).toContain("window.__agentArtifact");
  });
});
