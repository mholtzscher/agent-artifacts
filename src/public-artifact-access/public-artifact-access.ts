import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import { ArtifactCatalog } from "../artifact-catalog/artifact-catalog.js";
import { ArtifactSource } from "../artifact-source/artifact-source.js";
import { Slug } from "../domain/artifact.js";
import { ArtifactNotFoundError, ArtifactWithdrawnError, ServerError } from "../domain/artifact-errors.js";
import {
  loadActiveArtifactSource,
  sourceContentType,
  type PublicArtifactAccessError,
  type PublicArtifactSource,
} from "./internal/artifact-lookup.js";
import {
  PublicArtifactFeedResponse,
  publicArtifactItem,
  recentArtifactFeedLimit,
  type PublicArtifactFeedResponse as PublicArtifactFeedResponseType,
} from "./internal/public-artifact-feed.js";
import { renderArtifactPage, renderFeedPage } from "./internal/rendered-view.js";

const toServerError = () => new ServerError({ message: "Internal server error" });

export class PublicArtifactAccess extends Context.Service<
  PublicArtifactAccess,
  {
    readonly recentFeed: Effect.Effect<PublicArtifactFeedResponseType, ServerError, ArtifactCatalog>;
    readonly homePage: Effect.Effect<string, ServerError, ArtifactCatalog>;
    readonly renderedView: (
      slug: Slug,
    ) => Effect.Effect<string, PublicArtifactAccessError, ArtifactCatalog | ArtifactSource>;
    readonly source: (
      slug: Slug,
    ) => Effect.Effect<PublicArtifactSource, PublicArtifactAccessError, ArtifactCatalog | ArtifactSource>;
  }
>()("AgentArtifacts/PublicArtifactAccess") {}

const recentFeed = ArtifactCatalog.use((catalog) =>
  catalog.listRecent(recentArtifactFeedLimit).pipe(
    Effect.map((artifacts) => ({ artifacts: artifacts.map(publicArtifactItem) })),
    Effect.mapError(toServerError),
  ),
);

export const PublicArtifactAccessLive = Layer.succeed(
  PublicArtifactAccess,
  PublicArtifactAccess.of({
    recentFeed,
    homePage: recentFeed.pipe(Effect.map((response) => renderFeedPage(response.artifacts))),

    renderedView: Effect.fn("PublicArtifactAccess.renderedView")(function* (slug: Slug) {
      const catalog = yield* ArtifactCatalog;
      const artifactSource = yield* ArtifactSource;
      const { artifact, bytes } = yield* loadActiveArtifactSource({ catalog, artifactSource, slug });
      return renderArtifactPage(artifact, new TextDecoder().decode(bytes));
    }),

    source: Effect.fn("PublicArtifactAccess.source")(function* (slug: Slug) {
      const catalog = yield* ArtifactCatalog;
      const artifactSource = yield* ArtifactSource;
      const { artifact, bytes } = yield* loadActiveArtifactSource({ catalog, artifactSource, slug });
      return { bytes, contentType: sourceContentType(artifact) };
    }),
  }),
);

export const SlugParams = Schema.Struct({ slug: Slug });
export const HtmlResponse = Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/html; charset=utf-8" }));
export const SourceResponse = Schema.declare((u): u is Uint8Array => u instanceof Uint8Array).pipe(
  HttpApiSchema.asUint8Array(),
);

const browserErrors = [ArtifactNotFoundError, ArtifactWithdrawnError, ServerError] as const;

export const PublicArtifactApiGroup = HttpApiGroup.make("public-artifact-api")
  .add(
    HttpApiEndpoint.get("getFeedJson", "/artifacts", {
      success: PublicArtifactFeedResponse,
      error: ServerError,
    }),
  )
  .prefix("/api/v1");

export const PublicArtifactBrowserApiGroup = HttpApiGroup.make("public-artifact-browser").add(
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

const PublicArtifactApi = HttpApi.make("AgentArtifactsApi").add(PublicArtifactApiGroup, PublicArtifactBrowserApiGroup);

export const PublicArtifactAccessHttpLive = HttpApiBuilder.group(PublicArtifactApi, "public-artifact-api", (handlers) =>
  handlers.handle("getFeedJson", () =>
    Effect.gen(function* () {
      const access = yield* PublicArtifactAccess;
      return yield* access.recentFeed;
    }),
  ),
).pipe(
  Layer.merge(
    HttpApiBuilder.group(PublicArtifactApi, "public-artifact-browser", (handlers) =>
      handlers
        .handle("getHome", () =>
          Effect.gen(function* () {
            const access = yield* PublicArtifactAccess;
            return HttpServerResponse.html(yield* access.homePage);
          }),
        )
        .handle("getArtifactPage", ({ params }) =>
          Effect.gen(function* () {
            const access = yield* PublicArtifactAccess;
            const html = yield* access.renderedView(params.slug);
            return HttpServerResponse.html(html);
          }).pipe(Effect.annotateLogs("slug", params.slug)),
        )
        .handle("getSource", ({ params }) =>
          Effect.gen(function* () {
            const access = yield* PublicArtifactAccess;
            const source = yield* access.source(params.slug);
            return HttpServerResponse.uint8Array(source.bytes, { contentType: source.contentType });
          }).pipe(Effect.annotateLogs("slug", params.slug)),
        ),
    ),
  ),
);
