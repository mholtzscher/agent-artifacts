import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { HttpRouter } from "effect/unstable/http";

import { ArtifactCatalog } from "../artifact-catalog/artifact-catalog.js";
import { makeD1ArtifactCatalog } from "../artifact-catalog/d1/d1-artifact-catalog.js";
import { ArtifactPublicationLive } from "../artifact-publication/artifact-publication.js";
import { ArtifactSource } from "../artifact-source/artifact-source.js";
import { makeR2ArtifactSource } from "../artifact-source/r2/r2-artifact-source.js";
import { PublicArtifactAccessLive } from "../public-artifact-access/public-artifact-access.js";
import { AppConfig } from "./config.js";
import { AppHttpLive } from "./http.js";

export interface CloudflareEnv {
  readonly DB: D1Database;
  readonly SOURCES: R2Bucket;
  readonly PUBLIC_BASE_URL?: string | undefined;
  readonly AGENT_ARTIFACTS_WRITE_KEY: string;
}

const makeAppConfig = (env: CloudflareEnv) =>
  AppConfig.of({
    publicBaseUrl: env.PUBLIC_BASE_URL === undefined ? undefined : new URL(env.PUBLIC_BASE_URL),
    writeKey: Redacted.make(env.AGENT_ARTIFACTS_WRITE_KEY),
  });

const makeCloudflareContext = (env: CloudflareEnv) =>
  Context.make(AppConfig, makeAppConfig(env)).pipe(
    Context.add(ArtifactCatalog, makeD1ArtifactCatalog(env.DB)),
    Context.add(ArtifactSource, makeR2ArtifactSource(env.SOURCES)),
  );

const AppServicesLive = Layer.mergeAll(ArtifactPublicationLive, PublicArtifactAccessLive);

const AppLive = AppHttpLive.pipe(Layer.provide(AppServicesLive));

const { handler } = HttpRouter.toWebHandler(AppLive as never);

export default {
  fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    return handler(request, makeCloudflareContext(env));
  },
} satisfies ExportedHandler<CloudflareEnv>;
