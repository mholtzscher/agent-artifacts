import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type { PlatformError } from "effect/PlatformError";
import * as Schema from "effect/Schema";

import { type Artifact } from "../domain/artifact.js";

export class ArtifactSourceBackendError extends Schema.TaggedErrorClass<ArtifactSourceBackendError>()(
  "ArtifactSourceBackendError",
  { cause: Schema.Unknown },
  { httpApiStatus: 500 },
) {}

export type ArtifactSourceError = PlatformError | ArtifactSourceBackendError;

export class ArtifactSource extends Context.Service<
  ArtifactSource,
  {
    readonly write: (artifact: Artifact, bytes: Uint8Array) => Effect.Effect<void, ArtifactSourceError>;
    readonly read: (artifact: Artifact) => Effect.Effect<Uint8Array, ArtifactSourceError>;
    readonly remove: (artifact: Artifact) => Effect.Effect<void, ArtifactSourceError>;
  }
>()("AgentArtifacts/ArtifactSource") {}
