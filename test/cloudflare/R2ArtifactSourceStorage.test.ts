import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { CloudflareBindingsLive, type CloudflareBindings } from "../../src/cloudflare/Bindings.js";
import { R2ArtifactSourceStorageLive, r2SourceKeyFor } from "../../src/source-storage/r2/R2ArtifactSourceStorage.js";
import { ArtifactSourceStorage } from "../../src/source-storage/ArtifactSourceStorage.js";
import type { ArtifactId } from "../../src/domain/Artifact.js";

const makeEnv = (bucket: R2Bucket): CloudflareBindings => ({
  DB: {} as D1Database,
  SOURCES: bucket,
  AGENT_ARTIFACTS_WRITE_KEY: "ap_test",
});

describe("R2ArtifactSourceStorage", () => {
  it("uses stable source keys derived from artifact id and source type", () => {
    expect(r2SourceKeyFor("art_123" as ArtifactId, "markdown")).toBe("artifacts/art_123/source.md");
    expect(r2SourceKeyFor("art_123" as ArtifactId, "html")).toBe("artifacts/art_123/source.html");
  });

  it("writes, reads, and removes source objects through R2", async () => {
    const objects = new Map<string, Uint8Array>();
    const bucket = {
      put: async (key: string, value: Uint8Array) => {
        objects.set(key, value);
        return null;
      },
      get: async (key: string) => {
        const value = objects.get(key);
        return value === undefined
          ? null
          : {
              arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
            };
      },
      delete: async (key: string) => {
        objects.delete(key);
      },
    } as unknown as R2Bucket;

    const program = Effect.gen(function* () {
      const storage = yield* ArtifactSourceStorage;
      const id = "art_r2" as ArtifactId;
      const bytes = new TextEncoder().encode("# Stored in R2");

      yield* storage.writeSource(id, "markdown", bytes);
      const read = yield* storage.readSource(id, "markdown");
      yield* storage.removeSource(id, "markdown");

      return { read, remaining: objects.size };
    }).pipe(Effect.provide(R2ArtifactSourceStorageLive), Effect.provide(CloudflareBindingsLive(makeEnv(bucket))));

    const result = await Effect.runPromise(program);
    expect(new TextDecoder().decode(result.read)).toBe("# Stored in R2");
    expect(result.remaining).toBe(0);
  });
});
