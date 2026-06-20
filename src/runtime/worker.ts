import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { D1ArtifactCatalogLive } from "../artifact-catalog/d1/d1-artifact-catalog.js";
import { ArtifactPublicationLive } from "../artifact-publication/artifact-publication.js";
import { R2ArtifactSourceLive } from "../artifact-source/r2/r2-artifact-source.js";
import { PublicArtifactAccessLive } from "../public-artifact-access/public-artifact-access.js";
import { AppConfigLive } from "./config.js";
import { AppHttpLive } from "./http.js";
import {
  CloudflareBindingsLive,
  CloudflareConfigProviderLive,
  CloudflareD1SqlLive,
  type CloudflareEnv,
} from "./bindings.js";

const CloudflareArtifactCatalogLive = D1ArtifactCatalogLive.pipe(Layer.provide(CloudflareD1SqlLive));
const CloudflareAppConfigLive = AppConfigLive.pipe(Layer.provide(CloudflareConfigProviderLive));
const CloudflareInfraLive = Layer.mergeAll(
  CloudflareAppConfigLive,
  CloudflareArtifactCatalogLive,
  R2ArtifactSourceLive,
);

const CloudflareServicesLive = Layer.mergeAll(ArtifactPublicationLive, PublicArtifactAccessLive).pipe(
  Layer.provideMerge(CloudflareInfraLive),
);

const buildCloudflareApp = (env: CloudflareEnv) =>
  AppHttpLive.pipe(Layer.provide(CloudflareServicesLive), Layer.provide(CloudflareBindingsLive(env)));

type WebHandler = (request: Request) => Promise<Response>;

const handlers = new WeakMap<CloudflareEnv, WebHandler>();

const handlerForCloudflareEnv = (env: CloudflareEnv): WebHandler => {
  const existing = handlers.get(env);
  if (existing !== undefined) {
    return existing;
  }

  const { handler } = HttpRouter.toWebHandler(buildCloudflareApp(env) as never);
  const webHandler: WebHandler = (request) => handler(request as never, undefined as never);
  handlers.set(env, webHandler);
  return webHandler;
};

export default {
  fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    return handlerForCloudflareEnv(env)(request);
  },
} satisfies ExportedHandler<CloudflareEnv>;
