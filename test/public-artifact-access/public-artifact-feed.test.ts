import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { Artifact, type ArtifactId, type Slug } from "../../src/domain/artifact.js";
import { ArtifactCatalog, ArtifactCatalogBackendError } from "../../src/artifact-catalog/artifact-catalog.js";
import { ArtifactSource } from "../../src/artifact-source/artifact-source.js";
import {
  PublicArtifactAccess,
  PublicArtifactAccessLive,
} from "../../src/public-artifact-access/public-artifact-access.js";

const baseFields = {
  id: "feed-id-1" as ArtifactId,
  slug: "feed-artifact-a1" as Slug,
  title: "Feed Artifact",
  description: "Shown in the feed",
  sourceType: "markdown" as const,
  sourceFilename: "feed.md",
  sha256: "abc123",
  sizeBytes: 42,
  project: "agent-artifacts",
  repoFullName: "michael/agent-artifacts",
  branch: "main",
  commitSha: "abcdef",
  dirty: true,
  agent: "pi",
  generator: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
} as const;

const activeArtifact = Artifact.make({ ...baseFields, state: "active" as const });
const withdrawnArtifact = Artifact.make({
  ...baseFields,
  id: "feed-id-2" as ArtifactId,
  slug: "withdrawn-feed-artifact-b2" as Slug,
  title: "Withdrawn Feed Artifact",
  state: "withdrawn" as const,
});

const catalogTest = (
  listRecent: (limit: number) => Effect.Effect<ReadonlyArray<Artifact>, ArtifactCatalogBackendError>,
) =>
  Layer.succeed(
    ArtifactCatalog,
    ArtifactCatalog.of({
      add: () => Effect.void,
      findBySlug: () => Effect.succeed(Option.none()),
      slugExists: () => Effect.succeed(false),
      listRecent,
    }),
  );

const sourceTest = Layer.succeed(
  ArtifactSource,
  ArtifactSource.of({
    write: () => Effect.void,
    read: () => Effect.succeed(new Uint8Array()),
    remove: () => Effect.void,
  }),
);

const runFeed = (catalog: Layer.Layer<ArtifactCatalog>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const access = yield* PublicArtifactAccess;
      return yield* access.recentFeed;
    }).pipe(Effect.provide(Layer.mergeAll(PublicArtifactAccessLive, catalog, sourceTest))),
  );

const runHomePage = (catalog: Layer.Layer<ArtifactCatalog>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const access = yield* PublicArtifactAccess;
      return yield* access.homePage;
    }).pipe(Effect.provide(Layer.mergeAll(PublicArtifactAccessLive, catalog, sourceTest))),
  );

describe("PublicArtifactAccess recent feed", () => {
  it("owns the recent feed limit and projects Artifacts into feed items", async () => {
    let requestedLimit: number | undefined;
    const catalog = catalogTest((limit) =>
      Effect.sync(() => {
        requestedLimit = limit;
        return [activeArtifact, withdrawnArtifact];
      }),
    );

    const response = await runFeed(catalog);

    expect(requestedLimit).toBe(50);
    expect(response.artifacts).toEqual([
      {
        id: activeArtifact.id,
        slug: activeArtifact.slug,
        title: activeArtifact.title,
        description: activeArtifact.description,
        sourceType: activeArtifact.sourceType,
        sourceUrl: "/source/feed-artifact-a1",
        artifactUrl: "/a/feed-artifact-a1",
        project: activeArtifact.project,
        repoFullName: activeArtifact.repoFullName,
        branch: activeArtifact.branch,
        commitSha: activeArtifact.commitSha,
        dirty: activeArtifact.dirty,
        agent: activeArtifact.agent,
        generator: activeArtifact.generator,
        state: "active",
        createdAt: activeArtifact.createdAt,
        updatedAt: activeArtifact.updatedAt,
      },
      expect.objectContaining({
        slug: withdrawnArtifact.slug,
        state: "withdrawn",
        sourceUrl: "/source/withdrawn-feed-artifact-b2",
        artifactUrl: "/a/withdrawn-feed-artifact-b2",
      }),
    ]);
  });

  it("renders the home page empty state through the public seam", async () => {
    const html = await runHomePage(catalogTest(() => Effect.succeed([])));

    expect(html).toContain("No artifacts published yet.");
  });

  it("renders artifact cards on the home page through the public seam", async () => {
    const html = await runHomePage(catalogTest(() => Effect.succeed([activeArtifact])));

    expect(html).toContain('href="/a/feed-artifact-a1"');
    expect(html).toContain("Feed Artifact");
    expect(html).toContain("markdown");
  });

  it("maps catalog errors at the public access seam", async () => {
    const catalog = catalogTest(() => Effect.fail(new ArtifactCatalogBackendError({ cause: new Error("db down") })));

    await expect(runFeed(catalog)).rejects.toMatchObject({ _tag: "ServerError" });
  });
});
