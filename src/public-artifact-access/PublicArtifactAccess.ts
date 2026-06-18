import MarkdownIt from "markdown-it";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import { type Artifact, ArtifactId, ArtifactState, Slug, SourceType } from "../domain/Artifact.js";
import { ArtifactNotFoundError, ArtifactWithdrawnError, ServerError } from "../domain/ArtifactErrors.js";
import { ArtifactCatalog, type ArtifactCatalogError } from "../artifact-catalog/ArtifactCatalog.js";
import { ArtifactSource, type ArtifactSourceError } from "../artifact-source/ArtifactSource.js";

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const recentArtifactFeedLimit = 50;

export const PublicArtifactItem = Schema.Struct({
  id: ArtifactId,
  slug: Slug,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  sourceType: SourceType,
  sourceUrl: Schema.String,
  artifactUrl: Schema.String,
  project: Schema.NullOr(Schema.String),
  repoFullName: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  commitSha: Schema.NullOr(Schema.String),
  dirty: Schema.Boolean,
  agent: Schema.NullOr(Schema.String),
  generator: Schema.NullOr(Schema.String),
  state: ArtifactState,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type PublicArtifactItem = Schema.Schema.Type<typeof PublicArtifactItem>;

export const PublicArtifactFeedResponse = Schema.Struct({ artifacts: Schema.Array(PublicArtifactItem) });
export type PublicArtifactFeedResponse = Schema.Schema.Type<typeof PublicArtifactFeedResponse>;

export interface PublicArtifactSource {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export type PublicArtifactAccessError = ArtifactNotFoundError | ArtifactWithdrawnError | ServerError;

const toServerError = () => new ServerError({ message: "Internal server error" });
const toPublicError = (_error: ArtifactCatalogError | ArtifactSourceError): PublicArtifactAccessError =>
  toServerError();

const pathsForSlug = (slug: Slug) => ({ artifactPath: `/a/${slug}`, sourcePath: `/source/${slug}` });

const publicArtifactItem = (artifact: Artifact): PublicArtifactItem => {
  const paths = pathsForSlug(artifact.slug);
  return {
    id: artifact.id,
    slug: artifact.slug,
    title: artifact.title,
    description: artifact.description,
    sourceType: artifact.sourceType,
    sourceUrl: paths.sourcePath,
    artifactUrl: paths.artifactPath,
    project: artifact.project,
    repoFullName: artifact.repoFullName,
    branch: artifact.branch,
    commitSha: artifact.commitSha,
    dirty: artifact.dirty,
    agent: artifact.agent,
    generator: artifact.generator,
    state: artifact.state,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
};

const sourceContentType = (artifact: Artifact) =>
  artifact.sourceType === "markdown" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pageShell = (title: string, body: string, options?: { readonly bodyClass?: string }) =>
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 920px; margin: 0 auto; padding: 32px 20px 56px; }
    a { color: LinkText; }
    .artifact-card { border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: 12px; padding: 18px; margin: 16px 0; }
    .metadata { color: color-mix(in srgb, CanvasText 70%, transparent); font-size: 0.92rem; }
    .source-frame { width: 100%; min-height: 70vh; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: 12px; background: white; }
    pre, code { white-space: pre-wrap; }
    .artifact-detail-page { height: 100vh; overflow: hidden; }
    .artifact-shell { height: 100vh; overflow: hidden; }
    .artifact-banner { height: 48px; box-sizing: border-box; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 0 16px; border-bottom: 1px solid color-mix(in srgb, CanvasText 16%, transparent); background: Canvas; }
    .artifact-back, .artifact-source-link { font-size: 0.875rem; white-space: nowrap; text-decoration: none; }
    .artifact-back:hover, .artifact-source-link:hover { text-decoration: underline; }
    .artifact-title { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1rem; font-weight: 600; }
    .artifact-preview { box-sizing: border-box; width: 100%; max-width: none; height: calc(100vh - 48px); margin: 0; padding: 0; overflow: auto; }
    .artifact-preview > article { box-sizing: border-box; width: 100%; min-height: 100%; padding: 24px; }
    .artifact-preview > .source-frame { display: block; width: 100%; height: 100%; min-height: 0; border: 0; border-radius: 0; }
  </style>
</head>
<body${options?.bodyClass === undefined ? "" : ` class="${escapeHtml(options.bodyClass)}"`}>
${body}
</body>
</html>`;

export const renderArtifactPage = (artifact: Artifact, source: string): string => {
  const paths = pathsForSlug(artifact.slug);
  const rendered =
    artifact.sourceType === "markdown"
      ? `<article>${markdown.render(source)}</article>`
      : `<iframe class="source-frame" sandbox="allow-scripts allow-same-origin" srcdoc="${escapeHtml(source)}"></iframe>`;

  return pageShell(
    artifact.title,
    `<div class="artifact-shell">
    <header class="artifact-banner">
      <a class="artifact-back" href="/">← Recent artifacts</a>
      <h1 class="artifact-title">${escapeHtml(artifact.title)}</h1>
      <a class="artifact-source-link" href="${escapeHtml(paths.sourcePath)}">Source</a>
    </header>
    <main class="artifact-preview">
      ${rendered}
    </main>
  </div>`,
    { bodyClass: "artifact-detail-page" },
  );
};

export const renderFeedPage = (artifacts: ReadonlyArray<PublicArtifactItem>): string =>
  pageShell(
    "Agent Artifacts",
    `<main>
    <h1>Agent Artifacts</h1>
    <p class="metadata">Recent public artifacts generated by coding agents.</p>
    ${
      artifacts.length === 0
        ? "<p>No artifacts published yet.</p>"
        : artifacts
            .map((artifact) => {
              return `<section class="artifact-card">
      <h2><a href="${escapeHtml(artifact.artifactUrl)}">${escapeHtml(artifact.title)}</a></h2>
      ${artifact.description === null ? "" : `<p>${escapeHtml(artifact.description)}</p>`}
      <p class="metadata">${escapeHtml(artifact.sourceType)} · ${escapeHtml(artifact.createdAt)} · <a href="${escapeHtml(artifact.sourceUrl)}">Source</a></p>
    </section>`;
            })
            .join("\n")
    }
  </main>`,
  );

export class PublicArtifactAccess extends Context.Service<
  PublicArtifactAccess,
  {
    readonly recentFeed: Effect.Effect<PublicArtifactFeedResponse, ServerError>;
    readonly homePage: Effect.Effect<string, ServerError>;
    readonly renderedView: (slug: Slug) => Effect.Effect<string, PublicArtifactAccessError>;
    readonly source: (slug: Slug) => Effect.Effect<PublicArtifactSource, PublicArtifactAccessError>;
  }
>()("AgentArtifacts/PublicArtifactAccess") {}

export const PublicArtifactAccessLive = Layer.effect(
  PublicArtifactAccess,
  Effect.gen(function* () {
    const catalog = yield* ArtifactCatalog;
    const artifactSource = yield* ArtifactSource;

    const recentFeed = catalog.listRecent(recentArtifactFeedLimit).pipe(
      Effect.map((artifacts) => ({ artifacts: artifacts.map(publicArtifactItem) })),
      Effect.mapError(toServerError),
    );

    const loadActiveArtifactSource = (slug: Slug) =>
      Effect.gen(function* () {
        const found = yield* catalog.findBySlug(slug).pipe(Effect.mapError(toPublicError));
        if (Option.isNone(found)) {
          return yield* Effect.fail(new ArtifactNotFoundError({ message: "Artifact not found" }));
        }
        const artifact = found.value;
        if (artifact.state === "withdrawn") {
          yield* Effect.logWarning("withdrawn artifact access").pipe(Effect.annotateLogs("artifactId", artifact.id));
          return yield* Effect.fail(new ArtifactWithdrawnError({ message: "Artifact withdrawn" }));
        }
        const bytes = yield* artifactSource.read(artifact).pipe(
          Effect.tapError(() => Effect.logError("artifact source read failed")),
          Effect.mapError(toPublicError),
          Effect.annotateLogs({ artifactId: artifact.id, sourceType: artifact.sourceType }),
        );
        return { artifact, bytes };
      }).pipe(Effect.annotateLogs("slug", slug));

    return PublicArtifactAccess.of({
      recentFeed,
      homePage: recentFeed.pipe(Effect.map((response) => renderFeedPage(response.artifacts))),

      renderedView: Effect.fn("PublicArtifactAccess.renderedView")(function* (slug: Slug) {
        const { artifact, bytes } = yield* loadActiveArtifactSource(slug);
        return renderArtifactPage(artifact, new TextDecoder().decode(bytes));
      }),

      source: Effect.fn("PublicArtifactAccess.source")(function* (slug: Slug) {
        const { artifact, bytes } = yield* loadActiveArtifactSource(slug);
        return { bytes, contentType: sourceContentType(artifact) };
      }),
    });
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

export const PublicArtifactBrowserGroup = HttpApiGroup.make("public-artifact-browser").add(
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

const PublicArtifactApi = HttpApi.make("AgentArtifactsApi").add(PublicArtifactApiGroup, PublicArtifactBrowserGroup);

export const PublicArtifactHttpLive = HttpApiBuilder.group(PublicArtifactApi, "public-artifact-api", (handlers) =>
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
