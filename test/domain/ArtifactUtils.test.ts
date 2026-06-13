import { describe, expect, it } from "@effect/vitest"
import * as Result from "effect/Result"

import { detectSourceType, inferTitle, slugBase } from "../../src/domain/ArtifactUtils.js"

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
    expect(detectSourceType("PLAN.md")).toEqual(Result.succeed("markdown"))
    expect(detectSourceType("report.html")).toEqual(Result.succeed("html"))
  })

  it("rejects unsupported source types so publishers get a typed error", () => {
    const result = detectSourceType("diagram.svg")
    expect(Result.isFailure(result)).toBe(true)
  })
})
