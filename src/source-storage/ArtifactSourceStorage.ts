import { FileSystem } from "@effect/platform/FileSystem"
import { Path } from "@effect/platform/Path"
import * as Effect from "effect/Effect"

import { AppConfigService } from "../config/Config.js"
import { type ArtifactId, type SourceType } from "../domain/Artifact.js"
import { extensionForSourceType } from "../domain/ArtifactUtils.js"

export class ArtifactSourceStorage extends Effect.Service<ArtifactSourceStorage>()(
  "AgentArtifacts/ArtifactSourceStorage",
  {
    accessors: true,
    effect: Effect.gen(function*() {
      const config = yield* AppConfigService
      const fs = yield* FileSystem
      const path = yield* Path
      const artifactsDir = path.join(config.storageDir, "artifacts")
      yield* fs.makeDirectory(artifactsDir, { recursive: true })
      yield* Effect.logInfo("artifact source storage initialized").pipe(Effect.annotateLogs("dir", artifactsDir))

      const sourcePathFor = (id: ArtifactId, sourceType: SourceType) =>
        path.join(artifactsDir, id, `source${extensionForSourceType(sourceType)}`)

      return {
        writeSource: Effect.fn("ArtifactSourceStorage.writeSource")(function*(
          id: ArtifactId,
          sourceType: SourceType,
          bytes: Uint8Array
        ) {
          const sourcePath = sourcePathFor(id, sourceType)
          yield* fs.makeDirectory(path.dirname(sourcePath), { recursive: true })
          yield* fs.writeFile(sourcePath, bytes).pipe(
            Effect.tapError(() => Effect.logError("source write failed")),
            Effect.annotateLogs({ artifactId: id, sourceType, path: sourcePath })
          )
        }),

        readSource: Effect.fn("ArtifactSourceStorage.readSource")(function*(
          id: ArtifactId,
          sourceType: SourceType
        ) {
          const sourcePath = sourcePathFor(id, sourceType)
          return yield* fs.readFile(sourcePath).pipe(
            Effect.tapError(() => Effect.logError("source read failed")),
            Effect.annotateLogs({ artifactId: id, sourceType, path: sourcePath })
          )
        }),

        removeSource: Effect.fn("ArtifactSourceStorage.removeSource")(function*(
          id: ArtifactId,
          sourceType: SourceType
        ) {
          const sourcePath = sourcePathFor(id, sourceType)
          yield* fs.remove(sourcePath, { force: true }).pipe(
            Effect.tapError(() => Effect.logError("source remove failed")),
            Effect.annotateLogs({ artifactId: id, sourceType, path: sourcePath })
          )
        })
      }
    })
  }
) {}
