import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import { ArtifactId, Slug, type SourceType, UnsupportedSourceTypeError } from "./Artifact.js";

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

export const makeArtifactId = (): ArtifactId => ArtifactId.make(crypto.randomUUID());

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256Hex = (bytes: Uint8Array) =>
  Effect.promise(() => {
    const copy = new Uint8Array(bytes);
    return crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
  }).pipe(Effect.map((digest) => hex(new Uint8Array(digest))));

export const inferTitle = (filename: string, provided?: string): string => {
  const trimmed = provided?.trim();
  if (trimmed !== undefined && trimmed !== "") {
    return trimmed;
  }
  const basename = filenameWithoutExtension(filename);
  return basename.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled artifact";
};

export const detectSourceType = (
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

export const slugBase = (title: string): string => {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? "artifact" : base;
};

export const makeSlugCandidate = (title: string): Slug => {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(2)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return Slug.make(`${slugBase(title)}-${suffix || "x"}`);
};

export const extensionForSourceType = (sourceType: SourceType): string => {
  switch (sourceType) {
    case "markdown":
      return ".md";
    case "html":
      return ".html";
  }
};
