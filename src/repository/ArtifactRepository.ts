import { SqlClient } from "@effect/sql"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { Artifact, ArtifactState, type Slug, SourceType } from "../domain/Artifact.js"

const ArtifactRow = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
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
  dirty: Schema.Literal(0, 1),
  agent: Schema.NullOr(Schema.String),
  generator: Schema.NullOr(Schema.String),
  state: ArtifactState,
  created_at: Schema.String,
  updated_at: Schema.String
})

type ArtifactRow = Schema.Schema.Type<typeof ArtifactRow>

const ArtifactFromRow = Schema.transform(ArtifactRow, Artifact, {
  decode: (row) => ({
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
    updatedAt: row.updated_at
  }),
  encode: (artifact) => ({
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
    updated_at: artifact.updatedAt
  }),
  strict: false
})

export class ArtifactRepository extends Effect.Service<ArtifactRepository>()(
  "AgentArtifacts/ArtifactRepository",
  {
    accessors: true,
    effect: Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      return {
        insertArtifact: Effect.fn("ArtifactRepository.insertArtifact")(function*(artifact: Artifact) {
          const row = yield* Schema.encode(ArtifactFromRow)(artifact)
          yield* sql`insert into artifacts ${sql.insert(row)}`
        }),

        findArtifactBySlug: Effect.fn("ArtifactRepository.findArtifactBySlug")(function*(slug: Slug) {
          const rows = yield* sql<ArtifactRow>`select * from artifacts where slug = ${slug} limit 1`
          return rows[0] === undefined
            ? Option.none()
            : Option.some(yield* Schema.decodeUnknown(ArtifactFromRow)(rows[0]))
        }),

        slugExists: Effect.fn("ArtifactRepository.slugExists")(function*(slug: Slug) {
          const rows = yield* sql<
            { readonly count: number }
          >`select count(*) as count from artifacts where slug = ${slug}`
          return (rows[0]?.count ?? 0) > 0
        }),

        listRecentArtifacts: Effect.fn("ArtifactRepository.listRecentArtifacts")(function*(limit: number) {
          const rows = yield* sql<ArtifactRow>`
            select * from artifacts
            order by created_at desc
            limit ${limit}
          `
          return yield* Schema.decodeUnknown(Schema.Array(ArtifactFromRow))(rows)
        })
      }
    })
  }
) {}

export const ArtifactRepositoryLive = ArtifactRepository.Default
