import type { Artifact } from "./Artifact.js"

export type ArtifactReadDecision =
  | { readonly _tag: "Accessible"; readonly artifact: Artifact }
  | { readonly _tag: "Withdrawn"; readonly artifact: Artifact }

export const readDecisionForArtifact = (artifact: Artifact): ArtifactReadDecision =>
  artifact.state === "withdrawn"
    ? { _tag: "Withdrawn", artifact }
    : { _tag: "Accessible", artifact }

export const isArtifactListable = (_artifact: Artifact): boolean => true
