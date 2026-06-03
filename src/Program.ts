import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeContext, NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createServer } from "node:http"

import { AppConfigService, makeConfig } from "./Config.js"
import { AppRouter } from "./Http.js"
import { initializeDatabase } from "./Repository.js"
import { ensureDataDirectories } from "./Storage.js"

const main = Effect.gen(function*() {
  const config = yield* makeConfig(process.env)
  yield* ensureDataDirectories(config)

  const ConfigLive = Layer.succeed(AppConfigService, config)
  const SqlLive = SqliteClient.layer({ filename: config.databasePath })

  const ServerLive = AppRouter.pipe(
    HttpServer.serve(HttpMiddleware.logger),
    HttpServer.withLogAddress,
    Layer.provide(NodeHttpServer.layer(() => createServer(), { port: config.port })),
    Layer.provide(NodeContext.layer),
    Layer.provide(SqlLive),
    Layer.provide(ConfigLive)
  )

  yield* initializeDatabase.pipe(Effect.provide(SqlLive))
  yield* Layer.launch(ServerLive)
})

NodeRuntime.runMain(main)
