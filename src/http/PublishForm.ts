import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { HttpServerRequest, Multipart } from "effect/unstable/http";

export const nullableField = (value: string | ReadonlyArray<string> | undefined): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim();
  return trimmed === undefined || trimmed === "" ? null : trimmed;
};

export const booleanField = (value: string | ReadonlyArray<string> | undefined): boolean => {
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

export const readPublishMultipartForm = Effect.gen(function* () {
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
