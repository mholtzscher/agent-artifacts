import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeContext, NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createServer } from "node:http"

import { AppConfigService, makeConfig } from "./config/Config.js"
import { AppRouter } from "./http/Http.js"
import { ArtifactPublishingLive } from "./publishing/ArtifactPublishing.js"
import { ArtifactRepositoryLive, initializeDatabase } from "./repository/ArtifactRepository.js"
import { ArtifactSourceStorageLive, ensureDataDirectories } from "./source-storage/ArtifactSourceStorage.js"

const main = Effect.gen(function*() {
  const config = yield* makeConfig(process.env)
  yield* ensureDataDirectories(config)

  const ConfigLive = Layer.succeed(AppConfigService, config)
  const SqlLive = SqliteClient.layer({ filename: config.databasePath })

  const DataLive = Layer.merge(ArtifactRepositoryLive, ArtifactSourceStorageLive)
  const AppLive = Layer.merge(
    DataLive,
    ArtifactPublishingLive.pipe(Layer.provide(DataLive))
  ).pipe(
    Layer.provide(SqlLive),
    Layer.provide(ConfigLive)
  )

  const ServerLive = AppRouter.pipe(
    HttpServer.serve(HttpMiddleware.logger),
    HttpServer.withLogAddress,
    Layer.provide(NodeHttpServer.layer(() => createServer(), { port: config.port })),
    Layer.provide(NodeContext.layer),
    Layer.provide(AppLive),
    Layer.provide(SqlLive),
    Layer.provide(ConfigLive)
  )

  yield* initializeDatabase.pipe(Effect.provide(SqlLive))
  yield* Layer.launch(ServerLive)
})

NodeRuntime.runMain(main)
