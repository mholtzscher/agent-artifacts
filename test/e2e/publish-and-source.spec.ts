import { expect, test } from "@playwright/test";

import { publishArtifact, toAbsoluteUrl, uniqueTitle } from "./helpers.js";

test.describe("artifact publishing and source retrieval", () => {
  test("publishes Markdown and serves feed, rendered view, and immutable source", async ({ baseURL, request }) => {
    expect(baseURL).toBeDefined();
    const title = uniqueTitle("E2E Markdown Artifact");
    const published = await publishArtifact(
      request,
      { name: "e2e-plan.md", mimeType: "text/markdown", content: "# E2E Markdown\n\nHello from Playwright." },
      title,
    );

    expect(published.title).toBe(title);
    expect(published.sourceType).toBe("markdown");
    expect(toAbsoluteUrl(published.sourceUrl, baseURL!)).toBe(`${baseURL}/source/${published.slug}`);
    expect(toAbsoluteUrl(published.artifactUrl, baseURL!)).toBe(`${baseURL}/a/${published.slug}`);

    const feedResponse = await request.get("/api/v1/artifacts");
    const feed = (await feedResponse.json()) as { readonly artifacts: ReadonlyArray<{ readonly slug: string }> };
    expect(feed.artifacts.some((artifact) => artifact.slug === published.slug)).toBe(true);

    const sourceResponse = await request.get(`/source/${published.slug}`);
    expect(sourceResponse.headers()["content-type"]).toContain("text/markdown");
    await expect(sourceResponse.text()).resolves.toBe("# E2E Markdown\n\nHello from Playwright.");

    const renderedResponse = await request.get(`/a/${published.slug}`);
    expect(renderedResponse.headers()["content-type"]).toContain("text/html");
    await expect(renderedResponse.text()).resolves.toContain("<h1>E2E Markdown</h1>");
  });

  test("publishes HTML and renders it through the artifact wrapper", async ({ request }) => {
    const title = uniqueTitle("E2E HTML Artifact");
    const html = "<h1>HTML Artifact</h1><script>window.__agentArtifact = true</script>";
    const published = await publishArtifact(
      request,
      { name: "e2e-report.html", mimeType: "text/html", content: html },
      title,
    );

    expect(published.sourceType).toBe("html");

    const source = await request.get(`/source/${published.slug}`).then((response) => response.text());
    expect(source).toContain("window.__agentArtifact");

    const rendered = await request.get(`/a/${published.slug}`).then((response) => response.text());
    expect(rendered).toContain("source-frame");
    expect(rendered).toContain("sandbox=");
    expect(rendered).toContain("window.__agentArtifact");
  });
});
