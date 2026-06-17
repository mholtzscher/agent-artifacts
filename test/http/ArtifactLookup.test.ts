import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { Artifact, Slug } from "../../src/domain/Artifact.js";
import { findActiveArtifact } from "../../src/http/ArtifactLookup.js";
import { ArtifactRepository } from "../../src/repository/ArtifactRepository.js";

const slug = Slug.make("test-artifact-a1b2");

const baseFields = {
  id: Artifact.fields.id.make("id-1"),
  slug,
  title: "Test Artifact",
  description: null,
  sourceType: "markdown" as const,
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

const activeArtifact = Artifact.make({ ...baseFields, state: "active" });
const withdrawnArtifact = Artifact.make({ ...baseFields, state: "withdrawn" });

describe("ArtifactLookup", () => {
  it("returns the artifact when found and active", async () => {
    const repo = Layer.succeed(
      ArtifactRepository,
      ArtifactRepository.of({
        insertArtifact: () => Effect.void,
        findArtifactBySlug: () => Effect.succeed(Option.some(activeArtifact)),
        slugExists: () => Effect.succeed(false),
        listRecentArtifacts: () => Effect.succeed([]),
      }),
    );

    const result = await Effect.runPromise(findActiveArtifact(slug).pipe(Effect.provide(repo)));

    expect(result.slug).toBe(slug);
    expect(result.state).toBe("active");
  });

  it("fails with ArtifactNotFoundError when the artifact does not exist", async () => {
    const repo = Layer.succeed(
      ArtifactRepository,
      ArtifactRepository.of({
        insertArtifact: () => Effect.void,
        findArtifactBySlug: () => Effect.succeed(Option.none()),
        slugExists: () => Effect.succeed(false),
        listRecentArtifacts: () => Effect.succeed([]),
      }),
    );

    await expect(Effect.runPromise(findActiveArtifact(slug).pipe(Effect.provide(repo)))).rejects.toMatchObject({
      _tag: "ArtifactNotFoundError",
    });
  });

  it("fails with ArtifactWithdrawnError when the artifact is withdrawn", async () => {
    const repo = Layer.succeed(
      ArtifactRepository,
      ArtifactRepository.of({
        insertArtifact: () => Effect.void,
        findArtifactBySlug: () => Effect.succeed(Option.some(withdrawnArtifact)),
        slugExists: () => Effect.succeed(false),
        listRecentArtifacts: () => Effect.succeed([]),
      }),
    );

    await expect(Effect.runPromise(findActiveArtifact(slug).pipe(Effect.provide(repo)))).rejects.toMatchObject({
      _tag: "ArtifactWithdrawnError",
    });
  });
});
