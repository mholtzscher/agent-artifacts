import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { Artifact, type ArtifactId, type Slug } from "../../src/domain/artifact.js";
import { ArtifactCatalog } from "../../src/artifact-catalog/artifact-catalog.js";
import { D1ArtifactCatalogLive } from "../../src/artifact-catalog/d1/d1-artifact-catalog.js";
import { D1MiniflareSqlLive } from "../cloudflare/d1-miniflare.js";

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

describe("D1ArtifactCatalog", () => {
  it("persists artifact metadata through Effect sql-d1", async () => {
    const program = Effect.gen(function* () {
      const catalog = yield* ArtifactCatalog;
      yield* catalog.add(artifact);
      const exists = yield* catalog.slugExists(artifact.slug);
      const found = yield* catalog.findBySlug(artifact.slug);
      const recent = yield* catalog.listRecent(50);
      return { exists, found, recent };
    }).pipe(Effect.provide(D1ArtifactCatalogLive), Effect.provide(D1MiniflareSqlLive));

    const result = await Effect.runPromise(program);

    expect(result.exists).toBe(true);
    expect(result.found._tag).toBe("Some");
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0]?.slug).toBe(artifact.slug);
  });
});
