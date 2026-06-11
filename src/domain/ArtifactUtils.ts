import * as Either from "effect/Either"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import * as path from "node:path"

import { ArtifactId, Slug, type SourceType, UnsupportedSourceTypeError } from "./Artifact.js"

export const makeArtifactId = (): ArtifactId => ArtifactId.make(randomUUID())

export const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

export const inferTitle = (filename: string, provided?: string | undefined): string => {
  const trimmed = provided?.trim()
  if (trimmed !== undefined && trimmed !== "") {
    return trimmed
  }
  const basename = path.basename(filename, path.extname(filename))
  return basename.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled artifact"
}

export const detectSourceType = (
  filename: string,
  contentType?: string | undefined
): Either.Either<SourceType, UnsupportedSourceTypeError> => {
  const extension = path.extname(filename).toLowerCase()
  if (extension === ".md" || extension === ".markdown" || contentType === "text/markdown") {
    return Either.right("markdown")
  }
  if (extension === ".html" || extension === ".htm" || contentType === "text/html") {
    return Either.right("html")
  }
  return Either.left(new UnsupportedSourceTypeError({ filename }))
}

export const slugBase = (title: string): string => {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base === "" ? "artifact" : base
}

export const makeSlugCandidate = (title: string): Slug => {
  const suffix = randomBytes(3).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4)
  return Slug.make(`${slugBase(title)}-${suffix || "x"}`)
}

export const extensionForSourceType = (sourceType: SourceType): string => {
  switch (sourceType) {
    case "markdown":
      return ".md"
    case "html":
      return ".html"
  }
}
