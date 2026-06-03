import { SqlClient } from "@effect/sql"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Artifact, type Slug } from "./Domain.js"

export interface NewArtifact {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly description: string | null
  readonly sourceType: string
  readonly sourceFilename: string
  readonly sourcePath: string
  readonly sha256: string
  readonly sizeBytes: number
  readonly project: string | null
  readonly repoFullName: string | null
  readonly branch: string | null
  readonly commitSha: string | null
  readonly dirty: boolean
  readonly agent: string | null
  readonly generator: string | null
  readonly state: "active"
  readonly createdAt: string
  readonly updatedAt: string
}

interface ArtifactRow {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly description: string | null
  readonly source_type: string
  readonly source_filename: string
  readonly source_path: string
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
    sourcePath: row.source_path,
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
      source_path text not null,
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
  yield* sql.unsafe("create index if not exists artifacts_created_at_idx on artifacts(created_at desc)")
  yield* sql.unsafe("create index if not exists artifacts_state_idx on artifacts(state)")
})

export const insertArtifact = (artifact: NewArtifact) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      insert into artifacts ${
      sql.insert({
        id: artifact.id,
        slug: artifact.slug,
        title: artifact.title,
        description: artifact.description,
        source_type: artifact.sourceType,
        source_filename: artifact.sourceFilename,
        source_path: artifact.sourcePath,
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
  })

export const findArtifactBySlug = (slug: Slug) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ArtifactRow>`select * from artifacts where slug = ${slug} limit 1`
    return rows[0] === undefined ? null : rowToArtifact(rows[0])
  })

export const slugExists = (slug: Slug) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ readonly count: number }>`select count(*) as count from artifacts where slug = ${slug}`
    return (rows[0]?.count ?? 0) > 0
  })

export const listRecentArtifacts = (limit: number) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ArtifactRow>`
      select * from artifacts
      where state = 'active'
      order by created_at desc
      limit ${limit}
    `
    return rows.map(rowToArtifact)
  })
