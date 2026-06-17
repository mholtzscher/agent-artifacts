import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Slug } from "../domain/Artifact.js";
import { ArtifactRepository } from "../repository/ArtifactRepository.js";
import { ArtifactNotFoundError, ArtifactWithdrawnError } from "./ApiErrors.js";

export const findActiveArtifact = (slug: Slug) =>
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    const artifact = yield* repository.findArtifactBySlug(slug);
    if (Option.isNone(artifact)) {
      return yield* Effect.fail(new ArtifactNotFoundError({ message: "Artifact not found" }));
    }
    if (artifact.value.state === "withdrawn") {
      yield* Effect.logWarning("withdrawn artifact access").pipe(Effect.annotateLogs("artifactId", artifact.value.id));
      return yield* Effect.fail(new ArtifactWithdrawnError({ message: "Artifact withdrawn" }));
    }
    return artifact.value;
  });
