import * as Effect from "effect/Effect";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { ArtifactCatalog } from "../../src/artifact-catalog/artifact-catalog.js";
import { D1ArtifactCatalogLive } from "../../src/artifact-catalog/d1/d1-artifact-catalog.js";
import { Artifact, type ArtifactId, type Slug } from "../../src/domain/artifact.js";

const migrationUrl = new URL("../../migrations/d1/0001_create_artifacts.sql", import.meta.url);

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

const makeD1Database = async () => {
  const miniflare = new Miniflare({
    modules: true,
    script: "",
    d1Databases: { DB: "test-db" },
  });

  const db = await miniflare.getD1Database("DB");
  const migration = await readFile(migrationUrl, "utf8");
  const statements = migration
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }

  return { db, dispose: () => miniflare.dispose() };
};

describe("D1ArtifactCatalog", () => {
  it("persists artifact metadata through direct D1", async () => {
    const { db, dispose } = await makeD1Database();
    try {
      const program = Effect.gen(function* () {
        const catalog = yield* ArtifactCatalog;
        yield* catalog.add(artifact);
        const exists = yield* catalog.slugExists(artifact.slug);
        const found = yield* catalog.findBySlug(artifact.slug);
        const recent = yield* catalog.listRecent(50);
        return { exists, found, recent };
      }).pipe(Effect.provide(D1ArtifactCatalogLive(db)));

      const result = await Effect.runPromise(program);

      expect(result.exists).toBe(true);
      expect(result.found._tag).toBe("Some");
      expect(result.recent).toHaveLength(1);
      expect(result.recent[0]?.slug).toBe(artifact.slug);
    } finally {
      await dispose();
    }
  });
});
