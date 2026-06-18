import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { Artifact, type ArtifactId, type Slug } from "../../src/domain/Artifact.js";
import { ArtifactRepository } from "../../src/repository/ArtifactRepository.js";
import { D1ArtifactRepositoryLive } from "../../src/repository/d1/D1ArtifactRepository.js";
import { D1MiniflareSqlLive } from "./D1Miniflare.js";

const artifact = Artifact.make({
  id: "art_d1" as ArtifactId,
  slug: "d1-artifact" as Slug,
  title: "D1 Artifact",
  description: null,
  sourceType: "markdown",
  sourceFilename: "d1.md",
  sha256: "abc123",
  sizeBytes: 12,
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

describe("D1ArtifactRepository", () => {
  it("persists artifact metadata through Effect sql-d1", async () => {
    const program = Effect.gen(function* () {
      const repository = yield* ArtifactRepository;
      yield* repository.insertArtifact(artifact);
      const exists = yield* repository.slugExists(artifact.slug);
      const found = yield* repository.findArtifactBySlug(artifact.slug);
      const recent = yield* repository.listRecentArtifacts(50);
      return { exists, found, recent };
    }).pipe(Effect.provide(D1ArtifactRepositoryLive), Effect.provide(D1MiniflareSqlLive));

    const result = await Effect.runPromise(program);

    expect(result.exists).toBe(true);
    expect(result.found._tag).toBe("Some");
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0]?.slug).toBe(artifact.slug);
  });
});
