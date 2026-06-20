import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { Artifact, type ArtifactId, type Slug } from "../../src/domain/artifact.js";
import { ArtifactRowSchema, type ArtifactRow } from "../../src/artifact-catalog/artifact-catalog.js";

const artifact = Artifact.make({
  id: "art_row" as ArtifactId,
  slug: "row-artifact" as Slug,
  title: "Row Artifact",
  description: "Mapped through schema",
  sourceType: "html",
  sourceFilename: "row.html",
  sha256: "abc123",
  sizeBytes: 42,
  project: "agent-artifacts",
  repoFullName: "michael/agent-artifacts",
  branch: "main",
  commitSha: "abcdef",
  dirty: true,
  agent: "pi",
  generator: "test",
  state: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
});

const row: ArtifactRow = {
  id: artifact.id,
  slug: artifact.slug,
  title: artifact.title,
  description: artifact.description,
  source_type: artifact.sourceType,
  source_filename: artifact.sourceFilename,
  sha256: artifact.sha256,
  size_bytes: artifact.sizeBytes,
  project: artifact.project,
  repo_full_name: artifact.repoFullName,
  branch: artifact.branch,
  commit_sha: artifact.commitSha,
  dirty: 1,
  agent: artifact.agent,
  generator: artifact.generator,
  state: artifact.state,
  created_at: artifact.createdAt,
  updated_at: artifact.updatedAt,
};

describe("ArtifactRowSchema", () => {
  it("decodes persisted rows into Artifacts", async () => {
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(ArtifactRowSchema)(row));

    expect(decoded).toEqual(artifact);
  });

  it("encodes Artifacts back into persisted rows", async () => {
    const encoded = await Effect.runPromise(Schema.encodeEffect(ArtifactRowSchema)(artifact));

    expect(encoded).toEqual(row);
  });
});
