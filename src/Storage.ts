import * as Effect from "effect/Effect"
import * as fs from "node:fs/promises"
import * as path from "node:path"

import { extensionForSourceType } from "./ArtifactUtils.js"
import { type AppConfig } from "./Config.js"
import { type ArtifactId, type SourceType } from "./Domain.js"

export const ensureDataDirectories = (config: AppConfig) =>
  Effect.tryPromise({
    try: async () => {
      await fs.mkdir(path.dirname(config.databasePath), { recursive: true })
      await fs.mkdir(config.storageDir, { recursive: true })
    },
    catch: (cause) => cause
  })

export const sourcePathForArtifact = (config: AppConfig, id: ArtifactId, sourceType: SourceType) =>
  path.join(config.storageDir, "artifacts", id, `source${extensionForSourceType(sourceType)}`)

export const writeArtifactSource = (sourcePath: string, bytes: Uint8Array) =>
  Effect.tryPromise({
    try: async () => {
      await fs.mkdir(path.dirname(sourcePath), { recursive: true })
      await fs.writeFile(sourcePath, bytes)
    },
    catch: (cause) => cause
  })

export const readArtifactSource = (sourcePath: string) =>
  Effect.tryPromise({
    try: () => fs.readFile(sourcePath),
    catch: (cause) => cause
  })
