import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { type ArtifactId, type SourceType } from "../../domain/Artifact.js";
import { extensionForSourceType } from "../../domain/ArtifactUtils.js";
import { ArtifactSourceStorage, ArtifactSourceStorageBackendError } from "../ArtifactSourceStorage.js";
import { CloudflareBindingsService } from "../../runtime/cloudflare/CloudflareBindings.js";

export const r2SourceKeyFor = (id: ArtifactId, sourceType: SourceType) =>
  `artifacts/${id}/source${extensionForSourceType(sourceType)}`;

export const R2ArtifactSourceStorageLive = Layer.effect(
  ArtifactSourceStorage,
  Effect.gen(function* () {
    const env = yield* CloudflareBindingsService;
    const bucket = env.SOURCES;

    return ArtifactSourceStorage.of({
      writeSource: Effect.fn("R2ArtifactSourceStorage.writeSource")(function* (
        id: ArtifactId,
        sourceType: SourceType,
        bytes: Uint8Array,
      ) {
        const key = r2SourceKeyFor(id, sourceType);
        yield* Effect.tryPromise({
          try: () => bucket.put(key, bytes),
          catch: (cause) => new ArtifactSourceStorageBackendError({ cause }),
        }).pipe(Effect.asVoid, Effect.annotateLogs({ artifactId: id, sourceType, key }));
      }),

      readSource: Effect.fn("R2ArtifactSourceStorage.readSource")(function* (id: ArtifactId, sourceType: SourceType) {
        const key = r2SourceKeyFor(id, sourceType);
        const object = yield* Effect.tryPromise({
          try: () => bucket.get(key),
          catch: (cause) => new ArtifactSourceStorageBackendError({ cause }),
        }).pipe(Effect.annotateLogs({ artifactId: id, sourceType, key }));

        if (object === null) {
          return yield* Effect.fail(
            new ArtifactSourceStorageBackendError({ cause: new Error(`R2 object not found: ${key}`) }),
          );
        }

        return yield* Effect.tryPromise({
          try: () => object.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
          catch: (cause) => new ArtifactSourceStorageBackendError({ cause }),
        });
      }),

      removeSource: Effect.fn("R2ArtifactSourceStorage.removeSource")(function* (
        id: ArtifactId,
        sourceType: SourceType,
      ) {
        const key = r2SourceKeyFor(id, sourceType);
        yield* Effect.tryPromise({
          try: () => bucket.delete(key),
          catch: (cause) => new ArtifactSourceStorageBackendError({ cause }),
        }).pipe(Effect.asVoid, Effect.annotateLogs({ artifactId: id, sourceType, key }));
      }),
    });
  }),
);
