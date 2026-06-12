import { FileSystem } from "@effect/platform/FileSystem"
import { Path } from "@effect/platform/Path"
import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { AppConfigService } from "../config/Config.js"

const migrations = SqliteMigrator.fromRecord({
  "1_create_artifacts": Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    yield* sql`
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
    `

    yield* sql`create index if not exists artifacts_created_at_idx on artifacts(created_at desc)`
    yield* sql`create index if not exists artifacts_state_idx on artifacts(state)`
  }),

  "2_drop_artifacts_source_path": Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const columns = yield* sql<{ readonly name: string }>`pragma table_info(artifacts)`

    if (columns.some((column) => column.name === "source_path")) {
      yield* sql`alter table artifacts drop column source_path`
    }
  })
})

const SqlLive = Layer.unwrapEffect(
  Effect.gen(function*() {
    const config = yield* AppConfigService
    const fs = yield* FileSystem
    const path = yield* Path
    yield* fs.makeDirectory(path.dirname(config.databasePath), { recursive: true })
    return SqliteClient.layer({ filename: config.databasePath })
  })
)

const runArtifactMigrations = SqliteMigrator.run({
  loader: migrations,
  table: "artifact_migrations"
})

// Opens SQLite after ensuring its directory exists, then runs migrations as startup initialization.
export const ArtifactDatabaseLive = Layer.effectDiscard(runArtifactMigrations).pipe(
  Layer.provideMerge(SqlLive)
)
