import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { type Artifact, type Slug } from "../domain/Artifact.js"
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

export class ArtifactPublishing extends Context.Tag("AgentArtifacts/ArtifactPublishing")<
  ArtifactPublishing,
  {
    readonly publish: (input: PublishArtifactInput) => Effect.Effect<Artifact, unknown>
  }
>() {}

const makeUniqueSlug = (title: string, slugExists: (slug: Slug) => Effect.Effect<boolean, unknown>) =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const slug = makeSlugCandidate(title)
      if (!(yield* slugExists(slug))) {
        return slug
      }
    }
    return yield* Effect.fail(new Error("Could not generate a unique slug"))
  })

export const ArtifactPublishingLive = Layer.effect(
  ArtifactPublishing,
  Effect.gen(function*() {
    const repository = yield* ArtifactRepository
    const storage = yield* ArtifactSourceStorage

    return {
      publish: (input) =>
        Effect.gen(function*() {
          const sourceType = yield* Effect.try({
            try: () => detectSourceType(input.sourceFilename, input.contentType),
            catch: (cause) => cause
          })
          const id = makeArtifactId()
          const title = inferTitle(input.sourceFilename, input.title)
          const slug = yield* makeUniqueSlug(title, repository.slugExists)
          const createdAt = new Date().toISOString()
          const artifact: Artifact = {
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
          }

          yield* storage.writeSource(id, sourceType, input.sourceBytes)
          yield* repository.insertArtifact(artifact).pipe(
            Effect.tapError(() => storage.removeSource(id, sourceType))
          )

          return artifact
        })
    }
  })
)
