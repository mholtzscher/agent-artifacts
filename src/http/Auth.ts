import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { AppConfigService } from "../config/Config.js";

export const requireWriteKey = Effect.gen(function* () {
  const config = yield* AppConfigService;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const provided = request.headers["x-write-key"];
  if (provided === undefined) {
    yield* Effect.logWarning("publish rejected: missing write key");
    return yield* Effect.fail(HttpServerResponse.text("Missing write key", { status: 401 }));
  }
  if (provided !== Redacted.value(config.writeKey)) {
    yield* Effect.logWarning("publish rejected: invalid write key");
    return yield* Effect.fail(HttpServerResponse.text("Invalid write key", { status: 403 }));
  }
});
