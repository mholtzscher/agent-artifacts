import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as fs from "node:fs/promises"
import * as path from "node:path"

import { type AppConfig, AppConfigService } from "../config/Config.js"
import { type ArtifactId, type SourceType } from "../domain/Artifact.js"
import { extensionForSourceType } from "../domain/ArtifactUtils.js"

export class ArtifactSourceStorage extends Context.Tag("AgentArtifacts/ArtifactSourceStorage")<
  ArtifactSourceStorage,
  {
    readonly writeSource: (id: ArtifactId, sourceType: SourceType, bytes: Uint8Array) => Effect.Effect<void, unknown>
    readonly readSource: (id: ArtifactId, sourceType: SourceType) => Effect.Effect<Uint8Array, unknown>
    readonly removeSource: (id: ArtifactId, sourceType: SourceType) => Effect.Effect<void, unknown>
  }
>() {}

export const ensureDataDirectories = (config: AppConfig) =>
  Effect.tryPromise({
    try: async () => {
      await fs.mkdir(path.dirname(config.databasePath), { recursive: true })
      await fs.mkdir(config.storageDir, { recursive: true })
    },
    catch: (cause) => cause
  })

const sourcePathForArtifact = (config: AppConfig, id: ArtifactId, sourceType: SourceType) =>
  path.join(config.storageDir, "artifacts", id, `source${extensionForSourceType(sourceType)}`)

export const ArtifactSourceStorageLive = Layer.effect(
  ArtifactSourceStorage,
  Effect.gen(function*() {
    const config = yield* AppConfigService

    return {
      writeSource: (id, sourceType, bytes) =>
        Effect.tryPromise({
          try: async () => {
            const sourcePath = sourcePathForArtifact(config, id, sourceType)
            await fs.mkdir(path.dirname(sourcePath), { recursive: true })
            await fs.writeFile(sourcePath, bytes)
          },
          catch: (cause) => cause
        }),

      readSource: (id, sourceType) =>
        Effect.tryPromise({
          try: () => fs.readFile(sourcePathForArtifact(config, id, sourceType)),
          catch: (cause) => cause
        }),

      removeSource: (id, sourceType) =>
        Effect.tryPromise({
          try: () => fs.rm(sourcePathForArtifact(config, id, sourceType), { force: true }),
          catch: (cause) => cause
        })
    }
  })
)
