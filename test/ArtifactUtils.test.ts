import { describe, expect, it } from "@effect/vitest"

import { detectSourceType, inferTitle, slugBase } from "../src/ArtifactUtils.js"

describe("Artifact utilities", () => {
  it("infers a title from a source filename when publishers do not provide one", () => {
    expect(inferTitle("migration-report.md")).toBe("migration report")
  })

  it("uses the publisher-provided title when present", () => {
    expect(inferTitle("PLAN.md", "Foundry Governance Plan")).toBe("Foundry Governance Plan")
  })

  it("builds readable slug bases for stable public artifact URLs", () => {
    expect(slugBase("Foundry Governance Plan!")).toBe("foundry-governance-plan")
  })

  it("detects the MVP source types", () => {
    expect(detectSourceType("PLAN.md")).toBe("markdown")
    expect(detectSourceType("report.html")).toBe("html")
  })
})
