import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { SqlError } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";

import { Artifact, ArtifactId, ArtifactState, Slug, SourceType } from "../domain/Artifact.js";

const ArtifactRow = Schema.Struct({
  id: ArtifactId,
  slug: Slug,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  source_type: SourceType,
  source_filename: Schema.String,
  sha256: Schema.String,
  size_bytes: Schema.Number,
  project: Schema.NullOr(Schema.String),
  repo_full_name: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  commit_sha: Schema.NullOr(Schema.String),
  dirty: Schema.Literals([0, 1]),
  agent: Schema.NullOr(Schema.String),
  generator: Schema.NullOr(Schema.String),
  state: ArtifactState,
  created_at: Schema.String,
  updated_at: Schema.String,
});

type ArtifactRow = Schema.Schema.Type<typeof ArtifactRow>;

const artifactFromRow = (row: ArtifactRow): Artifact =>
  Artifact.make({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    sourceType: row.source_type,
    sourceFilename: row.source_filename,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    project: row.project,
    repoFullName: row.repo_full_name,
    branch: row.branch,
    commitSha: row.commit_sha,
    dirty: row.dirty === 1,
    agent: row.agent,
    generator: row.generator,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const artifactToRow = (artifact: Artifact): ArtifactRow => ({
  id: artifact.id,
  slug: artifact.slug,
  title: artifact.title,
  description: artifact.description,
  source_type: artifact.sourceType,
  source_filename: artifact.sourceFilename,
  sha256: artifact.sha256,
  size_bytes: artifact.sizeBytes,
  project: artifact.project,
  repo_full_name: artifact.repoFullName,
  branch: artifact.branch,
  commit_sha: artifact.commitSha,
  dirty: artifact.dirty ? 1 : 0,
  agent: artifact.agent,
  generator: artifact.generator,
  state: artifact.state,
  created_at: artifact.createdAt,
  updated_at: artifact.updatedAt,
});

export type ArtifactRepositoryError = SqlError.SqlError | Schema.SchemaError;

export class ArtifactRepository extends Context.Service<
  ArtifactRepository,
  {
    readonly insertArtifact: (artifact: Artifact) => Effect.Effect<void, SqlError.SqlError>;
    readonly findArtifactBySlug: (slug: Slug) => Effect.Effect<Option.Option<Artifact>, ArtifactRepositoryError>;
    readonly slugExists: (slug: Slug) => Effect.Effect<boolean, SqlError.SqlError>;
    readonly listRecentArtifacts: (limit: number) => Effect.Effect<ReadonlyArray<Artifact>, ArtifactRepositoryError>;
  }
>()("AgentArtifacts/ArtifactRepository") {}

export const ArtifactRepositoryLive = Layer.effect(
  ArtifactRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return ArtifactRepository.of({
      insertArtifact: Effect.fn("ArtifactRepository.insertArtifact")(function* (artifact: Artifact) {
        const row = artifactToRow(artifact);
        yield* sql`insert into artifacts ${sql.insert(row)}`;
      }),

      findArtifactBySlug: Effect.fn("ArtifactRepository.findArtifactBySlug")(function* (slug: Slug) {
        const rows = yield* sql<ArtifactRow>`select * from artifacts where slug = ${slug} limit 1`;
        return rows[0] === undefined
          ? Option.none()
          : Option.some(artifactFromRow(yield* Schema.decodeUnknownEffect(ArtifactRow)(rows[0])));
      }),

      slugExists: Effect.fn("ArtifactRepository.slugExists")(function* (slug: Slug) {
        const rows = yield* sql<{
          readonly count: number;
        }>`select count(*) as count from artifacts where slug = ${slug}`;
        return (rows[0]?.count ?? 0) > 0;
      }),

      listRecentArtifacts: Effect.fn("ArtifactRepository.listRecentArtifacts")(function* (limit: number) {
        const rows = yield* sql<ArtifactRow>`
            select * from artifacts
            order by created_at desc
            limit ${limit}
          `;
        return (yield* Schema.decodeUnknownEffect(Schema.Array(ArtifactRow))(rows)).map(artifactFromRow);
      }),
    });
  }),
);
