import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import {
  type Artifact,
  ArtifactId,
  ArtifactState,
  PublishResponse,
  Slug,
  SourceType,
  UnsupportedSourceTypeError,
} from "../domain/Artifact.js";
import { SlugGenerationFailedError } from "../publishing/ArtifactPublisher.js";
import { ArtifactRepository } from "../repository/ArtifactRepository.js";
import { ArtifactPublishIntake } from "../publishing/ArtifactPublishIntake.js";
import { BadRequestError, ForbiddenError, ServerError, UnauthorizedError } from "./ApiErrors.js";

export const ArtifactSummary = Schema.Struct({
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

export const ArtifactFeedResponse = Schema.Struct({ artifacts: Schema.Array(ArtifactSummary) });
export const PublishArtifactResponse = PublishResponse.pipe(HttpApiSchema.status(201));
export const PublishMultipartPayload = Schema.Struct({}).pipe(HttpApiSchema.asMultipart());

const publishErrors = [
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  UnsupportedSourceTypeError,
  SlugGenerationFailedError,
  ServerError,
] as const;

const artifactJson = (artifact: Artifact) => ({
  id: artifact.id,
  slug: artifact.slug,
  title: artifact.title,
  description: artifact.description,
  sourceType: artifact.sourceType,
  sourceUrl: `/source/${artifact.slug}`,
  artifactUrl: `/a/${artifact.slug}`,
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
});

export const ArtifactApiGroup = HttpApiGroup.make("artifacts")
  .add(
    HttpApiEndpoint.get("getFeedJson", "/artifacts", {
      success: ArtifactFeedResponse,
      error: ServerError,
    }),
    HttpApiEndpoint.post("publishArtifact", "/artifacts", {
      disableCodecs: true,
      payload: PublishMultipartPayload,
      success: PublishArtifactResponse,
      error: publishErrors,
    }),
  )
  .prefix("/api/v1");

const toServerError = () => new ServerError({ message: "Internal server error" });

const ArtifactApi = HttpApi.make("AgentArtifactsApi").add(ArtifactApiGroup);

export const ArtifactApiLive = HttpApiBuilder.group(ArtifactApi, "artifacts", (handlers) =>
  handlers
    .handle("getFeedJson", () =>
      Effect.gen(function* () {
        const repository = yield* ArtifactRepository;
        const artifacts = yield* repository.listRecentArtifacts(50);
        return { artifacts: artifacts.map(artifactJson) };
      }).pipe(Effect.mapError(toServerError)),
    )
    .handleRaw("publishArtifact", () =>
      Effect.gen(function* () {
        const intake = yield* ArtifactPublishIntake;
        return yield* intake.publish;
      }),
    ),
);
