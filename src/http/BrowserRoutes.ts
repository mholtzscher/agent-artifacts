import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import { type Artifact, Slug } from "../domain/Artifact.js";
import { renderArtifactPage, renderFeedPage } from "../render/Render.js";
import { ArtifactRepository } from "../repository/ArtifactRepository.js";
import { ArtifactSourceStorage } from "../source-storage/ArtifactSourceStorage.js";
import { ArtifactNotFoundError, ArtifactWithdrawnError, ServerError } from "./ApiErrors.js";
import { findActiveArtifact } from "./ArtifactLookup.js";

export const SlugParams = Schema.Struct({ slug: Slug });
export const HtmlResponse = Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/html; charset=utf-8" }));
export const SourceResponse = Schema.declare((u): u is Uint8Array => u instanceof Uint8Array).pipe(
  HttpApiSchema.asUint8Array(),
);

const sourceContentType = (artifact: Artifact) =>
  artifact.sourceType === "markdown" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";

const browserErrors = [ArtifactNotFoundError, ArtifactWithdrawnError, ServerError] as const;

export const BrowserRoutesGroup = HttpApiGroup.make("browser").add(
  HttpApiEndpoint.get("getHome", "/", {
    success: HtmlResponse,
    error: ServerError,
  }),
  HttpApiEndpoint.get("getArtifactPage", "/a/:slug", {
    params: SlugParams,
    success: HtmlResponse,
    error: browserErrors,
  }),
  HttpApiEndpoint.get("getSource", "/source/:slug", {
    params: SlugParams,
    success: SourceResponse,
    error: browserErrors,
  }),
);

const toServerError = () => new ServerError({ message: "Internal server error" });

const toBrowserError = (error: unknown) =>
  error instanceof ArtifactNotFoundError || error instanceof ArtifactWithdrawnError ? error : toServerError();

const BrowserApi = HttpApi.make("AgentArtifactsApi").add(BrowserRoutesGroup);

export const BrowserRoutesLive = HttpApiBuilder.group(BrowserApi, "browser", (handlers) =>
  handlers
    .handle("getHome", () =>
      Effect.gen(function* () {
        const repository = yield* ArtifactRepository;
        const artifacts = yield* repository.listRecentArtifacts(50);
        return HttpServerResponse.html(renderFeedPage(artifacts));
      }).pipe(Effect.mapError(toServerError)),
    )
    .handle("getArtifactPage", ({ params }) =>
      Effect.gen(function* () {
        const artifact = yield* findActiveArtifact(params.slug).pipe(Effect.mapError(toBrowserError));
        const storage = yield* ArtifactSourceStorage;
        const source = yield* storage.readSource(artifact.id, artifact.sourceType).pipe(
          Effect.tapError(() => Effect.logError("artifact page source read failed")),
          Effect.mapError(toServerError),
          Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType }),
        );
        return HttpServerResponse.html(renderArtifactPage(artifact, new TextDecoder().decode(source)));
      }).pipe(Effect.annotateLogs("slug", params.slug)),
    )
    .handle("getSource", ({ params }) =>
      Effect.gen(function* () {
        const artifact = yield* findActiveArtifact(params.slug).pipe(Effect.mapError(toBrowserError));
        const storage = yield* ArtifactSourceStorage;
        const source = yield* storage.readSource(artifact.id, artifact.sourceType).pipe(
          Effect.tapError(() => Effect.logError("source response read failed")),
          Effect.mapError(toServerError),
          Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType }),
        );
        return HttpServerResponse.uint8Array(source, { contentType: sourceContentType(artifact) });
      }).pipe(Effect.annotateLogs("slug", params.slug)),
    ),
);
