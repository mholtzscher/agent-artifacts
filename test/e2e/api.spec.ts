import { expect, test } from "@playwright/test";

import { writeKey } from "./helpers.js";

test.describe("artifact API endpoints", () => {
  test("lists artifacts as JSON", async ({ request }) => {
    const response = await request.get("/api/v1/artifacts");

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ artifacts: expect.any(Array) });
  });

  test("rejects publish requests without a write key", async ({ request }) => {
    const response = await request.post("/api/v1/artifacts", {
      multipart: {
        file: { name: "missing-key.md", mimeType: "text/markdown", buffer: Buffer.from("# Missing key") },
      },
    });

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ _tag: "UnauthorizedError" });
  });

  test("rejects publish requests with an invalid write key", async ({ request }) => {
    const response = await request.post("/api/v1/artifacts", {
      headers: { "X-Write-Key": "wrong" },
      multipart: {
        file: { name: "wrong-key.md", mimeType: "text/markdown", buffer: Buffer.from("# Wrong key") },
      },
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ _tag: "ForbiddenError" });
  });

  test("rejects unsupported source types", async ({ request }) => {
    const response = await request.post("/api/v1/artifacts", {
      headers: { "X-Write-Key": writeKey },
      multipart: {
        file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("plain text") },
      },
    });

    expect(response.status()).toBe(415);
    await expect(response.json()).resolves.toMatchObject({ _tag: "UnsupportedSourceTypeError" });
  });

  test("rejects publish requests with no file", async ({ request }) => {
    const response = await request.post("/api/v1/artifacts", {
      headers: { "X-Write-Key": writeKey },
      multipart: {},
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ _tag: "BadRequestError" });
  });

  test("returns not found for missing artifact pages and sources", async ({ request }) => {
    const page = await request.get("/a/e2e-missing-artifact");
    expect(page.status()).toBe(404);

    const source = await request.get("/source/e2e-missing-artifact");
    expect(source.status()).toBe(404);
  });
});
