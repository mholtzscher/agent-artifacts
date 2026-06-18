import { expect, test } from "@playwright/test";

import { publishArtifact, toAbsoluteUrl, uniqueTitle } from "./helpers.js";

const layoutFixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Layout E2E Artifact</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .hero { min-height: 100vh; display: grid; place-items: center; padding: 48px; background: linear-gradient(135deg, #f0f9ff, #eef2ff); }
    .panel { max-width: 960px; border: 1px solid #dbeafe; border-radius: 28px; padding: 48px; background: rgba(255,255,255,.86); box-shadow: 0 24px 80px rgba(30, 41, 59, .12); }
    h1 { margin: 0 0 16px; font-size: clamp(2.5rem, 8vw, 6rem); line-height: .95; }
    p { font-size: 1.25rem; line-height: 1.7; color: #475569; }
    .stripe { height: 70vh; display: grid; place-items: center; font-size: 3rem; font-weight: 800; }
    .stripe:nth-of-type(2) { background: #ecfeff; }
    .stripe:nth-of-type(3) { background: #fef3c7; }
  </style>
</head>
<body>
  <section class="hero">
    <div class="panel">
      <h1>Full-viewport artifact preview</h1>
      <p>This generated HTML artifact is intentionally wide and tall so the detail page layout can be verified quickly.</p>
    </div>
  </section>
  <section class="stripe">Scroll happens inside the artifact</section>
  <section class="stripe">No centered card wrapper</section>
</body>
</html>`;

test("HTML artifact detail page uses full-viewport app shell layout", async ({ baseURL, page, request }) => {
  expect(baseURL).toBeDefined();
  const title = uniqueTitle("E2E Layout Artifact");
  const published = await publishArtifact(
    request,
    { name: "layout-e2e.html", mimeType: "text/html", content: layoutFixture },
    title,
  );

  await page.goto(toAbsoluteUrl(published.artifactUrl, baseURL!));

  await expect(page.getByRole("link", { name: "← Recent artifacts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("link", { name: "Source" })).toBeVisible();
  await expect(page.locator("iframe.source-frame")).toBeVisible();

  const layout = await page.evaluate(() => {
    const banner = document.querySelector(".artifact-banner");
    const preview = document.querySelector(".artifact-preview");
    const frame = document.querySelector("iframe.source-frame");
    if (
      !(banner instanceof HTMLElement) ||
      !(preview instanceof HTMLElement) ||
      !(frame instanceof HTMLIFrameElement)
    ) {
      throw new Error("Artifact shell elements are missing");
    }

    const bannerRect = banner.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      bannerHeight: bannerRect.height,
      previewWidth: previewRect.width,
      previewHeight: previewRect.height,
      frameWidth: frameRect.width,
      frameHeight: frameRect.height,
      bodyOverflow: getComputedStyle(document.body).overflow,
      pageHasVerticalScrollbar: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      previewFillsRemainingHeight: Math.abs(previewRect.height - (innerHeight - bannerRect.height)) <= 1,
      frameFillsPreview:
        Math.abs(frameRect.height - previewRect.height) <= 1 && Math.abs(frameRect.width - previewRect.width) <= 1,
      bannerItems: Array.from(banner.children).map((element) => element.textContent?.trim()),
    };
  });

  expect(layout.bannerHeight).toBeGreaterThanOrEqual(40);
  expect(layout.bannerHeight).toBeLessThanOrEqual(56);
  expect(layout.previewWidth).toBeGreaterThan(0);
  expect(layout.previewHeight).toBeGreaterThan(0);
  expect(layout.frameWidth).toBe(layout.previewWidth);
  expect(layout.frameHeight).toBe(layout.previewHeight);
  expect(layout.bodyOverflow).toBe("hidden");
  expect(layout.pageHasVerticalScrollbar).toBe(false);
  expect(layout.previewFillsRemainingHeight).toBe(true);
  expect(layout.frameFillsPreview).toBe(true);
  expect(layout.bannerItems).toEqual(["← Recent artifacts", title, "Source"]);
});
