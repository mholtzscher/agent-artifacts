import { SqlClient } from "@effect/sql"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { Artifact, type Slug } from "../domain/Artifact.js"

interface ArtifactRow {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly description: string | null
  readonly source_type: string
  readonly source_filename: string
  readonly sha256: string
  readonly size_bytes: number
  readonly project: string | null
  readonly repo_full_name: string | null
  readonly branch: string | null
  readonly commit_sha: string | null
  readonly dirty: number
  readonly agent: string | null
  readonly generator: string | null
  readonly state: string
  readonly created_at: string
  readonly updated_at: string
}

const rowToArtifact = (row: ArtifactRow) =>
  Schema.decodeUnknownSync(Artifact)({
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
  })

export class ArtifactRepository extends Context.Tag("AgentArtifacts/ArtifactRepository")<
  ArtifactRepository,
  {
    readonly insertArtifact: (artifact: Artifact) => Effect.Effect<void, unknown>
    readonly findArtifactBySlug: (slug: Slug) => Effect.Effect<Artifact | null, unknown>
    readonly slugExists: (slug: Slug) => Effect.Effect<boolean, unknown>
    readonly listRecentArtifacts: (limit: number) => Effect.Effect<ReadonlyArray<Artifact>, unknown>
  }
>() {}

export const initializeDatabase = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(`
    create table if not exists artifacts (
      id text primary key,
      slug text not null unique,
      title text not null,
      description text,
      source_type text not null,
      source_filename text not null,
      sha256 text not null,
      size_bytes integer not null,
      project text,
      repo_full_name text,
      branch text,
      commit_sha text,
      dirty integer not null default 0,
      agent text,
      generator text,
      state text not null default 'active',
      created_at text not null,
      updated_at text not null
    )
  `)
  const columns = yield* sql<{ readonly name: string }>`pragma table_info(artifacts)`
  if (columns.some((column) => column.name === "source_path")) {
    yield* sql.unsafe("alter table artifacts drop column source_path")
  }
  yield* sql.unsafe("create index if not exists artifacts_created_at_idx on artifacts(created_at desc)")
  yield* sql.unsafe("create index if not exists artifacts_state_idx on artifacts(state)")
})

export const ArtifactRepositoryLive = Layer.effect(
  ArtifactRepository,
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    return {
      insertArtifact: (artifact) =>
        Effect.gen(function*() {
          yield* sql`
            insert into artifacts ${
            sql.insert({
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
            })
          }
          `
        }),

      findArtifactBySlug: (slug) =>
        Effect.gen(function*() {
          const rows = yield* sql<ArtifactRow>`select * from artifacts where slug = ${slug} limit 1`
          return rows[0] === undefined ? null : rowToArtifact(rows[0])
        }),

      slugExists: (slug) =>
        Effect.gen(function*() {
          const rows = yield* sql<
            { readonly count: number }
          >`select count(*) as count from artifacts where slug = ${slug}`
          return (rows[0]?.count ?? 0) > 0
        }),

      listRecentArtifacts: (limit) =>
        Effect.gen(function*() {
          const rows = yield* sql<ArtifactRow>`
            select * from artifacts
            order by created_at desc
            limit ${limit}
          `
          return rows.map(rowToArtifact)
        })
    }
  })
)
