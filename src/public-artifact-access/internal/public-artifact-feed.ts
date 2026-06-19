/**
 * Internal implementation detail of PublicArtifactAccess.
 * Do not import outside src/public-artifact-access/.
 */
import * as Schema from "effect/Schema";

import { type Artifact, ArtifactId, ArtifactState, Slug, SourceType } from "../../domain/artifact.js";

export const recentArtifactFeedLimit = 50;

export const PublicArtifactItem = Schema.Struct({
  id: ArtifactId,
  slug: Slug,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  sourceType: SourceType,
  sourceUrl: Schema.String,
  artifactUrl: Schema.String,
  project: Schema.NullOr(Schema.String),
  repoFullName: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  commitSha: Schema.NullOr(Schema.String),
  dirty: Schema.Boolean,
  agent: Schema.NullOr(Schema.String),
  generator: Schema.NullOr(Schema.String),
  state: ArtifactState,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type PublicArtifactItem = Schema.Schema.Type<typeof PublicArtifactItem>;

export const PublicArtifactFeedResponse = Schema.Struct({ artifacts: Schema.Array(PublicArtifactItem) });
export type PublicArtifactFeedResponse = Schema.Schema.Type<typeof PublicArtifactFeedResponse>;

const pathsForSlug = (slug: Slug) => ({ artifactPath: `/a/${slug}`, sourcePath: `/source/${slug}` });

export const publicArtifactItem = (artifact: Artifact): PublicArtifactItem => {
  const paths = pathsForSlug(artifact.slug);
  return {
    id: artifact.id,
    slug: artifact.slug,
    title: artifact.title,
    description: artifact.description,
    sourceType: artifact.sourceType,
    sourceUrl: paths.sourcePath,
    artifactUrl: paths.artifactPath,
    project: artifact.project,
    repoFullName: artifact.repoFullName,
    branch: artifact.branch,
    commitSha: artifact.commitSha,
    dirty: artifact.dirty,
    agent: artifact.agent,
    generator: artifact.generator,
    state: artifact.state,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
};
