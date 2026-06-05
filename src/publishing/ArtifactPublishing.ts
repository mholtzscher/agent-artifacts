import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { Artifact, type Slug } from "../domain/Artifact.js"
import { detectSourceType, inferTitle, makeArtifactId, makeSlugCandidate, sha256Hex } from "../domain/ArtifactUtils.js"
import { ArtifactRepository } from "../repository/ArtifactRepository.js"
import { ArtifactSourceStorage } from "../source-storage/ArtifactSourceStorage.js"

export const PublishArtifactInput = Schema.Struct({
  sourceBytes: Schema.Uint8ArrayFromSelf,
  sourceFilename: Schema.String,
  contentType: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  description: Schema.NullOr(Schema.String),
  project: Schema.NullOr(Schema.String),
  repoFullName: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  commitSha: Schema.NullOr(Schema.String),
  dirty: Schema.Boolean,
  agent: Schema.NullOr(Schema.String),
  generator: Schema.NullOr(Schema.String)
})
export type PublishArtifactInput = Schema.Schema.Type<typeof PublishArtifactInput>

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
          const publishInput = yield* Schema.decodeUnknown(PublishArtifactInput)(input)
          const sourceType = yield* Effect.try({
            try: () => detectSourceType(publishInput.sourceFilename, publishInput.contentType),
            catch: (cause) => cause
          })
          const id = makeArtifactId()
          const title = inferTitle(publishInput.sourceFilename, publishInput.title)
          const slug = yield* makeUniqueSlug(title, repository.slugExists)
          const createdAt = new Date().toISOString()
          const artifact = Artifact.make({
            id,
            slug,
            title,
            description: publishInput.description,
            sourceType,
            sourceFilename: publishInput.sourceFilename,
            sha256: sha256Hex(publishInput.sourceBytes),
            sizeBytes: publishInput.sourceBytes.byteLength,
            project: publishInput.project,
            repoFullName: publishInput.repoFullName,
            branch: publishInput.branch,
            commitSha: publishInput.commitSha,
            dirty: publishInput.dirty,
            agent: publishInput.agent,
            generator: publishInput.generator,
            state: "active",
            createdAt,
            updatedAt: createdAt
          })

          yield* storage.writeSource(id, sourceType, publishInput.sourceBytes)
          yield* repository.insertArtifact(artifact).pipe(
            Effect.tapError(() => storage.removeSource(id, sourceType))
          )

          return artifact
        })
    }
  })
)
