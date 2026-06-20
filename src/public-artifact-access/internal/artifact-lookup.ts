/**
 * Internal implementation detail of PublicArtifactAccess.
 * Do not import outside src/public-artifact-access/.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type Artifact, type Slug } from "../../domain/artifact.js";
import { ArtifactNotFoundError, ArtifactWithdrawnError, ServerError } from "../../domain/artifact-errors.js";
import { type ArtifactCatalogError } from "../../artifact-catalog/artifact-catalog.js";
import { type ArtifactSourceError } from "../../artifact-source/artifact-source.js";

export interface PublicArtifactSource {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export type PublicArtifactAccessError = ArtifactNotFoundError | ArtifactWithdrawnError | ServerError;

const toServerError = () => new ServerError({ message: "Internal server error" });
const toPublicError = (_error: ArtifactCatalogError | ArtifactSourceError): PublicArtifactAccessError =>
  toServerError();

export const sourceContentType = (artifact: Artifact) =>
  artifact.sourceType === "markdown" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";

export const loadActiveArtifactSource = (input: {
  readonly catalog: {
    readonly findBySlug: (slug: Slug) => Effect.Effect<Option.Option<Artifact>, ArtifactCatalogError>;
  };
  readonly artifactSource: {
    readonly read: (artifact: Artifact) => Effect.Effect<Uint8Array, ArtifactSourceError>;
  };
  readonly slug: Slug;
}) =>
  Effect.gen(function* () {
    const found = yield* input.catalog.findBySlug(input.slug).pipe(Effect.mapError(toPublicError));
    if (Option.isNone(found)) {
      return yield* Effect.fail(new ArtifactNotFoundError({ message: "Artifact not found" }));
    }
    const artifact = found.value;
    if (artifact.state === "withdrawn") {
      yield* Effect.logWarning("withdrawn artifact access").pipe(Effect.annotateLogs("artifactId", artifact.id));
      return yield* Effect.fail(new ArtifactWithdrawnError({ message: "Artifact withdrawn" }));
    }
    const bytes = yield* input.artifactSource.read(artifact).pipe(
      Effect.tapError(() => Effect.logError("artifact source read failed")),
      Effect.mapError(toPublicError),
      Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType }),
    );
    return { artifact, bytes };
  }).pipe(Effect.annotateLogs("slug", input.slug));
