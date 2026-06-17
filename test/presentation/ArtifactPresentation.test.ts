import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { Artifact, Slug } from "../../src/domain/Artifact.js";
import { ArtifactPresentation, ArtifactPresentationLive } from "../../src/presentation/ArtifactPresentation.js";
import { ArtifactRepository, ArtifactRepositoryBackendError } from "../../src/repository/ArtifactRepository.js";
import {
  ArtifactSourceStorage,
  ArtifactSourceStorageBackendError,
} from "../../src/source-storage/ArtifactSourceStorage.js";

const slug = Slug.make("test-artifact-a1b2");

const baseFields = {
  id: Artifact.fields.id.make("id-1"),
  slug,
  title: "Test Artifact",
  description: null,
  sourceFilename: "test.md",
  sha256: "abc123",
  sizeBytes: 100,
  project: null,
  repoFullName: null,
  branch: null,
  commitSha: null,
  dirty: false,
  agent: null,
  generator: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mdArtifact = Artifact.make({ ...baseFields, sourceType: "markdown", state: "active" });
const htmlArtifact = Artifact.make({
  ...baseFields,
  sourceType: "html",
  state: "active",
  sourceFilename: "report.html",
});
const withdrawnArtifact = Artifact.make({ ...baseFields, sourceType: "markdown", state: "withdrawn" });

const mdSource = new TextEncoder().encode("# Hello\n\nWorld");
const htmlSource = new TextEncoder().encode("<h1>Report</h1><script>alert(1)</script>");

const makeRepo = (find: (slug: Slug) => Effect.Effect<Option.Option<Artifact>, ArtifactRepositoryBackendError>) =>
  Layer.succeed(
    ArtifactRepository,
    ArtifactRepository.of({
      insertArtifact: () => Effect.void,
      findArtifactBySlug: find,
      slugExists: () => Effect.succeed(false),
      listRecentArtifacts: () => Effect.succeed([]),
    }),
  );

const repoWith = (artifact: Option.Option<Artifact>) => makeRepo(() => Effect.succeed(artifact));
const failingRepo = () =>
  makeRepo(() => Effect.fail(new ArtifactRepositoryBackendError({ cause: new Error("db down") })));

const makeStorage = (read: () => Effect.Effect<Uint8Array, ArtifactSourceStorageBackendError>) =>
  Layer.succeed(
    ArtifactSourceStorage,
    ArtifactSourceStorage.of({
      writeSource: () => Effect.void,
      readSource: read,
      removeSource: () => Effect.void,
    }),
  );

const storageWith = (bytes: Uint8Array) => makeStorage(() => Effect.succeed(bytes));
const failingStorage = () =>
  makeStorage(() => Effect.fail(new ArtifactSourceStorageBackendError({ cause: new Error("object missing") })));

const renderedViewProgram = (slug: Slug) =>
  Effect.gen(function* () {
    const presentation = yield* ArtifactPresentation;
    return yield* presentation.renderedView(slug);
  });

const sourceProgram = (slug: Slug) =>
  Effect.gen(function* () {
    const presentation = yield* ArtifactPresentation;
    return yield* presentation.source(slug);
  });

const run = <A, E>(
  deps: Layer.Layer<ArtifactRepository | ArtifactSourceStorage, never, never>,
  program: Effect.Effect<A, E, ArtifactPresentation>,
) => Effect.runPromise(program.pipe(Effect.provide(ArtifactPresentationLive.pipe(Layer.provide(deps)))));

describe("ArtifactPresentation", () => {
  describe("renderedView", () => {
    it("renders Markdown source into the artifact page", async () => {
      const html = await run(
        Layer.mergeAll(repoWith(Option.some(mdArtifact)), storageWith(mdSource)),
        renderedViewProgram(slug),
      );
      expect(html).toContain("<h1>Hello</h1>");
      expect(html).toContain("Test Artifact");
      expect(html).toContain('href="/source/test-artifact-a1b2"');
    });

    it("renders HTML source through the sandboxed iframe wrapper", async () => {
      const html = await run(
        Layer.mergeAll(repoWith(Option.some(htmlArtifact)), storageWith(htmlSource)),
        renderedViewProgram(slug),
      );
      expect(html).toContain('<iframe class="source-frame"');
      expect(html).toContain("sandbox=");
      expect(html).toContain("&lt;script&gt;");
    });

    it("fails with ArtifactNotFoundError when the artifact does not exist", async () => {
      await expect(
        run(Layer.mergeAll(repoWith(Option.none()), storageWith(mdSource)), renderedViewProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ArtifactNotFoundError" });
    });

    it("fails with ArtifactWithdrawnError when the artifact is withdrawn", async () => {
      await expect(
        run(Layer.mergeAll(repoWith(Option.some(withdrawnArtifact)), storageWith(mdSource)), renderedViewProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ArtifactWithdrawnError" });
    });

    it("maps a Source storage failure to ServerError", async () => {
      await expect(
        run(Layer.mergeAll(repoWith(Option.some(mdArtifact)), failingStorage()), renderedViewProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ServerError" });
    });

    it("maps a repository lookup failure to ServerError", async () => {
      await expect(
        run(Layer.mergeAll(failingRepo(), storageWith(mdSource)), renderedViewProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ServerError" });
    });
  });

  describe("source", () => {
    it("serves Markdown bytes with a text/markdown content type", async () => {
      const source = await run(
        Layer.mergeAll(repoWith(Option.some(mdArtifact)), storageWith(mdSource)),
        sourceProgram(slug),
      );
      expect(source.bytes).toEqual(mdSource);
      expect(source.contentType).toBe("text/markdown; charset=utf-8");
    });

    it("serves HTML bytes with a text/html content type", async () => {
      const source = await run(
        Layer.mergeAll(repoWith(Option.some(htmlArtifact)), storageWith(htmlSource)),
        sourceProgram(slug),
      );
      expect(source.bytes).toEqual(htmlSource);
      expect(source.contentType).toBe("text/html; charset=utf-8");
    });

    it("fails with ArtifactNotFoundError when the artifact does not exist", async () => {
      await expect(
        run(Layer.mergeAll(repoWith(Option.none()), storageWith(mdSource)), sourceProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ArtifactNotFoundError" });
    });

    it("fails with ArtifactWithdrawnError when the artifact is withdrawn", async () => {
      await expect(
        run(Layer.mergeAll(repoWith(Option.some(withdrawnArtifact)), storageWith(mdSource)), sourceProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ArtifactWithdrawnError" });
    });

    it("maps a Source storage failure to ServerError", async () => {
      await expect(
        run(Layer.mergeAll(repoWith(Option.some(mdArtifact)), failingStorage()), sourceProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ServerError" });
    });
  });
});
