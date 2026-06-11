import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Artifact } from "../domain/Artifact.js"
import { detectSourceType, inferTitle, makeArtifactId, makeSlugCandidate, sha256Hex } from "../domain/ArtifactUtils.js"
import { ArtifactRepository } from "../repository/ArtifactRepository.js"
import { ArtifactSourceStorage } from "../source-storage/ArtifactSourceStorage.js"

export interface PublishArtifactInput {
  readonly sourceBytes: Uint8Array
  readonly sourceFilename: string
  readonly contentType?: string | undefined
  readonly title?: string | undefined
  readonly description: string | null
  readonly project: string | null
  readonly repoFullName: string | null
  readonly branch: string | null
  readonly commitSha: string | null
  readonly dirty: boolean
  readonly agent: string | null
  readonly generator: string | null
}

export class SlugGenerationFailedError extends Schema.TaggedError<SlugGenerationFailedError>()(
  "SlugGenerationFailedError",
  { title: Schema.String }
) {}

const makeUniqueSlug = (title: string, slugExists: ArtifactRepository["slugExists"]) =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const slug = makeSlugCandidate(title)
      if (!(yield* slugExists(slug))) {
        return slug
      }
    }
    return yield* new SlugGenerationFailedError({ title })
  })

export class ArtifactPublishing extends Effect.Service<ArtifactPublishing>()(
  "AgentArtifacts/ArtifactPublishing",
  {
    effect: Effect.gen(function*() {
      const repository = yield* ArtifactRepository
      const storage = yield* ArtifactSourceStorage

      return {
        publish: Effect.fn("ArtifactPublishing.publish")(function*(input: PublishArtifactInput) {
          const sourceType = yield* detectSourceType(input.sourceFilename, input.contentType)
          const id = makeArtifactId()
          const title = inferTitle(input.sourceFilename, input.title)
          const slug = yield* makeUniqueSlug(title, repository.slugExists)
          const createdAt = DateTime.formatIso(yield* DateTime.now)
          const artifact = Artifact.make({
            id,
            slug,
            title,
            description: input.description,
            sourceType,
            sourceFilename: input.sourceFilename,
            sha256: sha256Hex(input.sourceBytes),
            sizeBytes: input.sourceBytes.byteLength,
            project: input.project,
            repoFullName: input.repoFullName,
            branch: input.branch,
            commitSha: input.commitSha,
            dirty: input.dirty,
            agent: input.agent,
            generator: input.generator,
            state: "active",
            createdAt,
            updatedAt: createdAt
          })

          yield* storage.writeSource(id, sourceType, input.sourceBytes)
          yield* repository.insertArtifact(artifact).pipe(
            Effect.tapError(() => storage.removeSource(id, sourceType))
          )

          return artifact
        })
      }
    })
  }
) {}

export const ArtifactPublishingLive = ArtifactPublishing.Default
