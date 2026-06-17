import { describe, expect, it } from "vitest";

import { Artifact } from "../../src/domain/Artifact.js";
import { renderArtifactPage, renderFeedPage } from "../../src/render/Render.js";

const baseFields = {
  id: "test-id" as Artifact["id"],
  slug: "hello-world-ab" as Artifact["slug"],
  title: "Hello World",
  description: null,
  sourceFilename: "hello.md",
  sha256: "abc123",
  sizeBytes: 100,
  project: null,
  repoFullName: null,
  branch: null,
  commitSha: null,
  dirty: false,
  agent: null,
  generator: null,
  state: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const mdArtifact = Artifact.make({ ...baseFields, sourceType: "markdown" as const });
const htmlArtifact = Artifact.make({ ...baseFields, sourceType: "html" as const, sourceFilename: "report.html" });

describe("renderFeedPage", () => {
  it("shows an empty-state message when no artifacts exist", () => {
    const html = renderFeedPage([]);
    expect(html).toContain("No artifacts published yet.");
  });

  it("renders artifact cards with title links and source type metadata", () => {
    const html = renderFeedPage([mdArtifact]);
    expect(html).toContain('href="/a/hello-world-ab"');
    expect(html).toContain("Hello World");
    expect(html).toContain("markdown");
  });
});

describe("renderArtifactPage", () => {
  it("renders Markdown source in an <article>", () => {
    const html = renderArtifactPage(mdArtifact, "# Hello\n\nWorld");
    expect(html).toContain("<article>");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("Source");
  });

  it("renders HTML source in an iframe with srcdoc", () => {
    const html = renderArtifactPage(htmlArtifact, "<h1>Report</h1><script>alert(1)</script>");
    expect(html).toContain('<iframe class="source-frame"');
    expect(html).toContain("sandbox=");
    expect(html).toContain("srcdoc=");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in the artifact title", () => {
    const xssArtifact = Artifact.make({
      ...baseFields,
      sourceType: "markdown" as const,
      title: '<script>alert("xss")</script>',
    });
    const html = renderArtifactPage(xssArtifact, "# Safe");
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });
});
