import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { Artifact, Slug } from "../../src/domain/artifact.js";
import { ArtifactCatalog, ArtifactCatalogBackendError } from "../../src/artifact-catalog/artifact-catalog.js";
import { ArtifactSource, ArtifactSourceBackendError } from "../../src/artifact-source/artifact-source.js";
import {
  PublicArtifactAccess,
  PublicArtifactAccessLive,
} from "../../src/public-artifact-access/public-artifact-access.js";

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

const makeCatalog = (find: (slug: Slug) => Effect.Effect<Option.Option<Artifact>, ArtifactCatalogBackendError>) =>
  Layer.succeed(
    ArtifactCatalog,
    ArtifactCatalog.of({
      add: () => Effect.void,
      findBySlug: find,
      slugExists: () => Effect.succeed(false),
      listRecent: () => Effect.succeed([]),
    }),
  );

const catalogWith = (artifact: Option.Option<Artifact>) => makeCatalog(() => Effect.succeed(artifact));
const failingCatalog = () =>
  makeCatalog(() => Effect.fail(new ArtifactCatalogBackendError({ cause: new Error("db down") })));

const makeSource = (read: () => Effect.Effect<Uint8Array, ArtifactSourceBackendError>) =>
  Layer.succeed(
    ArtifactSource,
    ArtifactSource.of({
      write: () => Effect.void,
      read,
      remove: () => Effect.void,
    }),
  );

const sourceWith = (bytes: Uint8Array) => makeSource(() => Effect.succeed(bytes));
const failingSource = () =>
  makeSource(() => Effect.fail(new ArtifactSourceBackendError({ cause: new Error("object missing") })));

const renderedViewProgram = (slug: Slug) =>
  Effect.gen(function* () {
    const access = yield* PublicArtifactAccess;
    return yield* access.renderedView(slug);
  });

const sourceProgram = (slug: Slug) =>
  Effect.gen(function* () {
    const access = yield* PublicArtifactAccess;
    return yield* access.source(slug);
  });

const run = <A, E>(
  deps: Layer.Layer<ArtifactCatalog | ArtifactSource, never, never>,
  program: Effect.Effect<A, E, PublicArtifactAccess | ArtifactCatalog | ArtifactSource>,
) => Effect.runPromise(program.pipe(Effect.provide(Layer.mergeAll(PublicArtifactAccessLive, deps))));

describe("PublicArtifactAccess", () => {
  describe("renderedView", () => {
    it("renders Markdown source into the artifact page", async () => {
      const html = await run(
        Layer.mergeAll(catalogWith(Option.some(mdArtifact)), sourceWith(mdSource)),
        renderedViewProgram(slug),
      );
      expect(html).toContain("<h1>Hello</h1>");
      expect(html).toContain("Test Artifact");
      expect(html).toContain('href="/source/test-artifact-a1b2"');
    });

    it("renders HTML source through the sandboxed iframe wrapper", async () => {
      const html = await run(
        Layer.mergeAll(catalogWith(Option.some(htmlArtifact)), sourceWith(htmlSource)),
        renderedViewProgram(slug),
      );
      expect(html).toContain('<iframe class="source-frame"');
      expect(html).toContain("sandbox=");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes HTML in the Artifact title", async () => {
      const xssArtifact = Artifact.make({
        ...baseFields,
        sourceType: "markdown",
        state: "active",
        title: '<script>alert("xss")</script>',
      });

      const html = await run(
        Layer.mergeAll(catalogWith(Option.some(xssArtifact)), sourceWith(mdSource)),
        renderedViewProgram(slug),
      );

      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    });

    it("fails with ArtifactNotFoundError when the artifact does not exist", async () => {
      await expect(
        run(Layer.mergeAll(catalogWith(Option.none()), sourceWith(mdSource)), renderedViewProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ArtifactNotFoundError" });
    });

    it("fails with ArtifactWithdrawnError when the artifact is withdrawn", async () => {
      await expect(
        run(
          Layer.mergeAll(catalogWith(Option.some(withdrawnArtifact)), sourceWith(mdSource)),
          renderedViewProgram(slug),
        ),
      ).rejects.toMatchObject({ _tag: "ArtifactWithdrawnError" });
    });

    it("maps Source failures to ServerError", async () => {
      await expect(
        run(Layer.mergeAll(catalogWith(Option.some(mdArtifact)), failingSource()), renderedViewProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ServerError" });
    });

    it("maps catalog lookup failures to ServerError", async () => {
      await expect(
        run(Layer.mergeAll(failingCatalog(), sourceWith(mdSource)), renderedViewProgram(slug)),
      ).rejects.toMatchObject({ _tag: "ServerError" });
    });
  });

  describe("source", () => {
    it("serves Markdown bytes with a text/markdown content type", async () => {
      const source = await run(
        Layer.mergeAll(catalogWith(Option.some(mdArtifact)), sourceWith(mdSource)),
        sourceProgram(slug),
      );
      expect(source.bytes).toEqual(mdSource);
      expect(source.contentType).toBe("text/markdown; charset=utf-8");
    });

    it("serves HTML bytes with a text/html content type", async () => {
      const source = await run(
        Layer.mergeAll(catalogWith(Option.some(htmlArtifact)), sourceWith(htmlSource)),
        sourceProgram(slug),
      );
      expect(source.bytes).toEqual(htmlSource);
      expect(source.contentType).toBe("text/html; charset=utf-8");
    });
  });
});
