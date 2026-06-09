import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeContext, NodeFileSystem, NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import * as PlatformPath from "@effect/platform/Path"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createServer } from "node:http"

import { AppConfigService, makeConfig } from "./config/Config.js"
import { AppRouter } from "./http/Http.js"
import { ArtifactPublishingLive } from "./publishing/ArtifactPublishing.js"
import { runArtifactMigrations } from "./repository/ArtifactDatabase.js"
import { ArtifactRepositoryLive } from "./repository/ArtifactRepository.js"
import { ArtifactSourceStorage, ensureDataDirectories } from "./source-storage/ArtifactSourceStorage.js"
import { TelemetryLive } from "./telemetry/Telemetry.js"

const main = Effect.gen(function*() {
  const config = yield* makeConfig(process.env)
  const StoragePlatformLive = Layer.merge(NodeFileSystem.layer, PlatformPath.layer)
  yield* ensureDataDirectories(config).pipe(Effect.provide(StoragePlatformLive))

  const ConfigLive = Layer.succeed(AppConfigService, config)
  const SqlLive = SqliteClient.layer({ filename: config.databasePath })
  yield* runArtifactMigrations.pipe(
    Effect.provide(SqlLive),
    Effect.provide(StoragePlatformLive),
    Effect.provide(NodeContext.layer)
  )

  const DataLive = Layer.merge(ArtifactRepositoryLive, ArtifactSourceStorage.Default)
  const AppLive = Layer.merge(
    DataLive,
    ArtifactPublishingLive.pipe(Layer.provide(DataLive))
  ).pipe(
    Layer.provide(SqlLive),
    Layer.provide(StoragePlatformLive)
  )

  const ServerLive = AppRouter.pipe(
    HttpServer.serve(HttpMiddleware.logger),
    HttpServer.withLogAddress,
    Layer.provide(NodeHttpServer.layer(() => createServer(), { port: config.port })),
    Layer.provide(NodeContext.layer),
    Layer.provide(AppLive),
    Layer.provide(ConfigLive)
  )

  yield* Effect.log("agent-artifacts booted")
  yield* Layer.launch(ServerLive)
})

NodeRuntime.runMain(main.pipe(Effect.provide(TelemetryLive)))
