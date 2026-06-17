import type { Slug } from "./Artifact.js";

export interface ArtifactLinks {
  readonly artifactPath: string;
  readonly sourcePath: string;
}

export const artifactLinks = (slug: Slug): ArtifactLinks => ({
  artifactPath: `/a/${slug}`,
  sourcePath: `/source/${slug}`,
});
