import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Random from "effect/Random";
import { SqlError, UnknownError } from "effect/unstable/sql/SqlError";
import { describe, expect, it } from "vitest";

import type { Artifact } from "../../src/domain/Artifact.js";
import {
  ArtifactPublishing,
  ArtifactPublishingLive,
  type PublishArtifactInput,
} from "../../src/publishing/ArtifactPublishing.js";
import { ArtifactRepository } from "../../src/repository/ArtifactRepository.js";
import { ArtifactSourceStorage } from "../../src/source-storage/ArtifactSourceStorage.js";

const input: PublishArtifactInput = {
  sourceBytes: new TextEncoder().encode("# Hello"),
  sourceFilename: "hello.md",
  contentType: "text/markdown",
  title: "Hello Artifact",
  description: null,
  project: null,
  repoFullName: null,
  branch: null,
  commitSha: null,
  dirty: false,
  agent: null,
  generator: null,
};

describe("ArtifactPublishing", () => {
  it("publishes a complete Artifact through repository and Source storage seams", async () => {
    const inserted: Array<Artifact> = [];
    const written: Array<{ readonly id: Artifact["id"]; readonly bytes: Uint8Array }> = [];

    const RepositoryTest = Layer.succeed(
      ArtifactRepository,
      ArtifactRepository.of({
        insertArtifact: (artifact) => Effect.sync(() => inserted.push(artifact)).pipe(Effect.asVoid),
        findArtifactBySlug: () => Effect.succeed(Option.none()),
        slugExists: () => Effect.succeed(false),
        listRecentArtifacts: () => Effect.succeed([]),
      }),
    );
    const StorageTest = Layer.succeed(
      ArtifactSourceStorage,
      ArtifactSourceStorage.of({
        writeSource: (id, _sourceType, bytes) => Effect.sync(() => written.push({ id, bytes })).pipe(Effect.asVoid),
        readSource: () => Effect.succeed(new Uint8Array()),
        removeSource: () => Effect.void,
      }),
    );
    const TestLive = ArtifactPublishingLive.pipe(Layer.provide(RepositoryTest), Layer.provide(StorageTest));

    const artifact = await Effect.runPromise(
      Effect.gen(function* () {
        const publishing = yield* ArtifactPublishing;
        return yield* publishing.publish(input);
      }).pipe(Effect.provide(TestLive)),
    );

    expect(artifact.title).toBe("Hello Artifact");
    expect(artifact.sourceType).toBe("markdown");
    expect(artifact.sourceFilename).toBe("hello.md");
    expect(artifact.state).toBe("active");
    expect(artifact.sizeBytes).toBe(input.sourceBytes.byteLength);
    expect(inserted).toEqual([artifact]);
    expect(written).toEqual([{ id: artifact.id, bytes: input.sourceBytes }]);
  });

  it("removes written Source when metadata insert fails", async () => {
    let writtenId: Artifact["id"] | undefined;
    let removedId: Artifact["id"] | undefined;

    const RepositoryTest = Layer.succeed(
      ArtifactRepository,
      ArtifactRepository.of({
        insertArtifact: () =>
          Effect.fail(
            new SqlError({ reason: new UnknownError({ cause: new Error("insert failed"), message: "insert failed" }) }),
          ),
        findArtifactBySlug: () => Effect.succeed(Option.none()),
        slugExists: () => Effect.succeed(false),
        listRecentArtifacts: () => Effect.succeed([]),
      }),
    );
    const StorageTest = Layer.succeed(
      ArtifactSourceStorage,
      ArtifactSourceStorage.of({
        writeSource: (id) =>
          Effect.sync(() => {
            writtenId = id;
          }),
        readSource: () => Effect.succeed(new Uint8Array()),
        removeSource: (id) =>
          Effect.sync(() => {
            removedId = id;
          }),
      }),
    );
    const TestLive = ArtifactPublishingLive.pipe(Layer.provide(RepositoryTest), Layer.provide(StorageTest));

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const publishing = yield* ArtifactPublishing;
          return yield* publishing.publish(input);
        }).pipe(Effect.provide(TestLive)),
      ),
    ).rejects.toThrow("insert failed");

    expect(writtenId).toBeDefined();
    expect(removedId).toBe(writtenId);
  });

  it("retries with a new slug candidate on collision and succeeds", async () => {
    let slugExistsCalls = 0;
    const RepositoryTest = Layer.succeed(
      ArtifactRepository,
      ArtifactRepository.of({
        insertArtifact: () => Effect.void,
        findArtifactBySlug: () => Effect.succeed(Option.none()),
        slugExists: () =>
          Effect.sync(() => {
            slugExistsCalls += 1;
            return slugExistsCalls === 1;
          }),
        listRecentArtifacts: () => Effect.succeed([]),
      }),
    );
    const StorageTest = Layer.succeed(
      ArtifactSourceStorage,
      ArtifactSourceStorage.of({
        writeSource: () => Effect.void,
        readSource: () => Effect.succeed(new Uint8Array()),
        removeSource: () => Effect.void,
      }),
    );
    const TestLive = ArtifactPublishingLive.pipe(Layer.provide(RepositoryTest), Layer.provide(StorageTest));

    const artifact = await Effect.runPromise(
      Effect.gen(function* () {
        const publishing = yield* ArtifactPublishing;
        return yield* publishing.publish(input);
      }).pipe(Effect.provide(TestLive), Random.withSeed(0)),
    );

    expect(slugExistsCalls).toBe(2);
    expect(artifact.slug).toMatch(/^hello-artifact-[0-9a-f]{4}$/);
  });

  it("fails with SlugGenerationFailedError when every candidate collides", async () => {
    const RepositoryTest = Layer.succeed(
      ArtifactRepository,
      ArtifactRepository.of({
        insertArtifact: () => Effect.void,
        findArtifactBySlug: () => Effect.succeed(Option.none()),
        slugExists: () => Effect.succeed(true),
        listRecentArtifacts: () => Effect.succeed([]),
      }),
    );
    const StorageTest = Layer.succeed(
      ArtifactSourceStorage,
      ArtifactSourceStorage.of({
        writeSource: () => Effect.void,
        readSource: () => Effect.succeed(new Uint8Array()),
        removeSource: () => Effect.void,
      }),
    );
    const TestLive = ArtifactPublishingLive.pipe(Layer.provide(RepositoryTest), Layer.provide(StorageTest));

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const publishing = yield* ArtifactPublishing;
          return yield* publishing.publish(input);
        }).pipe(Effect.provide(TestLive), Random.withSeed(0)),
      ),
    ).rejects.toMatchObject({ _tag: "SlugGenerationFailedError" });
  });
});
