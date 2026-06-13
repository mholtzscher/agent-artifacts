import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { HttpMiddleware, HttpRouter } from "effect/unstable/http"
import { createServer } from "node:http"

import { AppConfigLive, AppConfigService } from "./config/Config.js"
import { AppRouter } from "./http/Http.js"
import { ArtifactPublishingLive } from "./publishing/ArtifactPublishing.js"
import { ArtifactDatabaseLive } from "./repository/ArtifactDatabase.js"
import { ArtifactRepositoryLive } from "./repository/ArtifactRepository.js"
import { ArtifactSourceStorageLive } from "./source-storage/ArtifactSourceStorage.js"
import { TelemetryLive } from "./telemetry/Telemetry.js"

const HttpLive = Layer.unwrap(
  Effect.map(AppConfigService, (config) => NodeHttpServer.layer(() => createServer(), { port: config.port }))
)

const DataLive = Layer.merge(ArtifactRepositoryLive, ArtifactSourceStorageLive)

const MainLive = HttpRouter.serve(AppRouter, {
  middleware: HttpMiddleware.logger
}).pipe(
  Layer.provide(HttpLive),
  Layer.provide(ArtifactPublishingLive),
  Layer.provide(DataLive),
  Layer.provide(ArtifactDatabaseLive),
  Layer.provide(AppConfigLive),
  Layer.provide(NodeServices.layer)
)

NodeRuntime.runMain(
  Effect.log("agent-artifacts booting").pipe(
    Effect.andThen(Layer.launch(MainLive)),
    Effect.provide(TelemetryLive)
  )
)
