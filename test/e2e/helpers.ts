import { expect, type APIRequestContext } from "@playwright/test";

export const writeKey = "ap_test";

export type PublishedArtifact = {
  readonly slug: string;
  readonly title: string;
  readonly sourceType: "markdown" | "html";
  readonly sourceUrl: string;
  readonly artifactUrl: string;
};

export const uniqueTitle = (prefix: string) => `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2)}`;

export const publishArtifact = async (
  request: APIRequestContext,
  file: {
    readonly name: string;
    readonly mimeType: string;
    readonly content: string;
  },
  title: string,
): Promise<PublishedArtifact> => {
  const response = await request.post("/api/v1/artifacts", {
    headers: { "X-Write-Key": writeKey },
    multipart: {
      file: {
        name: file.name,
        mimeType: file.mimeType,
        buffer: Buffer.from(file.content),
      },
      title,
    },
  });

  expect(response.status()).toBe(201);
  return (await response.json()) as PublishedArtifact;
};

export const toAbsoluteUrl = (url: string, baseURL: string) => new URL(url, baseURL).toString();
