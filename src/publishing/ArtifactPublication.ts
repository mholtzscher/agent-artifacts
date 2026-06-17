import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Stream from "effect/Stream";
import { HttpServerRequest, Multipart } from "effect/unstable/http";

import { AppConfigService } from "../config/Config.js";
import { PublishResponse, UnsupportedSourceTypeError } from "../domain/Artifact.js";
import { ArtifactPublishing, SlugGenerationFailedError } from "./ArtifactPublishing.js";
import { BadRequestError, ForbiddenError, ServerError, UnauthorizedError } from "../http/ApiErrors.js";

export type ArtifactPublicationError =
  | UnauthorizedError
  | ForbiddenError
  | BadRequestError
  | UnsupportedSourceTypeError
  | SlugGenerationFailedError
  | ServerError;

const nullableField = (value: string | ReadonlyArray<string> | undefined): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim();
  return trimmed === undefined || trimmed === "" ? null : trimmed;
};

const booleanField = (value: string | ReadonlyArray<string> | undefined): boolean => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "1" || candidate === "true" || candidate === "yes";
};

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
});

const toServerError = () => new ServerError({ message: "Internal server error" });

export class ArtifactPublication extends Context.Service<
  ArtifactPublication,
  {
    readonly publish: Effect.Effect<PublishResponse, ArtifactPublicationError, HttpServerRequest.HttpServerRequest>;
  }
>()("AgentArtifacts/ArtifactPublication") {}

export const ArtifactPublicationLive = Layer.effect(
  ArtifactPublication,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const publishing = yield* ArtifactPublishing;

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

    return ArtifactPublication.of({
      publish: Effect.gen(function* () {
        yield* requireWriteKey;
        const form = yield* readPublishMultipartForm;
        const file = form.file;
        if (file === undefined) {
          yield* Effect.logWarning("publish rejected: missing file");
          return yield* Effect.fail(new BadRequestError({ message: "Missing file" }));
        }
        yield* Effect.logInfo("publish request accepted");

        const sourceBytes = yield* file.contentEffect;
        const artifact = yield* publishing.publish({
          sourceBytes,
          sourceFilename: file.name,
          contentType: file.contentType,
          title: Array.isArray(form.fields.title) ? form.fields.title[0] : form.fields.title,
          description: nullableField(form.fields.description),
          project: nullableField(form.fields.project),
          repoFullName: nullableField(form.fields.repo),
          branch: nullableField(form.fields.branch),
          commitSha: nullableField(form.fields.commit_sha),
          dirty: booleanField(form.fields.dirty),
          agent: nullableField(form.fields.agent),
          generator: nullableField(form.fields.generator),
        });

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
      }).pipe(
        Effect.mapError(
          (error): ArtifactPublicationError =>
            error instanceof UnauthorizedError ||
            error instanceof ForbiddenError ||
            error instanceof BadRequestError ||
            error instanceof UnsupportedSourceTypeError ||
            error instanceof SlugGenerationFailedError
              ? error
              : toServerError(),
        ),
      ),
    });
  }),
);
