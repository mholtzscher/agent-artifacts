import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { Artifact, type ArtifactId, type Slug } from "../../src/domain/artifact.js";
import { ArtifactSource } from "../../src/artifact-source/artifact-source.js";
import { R2ArtifactSourceLive, r2SourceKeyFor } from "../../src/artifact-source/r2/r2-artifact-source.js";

const baseFields = {
  id: "art_123" as ArtifactId,
  slug: "r2-artifact" as Slug,
  title: "R2 Artifact",
  description: null,
  sha256: "abc123",
  sizeBytes: 12,
  project: null,
  repoFullName: null,
  branch: null,
  commitSha: null,
  dirty: false,
  agent: null,
  generator: null,
  state: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const artifact = Artifact.make({ ...baseFields, sourceType: "markdown", sourceFilename: "r2.md" });
const htmlArtifact = Artifact.make({ ...baseFields, sourceType: "html", sourceFilename: "r2.html" });

describe("R2ArtifactSource", () => {
  it("uses stable source keys derived from artifact id and Source Type", () => {
    expect(r2SourceKeyFor(artifact)).toBe("artifacts/art_123/source.md");
    expect(r2SourceKeyFor(htmlArtifact)).toBe("artifacts/art_123/source.html");
  });

  it("writes, reads, and removes Artifact Source objects through R2", async () => {
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
      const source = yield* ArtifactSource;
      const bytes = new TextEncoder().encode("# Stored in R2");

      yield* source.write(artifact, bytes);
      const read = yield* source.read(artifact);
      yield* source.remove(artifact);

      return { read, remaining: objects.size };
    }).pipe(Effect.provide(R2ArtifactSourceLive(bucket)));

    const result = await Effect.runPromise(program);
    expect(new TextDecoder().decode(result.read)).toBe("# Stored in R2");
    expect(result.remaining).toBe(0);
  });
});
