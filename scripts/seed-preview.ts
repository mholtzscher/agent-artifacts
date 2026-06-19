// Idempotently seeds a couple of sample artifacts into a PR preview deployment
// through the public publish API. Skipped when the catalog already has
// artifacts, so redeploys of the same PR stage do not create duplicates.
//
// Usage as a module: import { seedPreviewArtifacts } from "./scripts/seed-preview.js"
// Usage as a script:  bun run scripts/seed-preview.ts (reads BASE_URL and WRITE_KEY from env)

const PUBLISH_PATH = "/api/v1/artifacts";
const FEED_PATH = "/api/v1/artifacts";

export interface SeedPreviewArtifactsOptions {
  readonly baseUrl: string;
  readonly writeKey: string;
  readonly maxWaitSeconds?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The worker may not serve requests the instant its resource is provisioned,
// so retry until the feed endpoint responds.
const waitForFeed = async (baseUrl: string, maxWaitSeconds: number): Promise<boolean> => {
  const deadline = Date.now() + maxWaitSeconds * 1000;
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}${FEED_PATH}`, { method: "GET" });
      if (response.ok) {
        return true;
      }
    } catch {
      // Network not ready yet; keep retrying.
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await sleep(2000);
  }
};

const feedIsEmpty = async (baseUrl: string): Promise<boolean> => {
  const response = await fetch(`${baseUrl}${FEED_PATH}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`feed check failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { artifacts?: ReadonlyArray<unknown> };
  return (body.artifacts?.length ?? 0) === 0;
};

const publishArtifact = async (
  baseUrl: string,
  writeKey: string,
  init: { readonly filename: string; readonly title: string; readonly description: string; readonly content: string },
): Promise<void> => {
  const form = new FormData();
  form.append("file", new Blob([init.content], { type: "text/markdown" }), init.filename);
  form.append("title", init.title);
  form.append("description", init.description);
  form.append("project", "agent-artifacts");
  form.append("repo", "michael/agent-artifacts");
  form.append("dirty", "0");

  const response = await fetch(`${baseUrl}${PUBLISH_PATH}`, {
    method: "POST",
    headers: { "X-Write-Key": writeKey },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`publish "${init.title}" failed: ${response.status} ${response.statusText}`);
  }
};

const SAMPLE_ARTIFACTS = [
  {
    filename: "preview-overview.md",
    title: "PR Preview Overview",
    description: "A sample artifact seeded into this PR preview deployment.",
    content: [
      "# PR Preview Overview",
      "",
      "This is a sample artifact seeded automatically into the PR preview",
      "deployment so reviewers can see how the feed and artifact pages render",
      "without having to publish anything themselves.",
      "",
      "## What you can do here",
      "",
      "- Browse the artifact feed on the home page.",
      "- Open an artifact page to see its rendered view.",
      "- Download the original source via the source endpoint.",
      "",
      "This artifact is safe to ignore or withdraw; it exists only to give the",
      "preview some content.",
    ].join("\n"),
  },
  {
    filename: "rendering-reference.md",
    title: "Rendering Reference",
    description: "A second seeded artifact covering common Markdown elements.",
    content: [
      "# Rendering Reference",
      "",
      "A second seeded artifact exercising common Markdown rendering.",
      "",
      "## Inline formatting",
      "",
      "You can use **bold**, _italics_, `inline code`, and [links](https://example.com).",
      "",
      "## Lists",
      "",
      "- Unordered item one",
      "- Unordered item two",
      "",
      "1. Ordered item one",
      "2. Ordered item two",
      "",
      "## Code block",
      "",
      "```ts",
      'const greeting = "hello, world";',
      "```",
      "",
      "## Quote",
      "",
      "> Provenance is optional metadata describing where an artifact came from.",
    ].join("\n"),
  },
];

export const seedPreviewArtifacts = async ({
  baseUrl,
  writeKey,
  maxWaitSeconds = 60,
}: SeedPreviewArtifactsOptions): Promise<void> => {
  // Best-effort: a failed seed must never break a preview deploy. Errors are
  // logged and swallowed so the caller's Effect.promise stays in the success
  // channel.
  try {
    const ready = await waitForFeed(baseUrl, maxWaitSeconds);
    if (!ready) {
      console.warn(`seed-preview: worker at ${baseUrl} did not respond within ${maxWaitSeconds}s; skipping seed.`);
      return;
    }

    if (!(await feedIsEmpty(baseUrl))) {
      console.log("seed-preview: catalog already has artifacts; skipping seed.");
      return;
    }

    for (const artifact of SAMPLE_ARTIFACTS) {
      await publishArtifact(baseUrl, writeKey, artifact);
      console.log(`seed-preview: published "${artifact.title}".`);
    }
    console.log("seed-preview: done.");
  } catch (error) {
    console.warn("seed-preview: failed; continuing without seeding.", error);
  }
};

const isMain = import.meta.main === true || process.argv[1]?.endsWith("seed-preview.ts");
if (isMain) {
  const baseUrl = process.env.BASE_URL;
  const writeKey = process.env.WRITE_KEY;
  if (!baseUrl || !writeKey) {
    console.error("seed-preview: BASE_URL and WRITE_KEY environment variables are required.");
    process.exit(1);
  }
  seedPreviewArtifacts({ baseUrl, writeKey }).catch((error) => {
    console.error("seed-preview failed:", error);
    process.exit(1);
  });
}
