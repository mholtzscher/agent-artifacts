import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { type Artifact, type Slug } from "../../domain/artifact.js";
import { ArtifactCatalog, ArtifactRowSchema, type ArtifactRow } from "../artifact-catalog.js";

export const D1ArtifactCatalogLive = Layer.effect(
  ArtifactCatalog,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return ArtifactCatalog.of({
      add: Effect.fn("D1ArtifactCatalog.add")(function* (artifact: Artifact) {
        const row = yield* Schema.encodeEffect(ArtifactRowSchema)(artifact);
        yield* sql`
          insert into artifacts (
            id, slug, title, description, source_type, source_filename, sha256, size_bytes,
            project, repo_full_name, branch, commit_sha, dirty, agent, generator, state,
            created_at, updated_at
          ) values (
            ${row.id}, ${row.slug}, ${row.title}, ${row.description}, ${row.source_type}, ${row.source_filename},
            ${row.sha256}, ${row.size_bytes}, ${row.project}, ${row.repo_full_name}, ${row.branch}, ${row.commit_sha},
            ${row.dirty}, ${row.agent}, ${row.generator}, ${row.state}, ${row.created_at}, ${row.updated_at}
          )
        `.pipe(Effect.asVoid);
      }),

      findBySlug: Effect.fn("D1ArtifactCatalog.findBySlug")(function* (slug: Slug) {
        const rows = yield* sql<ArtifactRow>`select * from artifacts where slug = ${slug} limit 1`;
        return yield* Array.head(rows).pipe(
          Option.match({
            onNone: () => Effect.succeedNone,
            onSome: (row) => Schema.decodeUnknownEffect(ArtifactRowSchema)(row).pipe(Effect.map(Option.some)),
          }),
        );
      }),

      slugExists: Effect.fn("D1ArtifactCatalog.slugExists")(function* (slug: Slug) {
        const rows = yield* sql<{
          readonly count: number;
        }>`select count(*) as count from artifacts where slug = ${slug}`;
        return (rows[0]?.count ?? 0) > 0;
      }),

      listRecent: Effect.fn("D1ArtifactCatalog.listRecent")(function* (limit: number) {
        const rows = yield* sql<ArtifactRow>`select * from artifacts order by created_at desc limit ${limit}`;
        return yield* Schema.decodeUnknownEffect(Schema.Array(ArtifactRowSchema))(rows);
      }),
    });
  }),
);
