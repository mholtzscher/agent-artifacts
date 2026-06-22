import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { type Artifact, type SourceType } from "../../domain/artifact.js";
import { ArtifactSource, ArtifactSourceBackendError } from "../artifact-source.js";

const extensionForSourceType = (sourceType: SourceType): string => {
  switch (sourceType) {
    case "markdown":
      return ".md";
    case "html":
      return ".html";
  }
};

export const r2SourceKeyFor = (artifact: Artifact) =>
  `artifacts/${artifact.id}/source${extensionForSourceType(artifact.sourceType)}`;

export const makeR2ArtifactSource = (bucket: R2Bucket) =>
  ArtifactSource.of({
    write: Effect.fn("R2ArtifactSource.write")(function* (artifact: Artifact, bytes: Uint8Array) {
      const key = r2SourceKeyFor(artifact);
      yield* Effect.tryPromise({
        try: () => bucket.put(key, bytes),
        catch: (cause) => new ArtifactSourceBackendError({ cause }),
      }).pipe(Effect.asVoid, Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType, key }));
    }),

    read: Effect.fn("R2ArtifactSource.read")(function* (artifact: Artifact) {
      const key = r2SourceKeyFor(artifact);
      const object = yield* Effect.tryPromise({
        try: () => bucket.get(key),
        catch: (cause) => new ArtifactSourceBackendError({ cause }),
      }).pipe(Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType, key }));

      if (object === null) {
        return yield* Effect.fail(new ArtifactSourceBackendError({ cause: new Error(`R2 object not found: ${key}`) }));
      }

      return yield* Effect.tryPromise({
        try: () => object.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
        catch: (cause) => new ArtifactSourceBackendError({ cause }),
      });
    }),

    remove: Effect.fn("R2ArtifactSource.remove")(function* (artifact: Artifact) {
      const key = r2SourceKeyFor(artifact);
      yield* Effect.tryPromise({
        try: () => bucket.delete(key),
        catch: (cause) => new ArtifactSourceBackendError({ cause }),
      }).pipe(Effect.asVoid, Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType, key }));
    }),
  });

export const R2ArtifactSourceLive = (bucket: R2Bucket) => Layer.succeed(ArtifactSource, makeR2ArtifactSource(bucket));
