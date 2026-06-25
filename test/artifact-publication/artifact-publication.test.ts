import * as ConfigProvider from "effect/ConfigProvider";
import type { ConfigError } from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Random from "effect/Random";
import { HttpServerRequest } from "effect/unstable/http";
import { describe, expect, it } from "vite-plus/test";

import { Artifact, type Slug } from "../../src/domain/artifact.js";
import { ArtifactPublication, ArtifactPublicationLive } from "../../src/artifact-publication/artifact-publication.js";
import { ArtifactCatalog, ArtifactCatalogBackendError } from "../../src/artifact-catalog/artifact-catalog.js";
import { ArtifactSource, ArtifactSourceBackendError } from "../../src/artifact-source/artifact-source.js";
import { AppConfigLive, AppConfig } from "../../src/runtime/config.js";

const writeKey = "ap_test";
const publicBaseUrl = "http://test.local";

const configTest = AppConfigLive.pipe(
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromEnv({
        env: { PUBLIC_BASE_URL: publicBaseUrl, AGENT_ARTIFACTS_WRITE_KEY: writeKey },
      }),
    ),
  ),
);
const configRelativeTest = AppConfigLive.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AGENT_ARTIFACTS_WRITE_KEY: writeKey } }))),
);
const httpReqTest = (request: Request) =>
  Layer.succeed(HttpServerRequest.HttpServerRequest, HttpServerRequest.fromWeb(request));

const publishRequest = (init: {
  readonly file?: Blob;
  readonly filename?: string;
  readonly fields?: ReadonlyArray<[string, string]>;
  readonly writeKey?: string;
}) => {
  const form = new FormData();
  if (init.file !== undefined) {
    form.append("file", init.file, init.filename ?? "intake.md");
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

const catalogTest = (overrides?: {
  readonly slugExists?: (slug: Slug) => Effect.Effect<boolean, never>;
  readonly add?: (artifact: Artifact) => Effect.Effect<void, ArtifactCatalogBackendError>;
}) =>
  Layer.succeed(
    ArtifactCatalog,
    ArtifactCatalog.of({
      add: overrides?.add ?? (() => Effect.void),
      findBySlug: () => Effect.succeed(Option.none()),
      slugExists: overrides?.slugExists ?? (() => Effect.succeed(false)),
      listRecent: () => Effect.succeed([]),
    }),
  );

const sourceTest = (overrides?: {
  readonly write?: (artifact: Artifact, bytes: Uint8Array) => Effect.Effect<void, ArtifactSourceBackendError>;
  readonly remove?: (artifact: Artifact) => Effect.Effect<void, ArtifactSourceBackendError>;
}) =>
  Layer.succeed(
    ArtifactSource,
    ArtifactSource.of({
      write: overrides?.write ?? (() => Effect.void),
      read: () => Effect.succeed(new Uint8Array()),
      remove: overrides?.remove ?? (() => Effect.void),
    }),
  );

const runPublication = (
  request: Request,
  deps: Layer.Layer<ArtifactCatalog | ArtifactSource> = Layer.mergeAll(catalogTest(), sourceTest()),
  config: Layer.Layer<AppConfig, ConfigError> = configTest,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const publication = yield* ArtifactPublication;
      return yield* publication.publish;
    }).pipe(
      Effect.provide(Layer.mergeAll(ArtifactPublicationLive, config, deps, httpReqTest(request))),
      Random.withSeed(0),
    ),
  );

describe("ArtifactPublication", () => {
  it("publishes through the HTTP request seam", async () => {
    let added: Artifact | undefined;
    let written: { readonly artifact: Artifact; readonly bytes: Uint8Array } | undefined;
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

    const response = await runPublication(
      request,
      Layer.mergeAll(
        catalogTest({
          add: (artifact) =>
            Effect.sync(() => {
              added = artifact;
            }),
        }),
        sourceTest({
          write: (artifact, bytes) =>
            Effect.sync(() => {
              written = { artifact, bytes };
            }),
        }),
      ),
    );

    expect(response.title).toBe("Intake Artifact");
    expect(response.sourceType).toBe("markdown");
    expect(response.slug).toMatch(/^intake-artifact-[0-9a-f]{4}$/);
    expect(response.artifactUrl).toBe(`${publicBaseUrl}/a/${response.slug}`);
    expect(response.sourceUrl).toBe(`${publicBaseUrl}/source/${response.slug}`);

    expect(added).toBeDefined();
    expect(added?.repoFullName).toBe("michael/agent-artifacts");
    expect(added?.project).toBe("agent-artifacts");
    expect(added?.dirty).toBe(true);
    expect(added?.description).toBe(null);
    expect(written?.artifact).toBe(added);
    expect(written?.bytes).toEqual(new TextEncoder().encode(source));
  });

  it("returns relative URLs when PUBLIC_BASE_URL is omitted", async () => {
    const request = publishRequest({
      file: new Blob(["# x"], { type: "text/markdown" }),
      fields: [["title", "Rel"]],
      writeKey,
    });

    const response = await runPublication(request, Layer.mergeAll(catalogTest(), sourceTest()), configRelativeTest);

    expect(response.artifactUrl).toBe(`/a/${response.slug}`);
    expect(response.sourceUrl).toBe(`/source/${response.slug}`);
  });

  it("rejects requests without a write key as UnauthorizedError", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }) });
    await expect(runPublication(request)).rejects.toMatchObject({ _tag: "UnauthorizedError" });
  });

  it("rejects an invalid write key as ForbiddenError", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }), writeKey: "wrong" });
    await expect(runPublication(request)).rejects.toMatchObject({ _tag: "ForbiddenError" });
  });

  it("rejects a multipart body with no file as BadRequestError", async () => {
    const request = publishRequest({ fields: [["title", "No File"]], writeKey });
    await expect(runPublication(request)).rejects.toMatchObject({ _tag: "BadRequestError" });
  });

  it("passes UnsupportedSourceTypeError through unchanged", async () => {
    const request = publishRequest({
      file: new Blob(["plain"], { type: "text/plain" }),
      filename: "notes.txt",
      writeKey,
    });
    await expect(runPublication(request)).rejects.toMatchObject({ _tag: "UnsupportedSourceTypeError" });
  });

  it("fails with SlugGenerationFailedError when every candidate collides", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }), writeKey });
    await expect(
      runPublication(request, Layer.mergeAll(catalogTest({ slugExists: () => Effect.succeed(true) }), sourceTest())),
    ).rejects.toMatchObject({ _tag: "SlugGenerationFailedError" });
  });

  it("maps catalog errors to ServerError", async () => {
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }), writeKey });
    await expect(
      runPublication(
        request,
        Layer.mergeAll(
          catalogTest({ add: () => Effect.fail(new ArtifactCatalogBackendError({ cause: new Error("db down") })) }),
          sourceTest(),
        ),
      ),
    ).rejects.toMatchObject({ _tag: "ServerError" });
  });

  it("removes written Source when metadata insert fails", async () => {
    let written: Artifact | undefined;
    let removed: Artifact | undefined;
    const request = publishRequest({ file: new Blob(["# x"], { type: "text/markdown" }), writeKey });

    await expect(
      runPublication(
        request,
        Layer.mergeAll(
          catalogTest({ add: () => Effect.fail(new ArtifactCatalogBackendError({ cause: new Error("db down") })) }),
          sourceTest({
            write: (artifact) =>
              Effect.sync(() => {
                written = artifact;
              }),
            remove: (artifact) =>
              Effect.sync(() => {
                removed = artifact;
              }),
          }),
        ),
      ),
    ).rejects.toMatchObject({ _tag: "ServerError" });

    expect(written).toBeDefined();
    expect(removed).toBe(written);
  });
});
