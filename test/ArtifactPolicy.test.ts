import { describe, expect, it } from "vitest"

import { isArtifactListable, readDecisionForArtifact } from "../src/ArtifactPolicy.js"
import type { Artifact } from "../src/Domain.js"

const makeArtifact = (state: Artifact["state"]): Artifact => ({
  id: "artifact_1" as Artifact["id"],
  slug: "example" as Artifact["slug"],
  title: "Example",
  description: null,
  sourceType: "markdown",
  sourceFilename: "example.md",
  sourcePath: "/tmp/example.md",
  sha256: "abc123",
  sizeBytes: 12,
  project: null,
  repoFullName: null,
  branch: null,
  commitSha: null,
  dirty: false,
  agent: null,
  generator: null,
  state,
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z"
})

describe("Artifact policy", () => {
  it("allows Active Artifact source and Rendered View access", () => {
    expect(readDecisionForArtifact(makeArtifact("active"))._tag).toBe("Accessible")
  })

  it("marks Withdrawn Artifact source and Rendered View access as withdrawn", () => {
    expect(readDecisionForArtifact(makeArtifact("withdrawn"))._tag).toBe("Withdrawn")
  })

  it("keeps Active and Withdrawn Artifacts in public Artifact lists", () => {
    expect(isArtifactListable(makeArtifact("active"))).toBe(true)
    expect(isArtifactListable(makeArtifact("withdrawn"))).toBe(true)
  })
})
