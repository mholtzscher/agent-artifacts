import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { type Artifact, type Slug } from "../domain/Artifact.js";
import { ArtifactNotFoundError, ArtifactWithdrawnError, ServerError } from "../http/ApiErrors.js";
import { ArtifactRepository } from "../repository/ArtifactRepository.js";
import { renderArtifactPage } from "../render/Render.js";
import { ArtifactSourceStorage } from "../source-storage/ArtifactSourceStorage.js";

export interface ArtifactSource {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export type ArtifactPresentationError = ArtifactNotFoundError | ArtifactWithdrawnError | ServerError;

const toServerError = () => new ServerError({ message: "Internal server error" });

const sourceContentType = (artifact: Artifact) =>
  artifact.sourceType === "markdown" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";

export class ArtifactPresentation extends Context.Service<
  ArtifactPresentation,
  {
    readonly renderedView: (slug: Slug) => Effect.Effect<string, ArtifactPresentationError>;
    readonly source: (slug: Slug) => Effect.Effect<ArtifactSource, ArtifactPresentationError>;
  }
>()("AgentArtifacts/ArtifactPresentation") {}

export const ArtifactPresentationLive = Layer.effect(
  ArtifactPresentation,
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    const storage = yield* ArtifactSourceStorage;

    const loadActiveArtifactSource = (slug: Slug) =>
      Effect.gen(function* () {
        const found = yield* repository.findArtifactBySlug(slug).pipe(Effect.mapError(toServerError));
        if (Option.isNone(found)) {
          return yield* Effect.fail(new ArtifactNotFoundError({ message: "Artifact not found" }));
        }
        const artifact = found.value;
        if (artifact.state === "withdrawn") {
          yield* Effect.logWarning("withdrawn artifact access").pipe(Effect.annotateLogs("artifactId", artifact.id));
          return yield* Effect.fail(new ArtifactWithdrawnError({ message: "Artifact withdrawn" }));
        }
        const bytes = yield* storage.readSource(artifact.id, artifact.sourceType).pipe(
          Effect.tapError(() => Effect.logError("artifact source read failed")),
          Effect.mapError(toServerError),
          Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType }),
        );
        return { artifact, bytes };
      }).pipe(Effect.annotateLogs("slug", slug));

    return ArtifactPresentation.of({
      renderedView: Effect.fn("ArtifactPresentation.renderedView")(function* (slug: Slug) {
        const { artifact, bytes } = yield* loadActiveArtifactSource(slug);
        return renderArtifactPage(artifact, new TextDecoder().decode(bytes));
      }),

      source: Effect.fn("ArtifactPresentation.source")(function* (slug: Slug) {
        const { artifact, bytes } = yield* loadActiveArtifactSource(slug);
        return { bytes, contentType: sourceContentType(artifact) };
      }),
    });
  }),
);
