import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as Stream from "effect/Stream";
import { HttpServerRequest, Multipart } from "effect/unstable/http";

import { AppConfigService } from "../config/Config.js";
import { PublishResponse, UnsupportedSourceTypeError } from "../domain/Artifact.js";
import { ArtifactPublisher, type ArtifactPublisherError, SlugGenerationFailedError } from "./ArtifactPublisher.js";
import { BadRequestError, ForbiddenError, ServerError, UnauthorizedError } from "../http/ApiErrors.js";

export type ArtifactPublishIntakeError =
  | UnauthorizedError
  | ForbiddenError
  | BadRequestError
  | UnsupportedSourceTypeError
  | SlugGenerationFailedError
  | ServerError;

const RawPublishFormField = Schema.Union([Schema.String, Schema.Array(Schema.String)]);

const RawPublishFormFields = Schema.Struct({
  title: Schema.optional(RawPublishFormField),
  description: Schema.optional(RawPublishFormField),
  project: Schema.optional(RawPublishFormField),
  repo: Schema.optional(RawPublishFormField),
  branch: Schema.optional(RawPublishFormField),
  commit_sha: Schema.optional(RawPublishFormField),
  dirty: Schema.optional(RawPublishFormField),
  agent: Schema.optional(RawPublishFormField),
  generator: Schema.optional(RawPublishFormField),
});

type RawPublishFormFields = Schema.Schema.Type<typeof RawPublishFormFields>;

const PublishFormFields = Schema.Struct({
  title: Schema.UndefinedOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  project: Schema.NullOr(Schema.String),
  repoFullName: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  commitSha: Schema.NullOr(Schema.String),
  dirty: Schema.Boolean,
  agent: Schema.NullOr(Schema.String),
  generator: Schema.NullOr(Schema.String),
});

const firstFieldValue = (value: string | ReadonlyArray<string> | undefined): string | undefined =>
  typeof value === "string" ? value : value?.[0];

const textOrNull = (value: string | ReadonlyArray<string> | undefined): string | null => {
  const trimmed = firstFieldValue(value)?.trim();
  return trimmed === undefined || trimmed === "" ? null : trimmed;
};

const boolFromField = (value: string | ReadonlyArray<string> | undefined): boolean => {
  const candidate = firstFieldValue(value);
  return candidate === "1" || candidate === "true" || candidate === "yes";
};

const PublishFormFieldsFromRaw = RawPublishFormFields.pipe(
  Schema.decodeTo(PublishFormFields, {
    decode: SchemaGetter.transform((fields: RawPublishFormFields) => ({
      title: firstFieldValue(fields.title),
      description: textOrNull(fields.description),
      project: textOrNull(fields.project),
      repoFullName: textOrNull(fields.repo),
      branch: textOrNull(fields.branch),
      commitSha: textOrNull(fields.commit_sha),
      dirty: boolFromField(fields.dirty),
      agent: textOrNull(fields.agent),
      generator: textOrNull(fields.generator),
    })),
    encode: SchemaGetter.transform((fields: Schema.Schema.Type<typeof PublishFormFields>) => ({
      title: fields.title,
      description: fields.description ?? undefined,
      project: fields.project ?? undefined,
      repo: fields.repoFullName ?? undefined,
      branch: fields.branch ?? undefined,
      commit_sha: fields.commitSha ?? undefined,
      dirty: fields.dirty ? "true" : undefined,
      agent: fields.agent ?? undefined,
      generator: fields.generator ?? undefined,
    })),
  }),
);

const appendField = (
  fields: Record<string, string | ReadonlyArray<string> | undefined>,
  key: string,
  value: string,
) => {
  const existing = fields[key];
  if (existing === undefined) {
    fields[key] = value;
  } else if (Array.isArray(existing)) {
    fields[key] = [...existing, value];
  } else {
    fields[key] = [existing as string, value];
  }
};

const decodePublishFormFields = (fields: unknown) =>
  Schema.decodeUnknownEffect(PublishFormFieldsFromRaw)(fields).pipe(
    Effect.mapError(() => new BadRequestError({ message: "Invalid publish form fields" })),
  );

const readPublishMultipartForm = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const parts = yield* request.multipartStream.pipe(Stream.runCollect);
  const fields: Record<string, string | ReadonlyArray<string> | undefined> = {};
  let file: Multipart.File | undefined;

  for (const part of parts) {
    if (Multipart.isFile(part) && part.key === "file" && file === undefined) {
      file = part;
    } else if (Multipart.isField(part)) {
      appendField(fields, part.key, part.value);
    }
  }

  return { file, fields };
}).pipe(Effect.mapError(() => new BadRequestError({ message: "Invalid multipart body" })));

const toServerError = () => new ServerError({ message: "Internal server error" });

// ArtifactPublisher also exposes infrastructure failures that are not part of the HTTP contract.
const toIntakeError = (error: ArtifactPublisherError): ArtifactPublishIntakeError =>
  error instanceof UnsupportedSourceTypeError || error instanceof SlugGenerationFailedError ? error : toServerError();

export class ArtifactPublishIntake extends Context.Service<
  ArtifactPublishIntake,
  {
    readonly publish: Effect.Effect<PublishResponse, ArtifactPublishIntakeError, HttpServerRequest.HttpServerRequest>;
  }
>()("AgentArtifacts/ArtifactPublishIntake") {}

export const ArtifactPublishIntakeLive = Layer.effect(
  ArtifactPublishIntake,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const publisher = yield* ArtifactPublisher;

    const requireWriteKey = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const provided = request.headers["x-write-key"];
      if (provided === undefined) {
        yield* Effect.logWarning("publish rejected: missing write key");
        return yield* Effect.fail(new UnauthorizedError({ message: "Missing write key" }));
      }
      if (provided !== Redacted.value(config.writeKey)) {
        yield* Effect.logWarning("publish rejected: invalid write key");
        return yield* Effect.fail(new ForbiddenError({ message: "Invalid write key" }));
      }
    });

    return ArtifactPublishIntake.of({
      publish: Effect.gen(function* () {
        yield* requireWriteKey;
        const form = yield* readPublishMultipartForm;
        const fields = yield* decodePublishFormFields(form.fields);
        const file = form.file;
        if (file === undefined) {
          yield* Effect.logWarning("publish rejected: missing file");
          return yield* Effect.fail(new BadRequestError({ message: "Missing file" }));
        }
        yield* Effect.logInfo("publish request accepted");

        const sourceBytes = yield* file.contentEffect.pipe(
          Effect.mapError(() => new BadRequestError({ message: "Invalid multipart body" })),
        );
        const artifact = yield* publisher
          .publish({
            sourceBytes,
            sourceFilename: file.name,
            contentType: file.contentType,
            title: fields.title,
            description: fields.description,
            project: fields.project,
            repoFullName: fields.repoFullName,
            branch: fields.branch,
            commitSha: fields.commitSha,
            dirty: fields.dirty,
            agent: fields.agent,
            generator: fields.generator,
          })
          .pipe(Effect.mapError(toIntakeError));

        yield* Effect.logInfo("publish completed").pipe(
          Effect.annotateLogs({
            artifactId: artifact.id,
            slug: artifact.slug,
            sourceType: artifact.sourceType,
            sizeBytes: artifact.sizeBytes,
          }),
        );

        return PublishResponse.make({
          id: artifact.id,
          slug: artifact.slug,
          title: artifact.title,
          sourceType: artifact.sourceType,
          artifactUrl: `${config.publicBaseUrl}/a/${artifact.slug}`,
          sourceUrl: `${config.publicBaseUrl}/source/${artifact.slug}`,
          createdAt: artifact.createdAt,
        });
      }),
    });
  }),
);
