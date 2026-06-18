import { expect, test } from "@playwright/test";

import { publishArtifact, uniqueTitle } from "./helpers.js";

test.describe("home page", () => {
  test("renders the feed page with heading and valid HTML", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Agent Artifacts" })).toBeVisible();
    // The page must at least contain a well-formed HTML document.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Agent Artifacts");
  });

  test("shows a published artifact on the home page with a link to its detail page", async ({
    baseURL,
    page,
    request,
  }) => {
    expect(baseURL).toBeDefined();
    const title = uniqueTitle("E2E Home Page Artifact");
    const published = await publishArtifact(
      request,
      { name: "home-test.md", mimeType: "text/markdown", content: "# Home test" },
      title,
    );

    await page.goto("/");

    const artifactLink = page.getByRole("link", { name: title });
    await expect(artifactLink).toBeVisible();
    await expect(artifactLink).toHaveAttribute("href", `/a/${published.slug}`);
  });
});
