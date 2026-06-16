import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Artifact, type Slug, type UnsupportedSourceTypeError } from "../domain/Artifact.js";
import { detectSourceType, inferTitle, makeArtifactId, makeSlugCandidate, sha256Hex } from "../domain/ArtifactUtils.js";
import { ArtifactRepository, type ArtifactRepositoryError } from "../repository/ArtifactRepository.js";
import { ArtifactSourceStorage, type ArtifactSourceStorageError } from "../source-storage/ArtifactSourceStorage.js";

export interface PublishArtifactInput {
  readonly sourceBytes: Uint8Array;
  readonly sourceFilename: string;
  readonly contentType?: string | undefined;
  readonly title?: string | undefined;
  readonly description: string | null;
  readonly project: string | null;
  readonly repoFullName: string | null;
  readonly branch: string | null;
  readonly commitSha: string | null;
  readonly dirty: boolean;
  readonly agent: string | null;
  readonly generator: string | null;
}

export class SlugGenerationFailedError extends Schema.TaggedErrorClass<SlugGenerationFailedError>()(
  "SlugGenerationFailedError",
  { title: Schema.String },
) {}

export type ArtifactPublishingError =
  | UnsupportedSourceTypeError
  | SlugGenerationFailedError
  | ArtifactRepositoryError
  | ArtifactSourceStorageError;

const makeUniqueSlug = (title: string, slugExists: (slug: Slug) => Effect.Effect<boolean, ArtifactRepositoryError>) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 8; attempt++) {
      const slug = makeSlugCandidate(title);
      if (!(yield* slugExists(slug))) {
        return slug;
      }
    }
    yield* Effect.logWarning("slug generation failed").pipe(Effect.annotateLogs("title", title));
    return yield* Effect.fail(new SlugGenerationFailedError({ title }));
  });

export class ArtifactPublishing extends Context.Service<
  ArtifactPublishing,
  {
    readonly publish: (input: PublishArtifactInput) => Effect.Effect<Artifact, ArtifactPublishingError>;
  }
>()("AgentArtifacts/ArtifactPublishing") {}

export const ArtifactPublishingLive = Layer.effect(
  ArtifactPublishing,
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    const storage = yield* ArtifactSourceStorage;

    return ArtifactPublishing.of({
      publish: Effect.fn("ArtifactPublishing.publish")(function* (input: PublishArtifactInput) {
        const sourceType = yield* Effect.fromResult(detectSourceType(input.sourceFilename, input.contentType));
        const id = makeArtifactId();
        const title = inferTitle(input.sourceFilename, input.title);

        const slug = yield* makeUniqueSlug(title, repository.slugExists);

        const createdAt = DateTime.formatIso(yield* DateTime.now);
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
          updatedAt: createdAt,
        });

        return yield* Effect.gen(function* () {
          yield* storage.writeSource(id, sourceType, input.sourceBytes);
          yield* repository
            .insertArtifact(artifact)
            .pipe(
              Effect.tapError(() =>
                Effect.logError("artifact insert failed; removing source").pipe(
                  Effect.andThen(storage.removeSource(id, sourceType)),
                ),
              ),
            );

          return artifact;
        }).pipe(Effect.annotateLogs({ artifactId: id, slug, sourceType }));
      }),
    });
  }),
);
