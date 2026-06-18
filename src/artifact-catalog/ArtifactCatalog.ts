import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import type { SqlError } from "effect/unstable/sql";

import { Artifact, ArtifactId, ArtifactState, Slug, SourceType } from "../domain/Artifact.js";

const ArtifactRowStruct = Schema.Struct({
  id: ArtifactId,
  slug: Slug,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  source_type: SourceType,
  source_filename: Schema.String,
  sha256: Schema.String,
  size_bytes: Schema.Number,
  project: Schema.NullOr(Schema.String),
  repo_full_name: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  commit_sha: Schema.NullOr(Schema.String),
  dirty: Schema.Literals([0, 1]),
  agent: Schema.NullOr(Schema.String),
  generator: Schema.NullOr(Schema.String),
  state: ArtifactState,
  created_at: Schema.String,
  updated_at: Schema.String,
});

export type ArtifactRow = Schema.Schema.Type<typeof ArtifactRowStruct>;

type ArtifactEncoded = Schema.Codec.Encoded<typeof Artifact>;

export const ArtifactRowSchema = ArtifactRowStruct.pipe(
  Schema.decodeTo(Artifact, {
    decode: SchemaGetter.transform((row: ArtifactRow) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      sourceType: row.source_type,
      sourceFilename: row.source_filename,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      project: row.project,
      repoFullName: row.repo_full_name,
      branch: row.branch,
      commitSha: row.commit_sha,
      dirty: row.dirty === 1,
      agent: row.agent,
      generator: row.generator,
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    encode: SchemaGetter.transform((artifact: ArtifactEncoded) => ({
      id: ArtifactId.make(artifact.id),
      slug: Slug.make(artifact.slug),
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
      dirty: artifact.dirty ? 1 : 0,
      agent: artifact.agent,
      generator: artifact.generator,
      state: artifact.state,
      created_at: artifact.createdAt,
      updated_at: artifact.updatedAt,
    })),
  }),
);

export class ArtifactCatalogBackendError extends Schema.TaggedErrorClass<ArtifactCatalogBackendError>()(
  "ArtifactCatalogBackendError",
  { cause: Schema.Unknown },
  { httpApiStatus: 500 },
) {}

export type ArtifactCatalogError = SqlError.SqlError | Schema.SchemaError | ArtifactCatalogBackendError;

export class ArtifactCatalog extends Context.Service<
  ArtifactCatalog,
  {
    readonly add: (artifact: Artifact) => Effect.Effect<void, ArtifactCatalogError>;
    readonly findBySlug: (slug: Slug) => Effect.Effect<Option.Option<Artifact>, ArtifactCatalogError>;
    readonly slugExists: (slug: Slug) => Effect.Effect<boolean, ArtifactCatalogError>;
    readonly listRecent: (limit: number) => Effect.Effect<ReadonlyArray<Artifact>, ArtifactCatalogError>;
  }
>()("AgentArtifacts/ArtifactCatalog") {}
