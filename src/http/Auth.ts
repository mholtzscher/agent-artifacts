import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { HttpServerRequest } from "effect/unstable/http";

import { AppConfigService } from "../config/Config.js";
import { ForbiddenError, UnauthorizedError } from "./ApiErrors.js";

export const requireWriteKey = Effect.gen(function* () {
  const config = yield* AppConfigService;
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
