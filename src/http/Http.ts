import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { HttpRouter, HttpServerRequest, HttpServerResponse, Multipart } from "effect/unstable/http"

import { AppConfigService } from "../config/Config.js"
import { type Artifact, PublishResponse, Slug } from "../domain/Artifact.js"
import { ArtifactPublishing } from "../publishing/ArtifactPublishing.js"
import { renderArtifactPage, renderFeedPage } from "../render/Render.js"
import { ArtifactRepository } from "../repository/ArtifactRepository.js"
import { ArtifactSourceStorage } from "../source-storage/ArtifactSourceStorage.js"

const nullableField = (value: string | ReadonlyArray<string> | undefined): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value
  const trimmed = candidate?.trim()
  return trimmed === undefined || trimmed === "" ? null : trimmed
}

const booleanField = (value: string | ReadonlyArray<string> | undefined): boolean => {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate === "1" || candidate === "true" || candidate === "yes"
}

const requireWriteKey = Effect.gen(function*() {
  const config = yield* AppConfigService
  const request = yield* HttpServerRequest.HttpServerRequest
  const provided = request.headers["x-write-key"]
  if (provided === undefined) {
    yield* Effect.logWarning("publish rejected: missing write key")
    return yield* Effect.fail(HttpServerResponse.text("Missing write key", { status: 401 }))
  }
  if (provided !== Redacted.value(config.writeKey)) {
    yield* Effect.logWarning("publish rejected: invalid write key")
    return yield* Effect.fail(HttpServerResponse.text("Invalid write key", { status: 403 }))
  }
})

const sourceContentType = (artifact: Artifact) =>
  artifact.sourceType === "markdown" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8"

const publishFormSchema = Schema.Struct({
  file: Multipart.FilesSchema,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  project: Schema.optional(Schema.String),
  repo: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  commit_sha: Schema.optional(Schema.String),
  dirty: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  generator: Schema.optional(Schema.String)
})

const publishArtifact = Effect.gen(function*() {
  yield* requireWriteKey
  const form = yield* HttpServerRequest.schemaBodyForm(publishFormSchema)
  const file = form.file[0]
  if (file === undefined) {
    yield* Effect.logWarning("publish rejected: missing file")
    return HttpServerResponse.text("Missing file", { status: 400 })
  }

  return yield* Effect.gen(function*() {
    const config = yield* AppConfigService
    const publishing = yield* ArtifactPublishing
    yield* Effect.logInfo("publish request accepted")

    const fs = yield* FileSystem.FileSystem
    const sourceBytes = yield* fs.readFile(file.path)
    const artifact = yield* publishing.publish({
      sourceBytes,
      sourceFilename: file.name,
      contentType: file.contentType,
      title: form.title,
      description: nullableField(form.description),
      project: nullableField(form.project),
      repoFullName: nullableField(form.repo),
      branch: nullableField(form.branch),
      commitSha: nullableField(form.commit_sha),
      dirty: booleanField(form.dirty),
      agent: nullableField(form.agent),
      generator: nullableField(form.generator)
    })

    yield* Effect.logInfo("publish completed").pipe(
      Effect.annotateLogs({
        artifactId: artifact.id,
        slug: artifact.slug,
        sourceType: artifact.sourceType,
        sizeBytes: artifact.sizeBytes
      })
    )

    return yield* HttpServerResponse.json(
      PublishResponse.make({
        id: artifact.id,
        slug: artifact.slug,
        title: artifact.title,
        sourceType: artifact.sourceType,
        artifactUrl: `${config.publicBaseUrl}/a/${artifact.slug}`,
        sourceUrl: `${config.publicBaseUrl}/source/${artifact.slug}`,
        createdAt: artifact.createdAt
      }),
      { status: 201 }
    )
  }).pipe(
    Effect.catchIf(
      (error: unknown): error is { readonly _tag: "UnsupportedSourceTypeError" } =>
        typeof error === "object" && error !== null && "_tag" in error && error._tag === "UnsupportedSourceTypeError",
      () =>
        Effect.logWarning("publish rejected: unsupported source type").pipe(
          Effect.andThen(Effect.succeed(
            HttpServerResponse.text("Unsupported source type. MVP supports Markdown and HTML source.", { status: 415 })
          ))
        )
    ),
    Effect.annotateLogs({
      sourceFilename: file.name,
      contentType: file.contentType ?? "unknown"
    })
  )
})

const slugPath = Schema.Struct({ slug: Slug })

const getSlugParam = Effect.map(HttpRouter.schemaPathParams(slugPath), (_) => _.slug)

const getArtifactOr404 = (slug: Slug) =>
  Effect.gen(function*() {
    const repository = yield* ArtifactRepository
    const artifact = yield* repository.findArtifactBySlug(slug)
    if (Option.isNone(artifact)) {
      return yield* Effect.fail(HttpServerResponse.text("Artifact not found", { status: 404 }))
    }
    return artifact.value
  })

const getReadableArtifact = (slug: Slug) =>
  Effect.gen(function*() {
    const artifact = yield* getArtifactOr404(slug)
    if (artifact.state === "withdrawn") {
      yield* Effect.logWarning("withdrawn artifact access").pipe(Effect.annotateLogs("artifactId", artifact.id))
      return yield* Effect.fail(HttpServerResponse.text("Artifact withdrawn", { status: 410 }))
    }
    return artifact
  })

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
  updatedAt: artifact.updatedAt
})

const getSource = Effect.gen(function*() {
  const slug = yield* getSlugParam
  return yield* Effect.gen(function*() {
    const artifact = yield* getReadableArtifact(slug)
    const storage = yield* ArtifactSourceStorage
    const source = yield* storage.readSource(artifact.id, artifact.sourceType).pipe(
      Effect.tapError(() => Effect.logError("source response read failed")),
      Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType })
    )
    return HttpServerResponse.uint8Array(source, { contentType: sourceContentType(artifact) })
  }).pipe(Effect.annotateLogs("slug", slug))
})

const getArtifactPage = Effect.gen(function*() {
  const slug = yield* getSlugParam
  return yield* Effect.gen(function*() {
    const artifact = yield* getReadableArtifact(slug)
    const storage = yield* ArtifactSourceStorage
    const source = yield* storage.readSource(artifact.id, artifact.sourceType).pipe(
      Effect.tapError(() => Effect.logError("artifact page source read failed")),
      Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType })
    )
    return HttpServerResponse.html(renderArtifactPage(artifact, Buffer.from(source).toString("utf8")))
  }).pipe(Effect.annotateLogs("slug", slug))
})

const getFeedJson = Effect.gen(function*() {
  const repository = yield* ArtifactRepository
  const artifacts = yield* repository.listRecentArtifacts(50)
  return yield* HttpServerResponse.json({ artifacts: artifacts.map(artifactJson) })
})

const getHome = Effect.gen(function*() {
  const repository = yield* ArtifactRepository
  const artifacts = yield* repository.listRecentArtifacts(50)
  return HttpServerResponse.html(renderFeedPage(artifacts))
})

export const AppRouter = HttpRouter.addAll([
  HttpRouter.route("GET", "/", getHome),
  HttpRouter.route("GET", "/api/artifacts", getFeedJson),
  HttpRouter.route("POST", "/api/artifacts", publishArtifact),
  HttpRouter.route("GET", "/a/:slug", getArtifactPage),
  HttpRouter.route("GET", "/source/:slug", getSource)
])
