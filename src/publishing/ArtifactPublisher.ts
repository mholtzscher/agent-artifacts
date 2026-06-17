import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import * as Schema from "effect/Schema";

import { Artifact, Slug, type UnsupportedSourceTypeError } from "../domain/Artifact.js";
import { detectSourceType, inferTitle, makeArtifactId, sha256Hex, slugBase } from "../domain/ArtifactUtils.js";
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
  { httpApiStatus: 409 },
) {}

export type ArtifactPublisherError =
  | UnsupportedSourceTypeError
  | SlugGenerationFailedError
  | ArtifactRepositoryError
  | ArtifactSourceStorageError;

const makeSlugCandidate = (title: string): Effect.Effect<Slug> =>
  Effect.gen(function* () {
    const bytes = [yield* Random.nextIntBetween(0, 255), yield* Random.nextIntBetween(0, 255)];
    const suffix = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return Slug.make(`${slugBase(title)}-${suffix}`);
  });

const makeUniqueSlug = (title: string, slugExists: (slug: Slug) => Effect.Effect<boolean, ArtifactRepositoryError>) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 8; attempt++) {
      const slug = yield* makeSlugCandidate(title);
      if (!(yield* slugExists(slug))) {
        return slug;
      }
    }
    yield* Effect.logWarning("slug generation failed").pipe(Effect.annotateLogs("title", title));
    return yield* Effect.fail(new SlugGenerationFailedError({ title }));
  });

export class ArtifactPublisher extends Context.Service<
  ArtifactPublisher,
  {
    readonly publish: (input: PublishArtifactInput) => Effect.Effect<Artifact, ArtifactPublisherError>;
  }
>()("AgentArtifacts/ArtifactPublisher") {}

export const ArtifactPublisherLive = Layer.effect(
  ArtifactPublisher,
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    const storage = yield* ArtifactSourceStorage;

    return ArtifactPublisher.of({
      publish: Effect.fn("ArtifactPublisher.publish")(function* (input: PublishArtifactInput) {
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
          sha256: yield* sha256Hex(input.sourceBytes),
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
