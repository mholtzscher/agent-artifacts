import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as Stream from "effect/Stream";
import { HttpServerRequest, Multipart } from "effect/unstable/http";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import {
  Artifact,
  ArtifactId,
  PublishResponse,
  Slug,
  type SourceType,
  UnsupportedSourceTypeError,
} from "../domain/Artifact.js";
import { BadRequestError, ForbiddenError, ServerError, UnauthorizedError } from "../domain/ArtifactErrors.js";
import { ArtifactCatalog, type ArtifactCatalogError } from "../artifact-catalog/ArtifactCatalog.js";
import { ArtifactSource, type ArtifactSourceError } from "../artifact-source/ArtifactSource.js";
import { AppConfigService } from "../runtime/Config.js";

export class SlugGenerationFailedError extends Schema.TaggedErrorClass<SlugGenerationFailedError>()(
  "SlugGenerationFailedError",
  { title: Schema.String },
  { httpApiStatus: 409 },
) {}

export type ArtifactPublicationError =
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

const decodePublishFormFields = (fields: unknown) =>
  Schema.decodeUnknownEffect(PublishFormFieldsFromRaw)(fields).pipe(
    Effect.mapError(() => new BadRequestError({ message: "Invalid publish form fields" })),
  );

const extensionOf = (filename: string): string => {
  const basename = filename.split(/[\\/]/).at(-1) ?? filename;
  const extStart = basename.lastIndexOf(".");
  return extStart <= 0 ? "" : basename.slice(extStart);
};

const filenameWithoutExtension = (filename: string): string => {
  const basename = filename.split(/[\\/]/).at(-1) ?? filename;
  const extStart = basename.lastIndexOf(".");
  return extStart <= 0 ? basename : basename.slice(0, extStart);
};

const makeArtifactId = (): ArtifactId => ArtifactId.make(crypto.randomUUID());

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const sha256Hex = (bytes: Uint8Array) =>
  Effect.promise(() => {
    const copy = new Uint8Array(bytes);
    return crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
  }).pipe(Effect.map((digest) => hex(new Uint8Array(digest))));

const inferTitle = (filename: string, provided?: string): string => {
  const trimmed = provided?.trim();
  if (trimmed !== undefined && trimmed !== "") {
    return trimmed;
  }
  const basename = filenameWithoutExtension(filename);
  return basename.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled artifact";
};

const detectSourceType = (
  filename: string,
  contentType?: string,
): Result.Result<SourceType, UnsupportedSourceTypeError> => {
  const extension = extensionOf(filename).toLowerCase();
  if (extension === ".md" || extension === ".markdown" || contentType === "text/markdown") {
    return Result.succeed("markdown");
  }
  if (extension === ".html" || extension === ".htm" || contentType === "text/html") {
    return Result.succeed("html");
  }
  return Result.fail(new UnsupportedSourceTypeError({ filename }));
};

const slugBase = (title: string): string => {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? "artifact" : base;
};

const makeSlugCandidate = (title: string): Effect.Effect<Slug> =>
  Effect.gen(function* () {
    const bytes = [yield* Random.nextIntBetween(0, 255), yield* Random.nextIntBetween(0, 255)];
    const suffix = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return Slug.make(`${slugBase(title)}-${suffix}`);
  });

const makeUniqueSlug = (title: string, slugExists: (slug: Slug) => Effect.Effect<boolean, ArtifactCatalogError>) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 8; attempt++) {
      const slug = yield* makeSlugCandidate(title);
      if (!(yield* slugExists(slug))) {
        return slug;
      }
    }
    yield* Effect.logWarning("slug generation failed").pipe(Effect.annotateLogs("title", title));
    return yield* Effect.fail(new SlugGenerationFailedError({ title }));
  });

const toServerError = () => new ServerError({ message: "Internal server error" });

const toArtifactPublicationError = (
  error: ArtifactCatalogError | ArtifactSourceError | SlugGenerationFailedError,
): ArtifactPublicationError => (error instanceof SlugGenerationFailedError ? error : toServerError());

const pathsForSlug = (slug: Slug) => ({ artifactPath: `/a/${slug}`, sourcePath: `/source/${slug}` });

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
    const catalog = yield* ArtifactCatalog;
    const source = yield* ArtifactSource;

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
        const sourceType = yield* Effect.fromResult(detectSourceType(file.name, file.contentType));
        const id = makeArtifactId();
        const title = inferTitle(file.name, fields.title);
        const slug = yield* makeUniqueSlug(title, catalog.slugExists).pipe(Effect.mapError(toArtifactPublicationError));
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        const artifact = Artifact.make({
          id,
          slug,
          title,
          description: fields.description,
          sourceType,
          sourceFilename: file.name,
          sha256: yield* sha256Hex(sourceBytes),
          sizeBytes: sourceBytes.byteLength,
          project: fields.project,
          repoFullName: fields.repoFullName,
          branch: fields.branch,
          commitSha: fields.commitSha,
          dirty: fields.dirty,
          agent: fields.agent,
          generator: fields.generator,
          state: "active",
          createdAt,
          updatedAt: createdAt,
        });

        yield* Effect.gen(function* () {
          yield* source.write(artifact, sourceBytes);
          yield* catalog
            .add(artifact)
            .pipe(
              Effect.tapError(() =>
                Effect.logError("artifact insert failed; removing source").pipe(
                  Effect.andThen(source.remove(artifact)),
                ),
              ),
            );
        }).pipe(Effect.mapError(toArtifactPublicationError), Effect.annotateLogs({ artifactId: id, slug, sourceType }));

        yield* Effect.logInfo("publish completed").pipe(
          Effect.annotateLogs({
            artifactId: artifact.id,
            slug: artifact.slug,
            sourceType,
            sizeBytes: artifact.sizeBytes,
          }),
        );

        const paths = pathsForSlug(artifact.slug);
        return PublishResponse.make({
          id: artifact.id,
          slug: artifact.slug,
          title: artifact.title,
          sourceType: artifact.sourceType,
          artifactUrl: `${config.publicBaseUrl}${paths.artifactPath}`,
          sourceUrl: `${config.publicBaseUrl}${paths.sourcePath}`,
          createdAt: artifact.createdAt,
        });
      }),
    });
  }),
);

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

export const ArtifactPublicationApiGroup = HttpApiGroup.make("artifact-publication")
  .add(
    HttpApiEndpoint.post("publishArtifact", "/artifacts", {
      disableCodecs: true,
      payload: PublishMultipartPayload,
      success: PublishArtifactResponse,
      error: publishErrors,
    }),
  )
  .prefix("/api/v1");

const ArtifactPublicationApi = HttpApi.make("AgentArtifactsApi").add(ArtifactPublicationApiGroup);

export const ArtifactPublicationApiLive = HttpApiBuilder.group(
  ArtifactPublicationApi,
  "artifact-publication",
  (handlers) =>
    handlers.handleRaw("publishArtifact", () =>
      Effect.gen(function* () {
        const publication = yield* ArtifactPublication;
        return yield* publication.publish;
      }),
    ),
);
