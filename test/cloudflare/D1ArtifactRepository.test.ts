import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { D1ArtifactRepositoryLive } from "../../src/repository/d1/D1ArtifactRepository.js";
import { CloudflareBindingsLive, type CloudflareBindings } from "../../src/runtime/cloudflare/CloudflareBindings.js";
import { Artifact, type ArtifactId, type Slug } from "../../src/domain/Artifact.js";
import { ArtifactRepository } from "../../src/repository/ArtifactRepository.js";

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

const makeD1 = () => {
  const rows = new Map<string, Record<string, unknown>>();
  const db = {
    prepare: (sql: string) => {
      let bound: ReadonlyArray<unknown> = [];
      const statement = {
        bind: (...values: ReadonlyArray<unknown>) => {
          bound = values;
          return statement;
        },
        run: async () => {
          if (sql.startsWith("insert into artifacts")) {
            rows.set(String(bound[1]), {
              id: bound[0],
              slug: bound[1],
              title: bound[2],
              description: bound[3],
              source_type: bound[4],
              source_filename: bound[5],
              sha256: bound[6],
              size_bytes: bound[7],
              project: bound[8],
              repo_full_name: bound[9],
              branch: bound[10],
              commit_sha: bound[11],
              dirty: bound[12],
              agent: bound[13],
              generator: bound[14],
              state: bound[15],
              created_at: bound[16],
              updated_at: bound[17],
            });
          }
          return { success: true };
        },
        first: async () => {
          if (sql.startsWith("select count(*)")) {
            return { count: rows.has(String(bound[0])) ? 1 : 0 };
          }
          return rows.get(String(bound[0])) ?? null;
        },
        all: async () => ({ results: Array.from(rows.values()) }),
      };
      return statement;
    },
  } as unknown as D1Database;

  return db;
};

const makeEnv = (db: D1Database): CloudflareBindings => ({
  DB: db,
  SOURCES: {} as R2Bucket,
  AGENT_ARTIFACTS_WRITE_KEY: "ap_test",
});

describe("D1ArtifactRepository", () => {
  it("persists artifact metadata through D1", async () => {
    const db = makeD1();

    const program = Effect.gen(function* () {
      const repository = yield* ArtifactRepository;
      yield* repository.insertArtifact(artifact);
      const exists = yield* repository.slugExists(artifact.slug);
      const found = yield* repository.findArtifactBySlug(artifact.slug);
      const recent = yield* repository.listRecentArtifacts(50);
      return { exists, found, recent };
    }).pipe(Effect.provide(D1ArtifactRepositoryLive), Effect.provide(CloudflareBindingsLive(makeEnv(db))));

    const result = await Effect.runPromise(program);

    expect(result.exists).toBe(true);
    expect(result.found._tag).toBe("Some");
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0]?.slug).toBe(artifact.slug);
  });
});
