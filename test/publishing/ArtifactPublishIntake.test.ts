import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SqlError, UnknownError } from "effect/unstable/sql/SqlError";
import { HttpServerRequest } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import { Artifact, type ArtifactId, type Slug, UnsupportedSourceTypeError } from "../../src/domain/Artifact.js";
import { AppConfigService, makeAppConfig } from "../../src/config/Config.js";
import {
  ArtifactPublisher,
  type ArtifactPublisherError,
  type PublishArtifactInput,
  SlugGenerationFailedError,
} from "../../src/publishing/ArtifactPublisher.js";
import { ArtifactRepositoryBackendError } from "../../src/repository/ArtifactRepository.js";
import { ArtifactPublishIntake, ArtifactPublishIntakeLive } from "../../src/publishing/ArtifactPublishIntake.js";

const writeKey = "ap_test";
const publicBaseUrl = "http://test.local";

const fixedArtifact = Artifact.make({
  id: "art_intake" as ArtifactId,
  slug: "intake-artifact-ab" as Slug,
  title: "Intake Artifact",
  description: null,
  sourceType: "markdown",
  sourceFilename: "intake.md",
  sha256: "abc123",
  sizeBytes: 13,
  project: null,
  repoFullName: null,
  branch: null,
  commitSha: null,
  dirty: false,
  agent: null,
  generator: null,
  state: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const configTest = Layer.succeed(AppConfigService, makeAppConfig({ publicBaseUrl, writeKey }));

const publisherTest = (publish: (input: PublishArtifactInput) => Effect.Effect<Artifact, ArtifactPublisherError>) =>
  Layer.succeed(ArtifactPublisher, ArtifactPublisher.of({ publish }));

const httpReqTest = (request: Request) =>
  Layer.succeed(HttpServerRequest.HttpServerRequest, HttpServerRequest.fromWeb(request));

const runIntake = (
  request: Request,
  publish: (input: PublishArtifactInput) => Effect.Effect<Artifact, ArtifactPublisherError>,
) => {
  const intake = ArtifactPublishIntakeLive.pipe(Layer.provide(Layer.mergeAll(configTest, publisherTest(publish))));
  return Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* ArtifactPublishIntake;
      return yield* service.publish;
    }).pipe(Effect.provide(Layer.mergeAll(intake, httpReqTest(request)))),
  );
};

const publishRequest = (init: {
  readonly file?: Blob;
  readonly fields?: ReadonlyArray<[string, string]>;
  readonly writeKey?: string;
}) => {
  const form = new FormData();
  if (init.file !== undefined) {
    form.append("file", init.file, init.file instanceof Blob && init.file.type !== "" ? "intake.md" : "intake.md");
  }
  for (const [key, value] of init.fields ?? []) {
    form.append(key, value);
  }
  const headers: Record<string, string> = {};
  if (init.writeKey !== undefined) {
    headers["X-Write-Key"] = init.writeKey;
  }
  return new Request(`${publicBaseUrl}/api/v1/artifacts`, { method: "POST", headers, body: form });
};

describe("ArtifactPublishIntake", () => {
  it("parses multipart, coerces fields, and assembles response URLs from the public base URL", async () => {
    let captured: PublishArtifactInput | undefined;
    const source = "# Hello\n\nWorld";
    const request = publishRequest({
      file: new Blob([source], { type: "text/markdown" }),
      fields: [
        ["title", "Intake Artifact"],
        ["repo", "michael/agent-artifacts"],
        ["project", "agent-artifacts"],
        ["dirty", "1"],
        ["description", ""],
      ],
      writeKey,
    });

    const response = await runIntake(request, (input) => {
      captured = input;
      return Effect.succeed(fixedArtifact);
    });

    expect(response.id).toBe(fixedArtifact.id);
    expect(response.slug).toBe(fixedArtifact.slug);
    expect(response.artifactUrl).toBe(`${publicBaseUrl}/a/${fixedArtifact.slug}`);
    expect(response.sourceUrl).toBe(`${publicBaseUrl}/source/${fixedArtifact.slug}`);

    expect(captured).toBeDefined();
    expect(captured?.sourceFilename).toBe("intake.md");
    expect(captured?.contentType).toBe("text/markdown");
    expect(captured?.sourceBytes).toEqual(new TextEncoder().encode(source));
    expect(captured?.title).toBe("Intake Artifact");
    expect(captured?.repoFullName).toBe("michael/agent-artifacts");
    expect(captured?.project).toBe("agent-artifacts");
    expect(captured?.dirty).toBe(true);
    expect(captured?.description).toBe(null);
  });

  it("rejects requests without a write key as UnauthorizedError", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }) });
    await expect(runIntake(request, () => Effect.succeed(fixedArtifact))).rejects.toMatchObject({
      _tag: "UnauthorizedError",
    });
  });

  it("rejects an invalid write key as ForbiddenError", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }), writeKey: "wrong" });
    await expect(runIntake(request, () => Effect.succeed(fixedArtifact))).rejects.toMatchObject({
      _tag: "ForbiddenError",
    });
  });

  it("rejects a multipart body with no file as BadRequestError", async () => {
    const request = publishRequest({ fields: [["title", "No File"]], writeKey });
    await expect(runIntake(request, () => Effect.succeed(fixedArtifact))).rejects.toMatchObject({
      _tag: "BadRequestError",
    });
  });

  it("maps a repository backend error to ServerError", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }), writeKey });
    await expect(
      runIntake(request, () => Effect.fail(new ArtifactRepositoryBackendError({ cause: new Error("db down") }))),
    ).rejects.toMatchObject({ _tag: "ServerError" });
  });

  it("maps a raw SqlError to ServerError (broadened mapping)", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }), writeKey });
    await expect(
      runIntake(request, () =>
        Effect.fail(
          new SqlError({ reason: new UnknownError({ cause: new Error("insert failed"), message: "insert failed" }) }),
        ),
      ),
    ).rejects.toMatchObject({ _tag: "ServerError" });
  });

  it("passes UnsupportedSourceTypeError through unchanged", async () => {
    const request = publishRequest({ file: new Blob(["plain"], { type: "text/plain" }), writeKey });
    await expect(
      runIntake(request, () => Effect.fail(new UnsupportedSourceTypeError({ filename: "notes.txt" }))),
    ).rejects.toMatchObject({ _tag: "UnsupportedSourceTypeError" });
  });

  it("passes SlugGenerationFailedError through unchanged", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }), writeKey });
    await expect(
      runIntake(request, () => Effect.fail(new SlugGenerationFailedError({ title: "X" }))),
    ).rejects.toMatchObject({ _tag: "SlugGenerationFailedError" });
  });
});
