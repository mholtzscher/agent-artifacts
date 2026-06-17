import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { type Artifact, type Slug } from "../../domain/Artifact.js";
import {
  ArtifactRepository,
  ArtifactRepositoryBackendError,
  ArtifactRowSchema,
  type ArtifactRow,
} from "../ArtifactRepository.js";
import { CloudflareBindingsService } from "../../cloudflare/Bindings.js";

const decodeRows = (rows: ReadonlyArray<unknown>) => Schema.decodeUnknownEffect(Schema.Array(ArtifactRowSchema))(rows);

export const D1ArtifactRepositoryLive = Layer.effect(
  ArtifactRepository,
  Effect.gen(function* () {
    const env = yield* CloudflareBindingsService;
    const db = env.DB;

    return ArtifactRepository.of({
      insertArtifact: Effect.fn("D1ArtifactRepository.insertArtifact")(function* (artifact: Artifact) {
        const row = yield* Schema.encodeEffect(ArtifactRowSchema)(artifact);
        yield* Effect.tryPromise({
          try: () =>
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
          catch: (cause) => new ArtifactRepositoryBackendError({ cause }),
        }).pipe(Effect.asVoid);
      }),

      findArtifactBySlug: Effect.fn("D1ArtifactRepository.findArtifactBySlug")(function* (slug: Slug) {
        const row = yield* Effect.tryPromise({
          try: () => db.prepare("select * from artifacts where slug = ? limit 1").bind(slug).first<ArtifactRow>(),
          catch: (cause) => new ArtifactRepositoryBackendError({ cause }),
        });
        return row === null ? Option.none() : Option.some(yield* Schema.decodeUnknownEffect(ArtifactRowSchema)(row));
      }),

      slugExists: Effect.fn("D1ArtifactRepository.slugExists")(function* (slug: Slug) {
        const row = yield* Effect.tryPromise({
          try: () =>
            db.prepare("select count(*) as count from artifacts where slug = ?").bind(slug).first<{ count: number }>(),
          catch: (cause) => new ArtifactRepositoryBackendError({ cause }),
        });
        return (row?.count ?? 0) > 0;
      }),

      listRecentArtifacts: Effect.fn("D1ArtifactRepository.listRecentArtifacts")(function* (limit: number) {
        const result = yield* Effect.tryPromise({
          try: () => db.prepare("select * from artifacts order by created_at desc limit ?").bind(limit).all(),
          catch: (cause) => new ArtifactRepositoryBackendError({ cause }),
        });
        return yield* decodeRows(result.results ?? []);
      }),
    });
  }),
);
