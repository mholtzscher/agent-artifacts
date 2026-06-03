import * as Brand from "effect/Brand"
import * as Schema from "effect/Schema"

export const ArtifactId = Schema.String.pipe(Schema.brand("ArtifactId"))
export type ArtifactId = Schema.Schema.Type<typeof ArtifactId>

export const Slug = Schema.String.pipe(Schema.brand("Slug"))
export type Slug = Schema.Schema.Type<typeof Slug>

export const ArtifactState = Schema.Literal("active", "withdrawn")
export type ArtifactState = Schema.Schema.Type<typeof ArtifactState>

export const SourceType = Schema.Literal("markdown", "html")
export type SourceType = Schema.Schema.Type<typeof SourceType>

export const Artifact = Schema.Struct({
  id: ArtifactId,
  slug: Slug,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  sourceType: SourceType,
  sourceFilename: Schema.String,
  sourcePath: Schema.String,
  sha256: Schema.String,
  sizeBytes: Schema.Number,
  project: Schema.NullOr(Schema.String),
  repoFullName: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  commitSha: Schema.NullOr(Schema.String),
  dirty: Schema.Boolean,
  agent: Schema.NullOr(Schema.String),
  generator: Schema.NullOr(Schema.String),
  state: ArtifactState,
  createdAt: Schema.String,
  updatedAt: Schema.String
})
export type Artifact = Schema.Schema.Type<typeof Artifact>

export const PublishResponse = Schema.Struct({
  id: ArtifactId,
  slug: Slug,
  title: Schema.String,
  sourceType: SourceType,
  artifactUrl: Schema.String,
  sourceUrl: Schema.String,
  createdAt: Schema.String
})
export type PublishResponse = Schema.Schema.Type<typeof PublishResponse>

export type WriteKey = string & Brand.Brand<"WriteKey">
export const WriteKey = Brand.nominal<WriteKey>()
