import { HttpRouter, HttpServerRequest, HttpServerResponse, Multipart } from "@effect/platform"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as fs from "node:fs/promises"

import { isArtifactListable, readDecisionForArtifact } from "./ArtifactPolicy.js"
import { detectSourceType, inferTitle, makeArtifactId, makeSlugCandidate, sha256Hex } from "./ArtifactUtils.js"
import { AppConfigService } from "./Config.js"
import type { Artifact, Slug } from "./Domain.js"
import { renderArtifactPage, renderFeedPage } from "./Render.js"
import { findArtifactBySlug, insertArtifact, listRecentArtifacts, slugExists } from "./Repository.js"
import { readArtifactSource, sourcePathForArtifact, writeArtifactSource } from "./Storage.js"

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
    return yield* Effect.fail(HttpServerResponse.text("Missing write key", { status: 401 }))
  }
  if (provided !== config.writeKey) {
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

const makeUniqueSlug = (title: string) =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const slug = makeSlugCandidate(title)
      if (!(yield* slugExists(slug))) {
        return slug
      }
    }
    return yield* Effect.fail(new Error("Could not generate a unique slug"))
  })

const publishArtifact = Effect.gen(function*() {
  yield* requireWriteKey
  const config = yield* AppConfigService
  const form = yield* HttpServerRequest.schemaBodyForm(publishFormSchema)
  const file = form.file[0]
  if (file === undefined) {
    return yield* Effect.succeed(HttpServerResponse.text("Missing file", { status: 400 }))
  }

  const sourceBytes = yield* Effect.tryPromise({ try: () => fs.readFile(file.path), catch: (cause) => cause })
  const sourceType = yield* Effect.try({
    try: () => detectSourceType(file.name, file.contentType),
    catch: (cause) => cause
  })
  const id = makeArtifactId()
  const title = inferTitle(file.name, form.title)
  const slug = yield* makeUniqueSlug(title)
  const createdAt = new Date().toISOString()
  const sourcePath = sourcePathForArtifact(config, id, sourceType)

  yield* writeArtifactSource(sourcePath, sourceBytes)
  yield* insertArtifact({
    id,
    slug,
    title,
    description: nullableField(form.description),
    sourceType,
    sourceFilename: file.name,
    sourcePath,
    sha256: sha256Hex(sourceBytes),
    sizeBytes: sourceBytes.byteLength,
    project: nullableField(form.project),
    repoFullName: nullableField(form.repo),
    branch: nullableField(form.branch),
    commitSha: nullableField(form.commit_sha),
    dirty: booleanField(form.dirty),
    agent: nullableField(form.agent),
    generator: nullableField(form.generator),
    state: "active",
    createdAt,
    updatedAt: createdAt
  })

  return yield* HttpServerResponse.json({
    id,
    slug,
    title,
    sourceType,
    artifactUrl: `${config.publicBaseUrl}/a/${slug}`,
    sourceUrl: `${config.publicBaseUrl}/source/${slug}`,
    createdAt
  }, { status: 201 })
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.isServerResponse(error)
      ? Effect.succeed(error)
      : Effect.succeed(HttpServerResponse.text(String(error), { status: 400 }))
  )
)

const slugPath = Schema.Struct({ slug: Schema.String.pipe(Schema.brand("Slug")) })

const getSlugParam = Effect.map(HttpRouter.schemaPathParams(slugPath), (_) => _.slug)

const getArtifactOrReadError = (slug: Slug) =>
  Effect.gen(function*() {
    const artifact = yield* findArtifactBySlug(slug)
    if (artifact === null) {
      return yield* Effect.fail(HttpServerResponse.text("Artifact not found", { status: 404 }))
    }
    const decision = readDecisionForArtifact(artifact)
    if (decision._tag === "Withdrawn") {
      return yield* Effect.fail(HttpServerResponse.text("Artifact withdrawn", { status: 410 }))
    }
    return decision.artifact
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
  createdAt: artifact.createdAt,
  updatedAt: artifact.updatedAt
})

const getSource = Effect.gen(function*() {
  const slug = yield* getSlugParam
  const artifact = yield* getArtifactOrReadError(slug)
  const source = yield* readArtifactSource(artifact.sourcePath)
  return HttpServerResponse.uint8Array(source, { contentType: sourceContentType(artifact) })
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.isServerResponse(error)
      ? Effect.succeed(error)
      : Effect.succeed(HttpServerResponse.text("Artifact source unavailable", { status: 500 }))
  )
)

const getArtifactPage = Effect.gen(function*() {
  const slug = yield* getSlugParam
  const artifact = yield* getArtifactOrReadError(slug)
  const source = yield* readArtifactSource(artifact.sourcePath)
  return HttpServerResponse.html(renderArtifactPage(artifact, Buffer.from(source).toString("utf8")))
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.isServerResponse(error)
      ? Effect.succeed(error)
      : Effect.succeed(HttpServerResponse.text("Artifact unavailable", { status: 500 }))
  )
)

const getFeedJson = Effect.gen(function*() {
  const artifacts = yield* listRecentArtifacts(50)
  return yield* HttpServerResponse.json({ artifacts: artifacts.filter(isArtifactListable).map(artifactJson) })
})

const getHome = Effect.gen(function*() {
  const artifacts = yield* listRecentArtifacts(50)
  return HttpServerResponse.html(renderFeedPage(artifacts.filter(isArtifactListable)))
})

export const AppRouter = HttpRouter.empty.pipe(
  HttpRouter.get("/", getHome),
  HttpRouter.get("/api/artifacts", getFeedJson),
  HttpRouter.post("/api/artifacts", publishArtifact),
  HttpRouter.get("/a/:slug", getArtifactPage),
  HttpRouter.get("/source/:slug", getSource)
)
