import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeContext, NodeFileSystem, NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import * as PlatformPath from "@effect/platform/Path"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createServer } from "node:http"

import { AppConfigLive, AppConfigService } from "./config/Config.js"
import { AppRouter } from "./http/Http.js"
import { ArtifactPublishingLive } from "./publishing/ArtifactPublishing.js"
import { runArtifactMigrations } from "./repository/ArtifactDatabase.js"
import { ArtifactRepositoryLive } from "./repository/ArtifactRepository.js"
import { ArtifactSourceStorage, ensureDataDirectories } from "./source-storage/ArtifactSourceStorage.js"
import { TelemetryLive } from "./telemetry/Telemetry.js"

const StoragePlatformLive = Layer.merge(NodeFileSystem.layer, PlatformPath.layer)

// Ensures data directories exist, then opens the SQLite client.
const SqlLive = Layer.unwrapEffect(
  Effect.gen(function*() {
    const config = yield* AppConfigService
    yield* ensureDataDirectories(config)
    return SqliteClient.layer({ filename: config.databasePath })
  })
)

// Migrations run as a startup concern, sequenced before anything uses the client.
const DatabaseLive = Layer.effectDiscard(runArtifactMigrations).pipe(
  Layer.provideMerge(SqlLive)
)

const HttpLive = Layer.unwrapEffect(
  Effect.map(AppConfigService, (config) => NodeHttpServer.layer(() => createServer(), { port: config.port }))
)

const DataLive = Layer.merge(ArtifactRepositoryLive, ArtifactSourceStorage.Default)

const MainLive = AppRouter.pipe(
  HttpServer.serve(HttpMiddleware.logger),
  HttpServer.withLogAddress,
  Layer.provide(HttpLive),
  Layer.provide(ArtifactPublishingLive),
  Layer.provide(DataLive),
  Layer.provide(DatabaseLive),
  Layer.provide(AppConfigLive),
  Layer.provide(StoragePlatformLive),
  Layer.provide(NodeContext.layer)
)

NodeRuntime.runMain(
  Effect.log("agent-artifacts booting").pipe(
    Effect.andThen(Layer.launch(MainLive)),
    Effect.provide(TelemetryLive)
  )
)
