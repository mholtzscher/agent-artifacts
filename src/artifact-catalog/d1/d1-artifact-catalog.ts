import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { type Artifact, type Slug } from "../../domain/artifact.js";
import {
  ArtifactCatalog,
  ArtifactCatalogBackendError,
  ArtifactRowSchema,
  type ArtifactRow,
} from "../artifact-catalog.js";

const d1 = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => new ArtifactCatalogBackendError({ cause }),
  });

export const makeD1ArtifactCatalog = (db: D1Database) =>
  ArtifactCatalog.of({
    add: Effect.fn("D1ArtifactCatalog.add")(function* (artifact: Artifact) {
      const row = yield* Schema.encodeEffect(ArtifactRowSchema)(artifact);
      yield* d1(() =>
        db
          .prepare(
            `insert into artifacts (
                id, slug, title, description, source_type, source_filename, sha256, size_bytes,
                project, repo_full_name, branch, commit_sha, dirty, agent, generator, state,
                created_at, updated_at
              ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            row.id,
            row.slug,
            row.title,
            row.description,
            row.source_type,
            row.source_filename,
            row.sha256,
            row.size_bytes,
            row.project,
            row.repo_full_name,
            row.branch,
            row.commit_sha,
            row.dirty,
            row.agent,
            row.generator,
            row.state,
            row.created_at,
            row.updated_at,
          )
          .run(),
      ).pipe(Effect.asVoid);
    }),

    findBySlug: Effect.fn("D1ArtifactCatalog.findBySlug")(function* (slug: Slug) {
      const row = yield* d1(() =>
        db.prepare("select * from artifacts where slug = ? limit 1").bind(slug).first<ArtifactRow>(),
      );
      return yield* Option.fromNullOr(row).pipe(
        Option.match({
          onNone: () => Effect.succeedNone,
          onSome: (row) => Schema.decodeUnknownEffect(ArtifactRowSchema)(row).pipe(Effect.map(Option.some)),
        }),
      );
    }),

    slugExists: Effect.fn("D1ArtifactCatalog.slugExists")(function* (slug: Slug) {
      const row = yield* d1(() =>
        db
          .prepare("select count(*) as count from artifacts where slug = ?")
          .bind(slug)
          .first<{ readonly count: number }>(),
      );
      return (row?.count ?? 0) > 0;
    }),

    listRecent: Effect.fn("D1ArtifactCatalog.listRecent")(function* (limit: number) {
      const rows = yield* d1(() =>
        db.prepare("select * from artifacts order by created_at desc limit ?").bind(limit).all<ArtifactRow>(),
      );
      return yield* Schema.decodeUnknownEffect(Schema.Array(ArtifactRowSchema))(Array.fromIterable(rows.results));
    }),
  });

export const D1ArtifactCatalogLive = (db: D1Database) => Layer.succeed(ArtifactCatalog, makeD1ArtifactCatalog(db));
