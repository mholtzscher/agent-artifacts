import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import { Slug } from "../domain/Artifact.js";
import { ArtifactPresentation } from "../presentation/ArtifactPresentation.js";
import { renderFeedPage } from "../render/Render.js";
import { ArtifactRepository } from "../repository/ArtifactRepository.js";
import { ArtifactNotFoundError, ArtifactWithdrawnError, ServerError } from "./ApiErrors.js";

export const SlugParams = Schema.Struct({ slug: Slug });
export const HtmlResponse = Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/html; charset=utf-8" }));
export const SourceResponse = Schema.declare((u): u is Uint8Array => u instanceof Uint8Array).pipe(
  HttpApiSchema.asUint8Array(),
);

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
        const presentation = yield* ArtifactPresentation;
        const html = yield* presentation.renderedView(params.slug);
        return HttpServerResponse.html(html);
      }).pipe(Effect.annotateLogs("slug", params.slug)),
    )
    .handle("getSource", ({ params }) =>
      Effect.gen(function* () {
        const presentation = yield* ArtifactPresentation;
        const source = yield* presentation.source(params.slug);
        return HttpServerResponse.uint8Array(source.bytes, { contentType: source.contentType });
      }).pipe(Effect.annotateLogs("slug", params.slug)),
    ),
);
