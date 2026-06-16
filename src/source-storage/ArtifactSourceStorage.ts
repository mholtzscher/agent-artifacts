import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type { PlatformError } from "effect/PlatformError";
import * as Schema from "effect/Schema";

import { type ArtifactId, type SourceType } from "../domain/Artifact.js";

export class ArtifactSourceStorageBackendError extends Schema.TaggedErrorClass<ArtifactSourceStorageBackendError>()(
  "ArtifactSourceStorageBackendError",
  { cause: Schema.Unknown },
) {}

export type ArtifactSourceStorageError = PlatformError | ArtifactSourceStorageBackendError;

export class ArtifactSourceStorage extends Context.Service<
  ArtifactSourceStorage,
  {
    readonly writeSource: (
      id: ArtifactId,
      sourceType: SourceType,
      bytes: Uint8Array,
    ) => Effect.Effect<void, ArtifactSourceStorageError>;
    readonly readSource: (
      id: ArtifactId,
      sourceType: SourceType,
    ) => Effect.Effect<Uint8Array, ArtifactSourceStorageError>;
    readonly removeSource: (id: ArtifactId, sourceType: SourceType) => Effect.Effect<void, ArtifactSourceStorageError>;
  }
>()("AgentArtifacts/ArtifactSourceStorage") {}
