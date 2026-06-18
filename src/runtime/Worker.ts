import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { D1ArtifactCatalogLive } from "../artifact-catalog/d1/D1ArtifactCatalog.js";
import { ArtifactPublicationLive } from "../artifact-publication/ArtifactPublication.js";
import { R2ArtifactSourceLive } from "../artifact-source/r2/R2ArtifactSource.js";
import { PublicArtifactAccessLive } from "../public-artifact-access/PublicArtifactAccess.js";
import { AppApiLive } from "./Http.js";
import {
  CloudflareAppConfigLive,
  CloudflareBindingsLive,
  CloudflareD1SqlLive,
  type CloudflareBindings,
} from "./Bindings.js";

const CloudflareCatalogLive = D1ArtifactCatalogLive.pipe(Layer.provide(CloudflareD1SqlLive));
const CloudflareInfraLive = Layer.mergeAll(CloudflareAppConfigLive, CloudflareCatalogLive, R2ArtifactSourceLive);

const CloudflareLive = Layer.mergeAll(ArtifactPublicationLive, PublicArtifactAccessLive).pipe(
  Layer.provideMerge(CloudflareInfraLive),
);

const buildCloudflareApp = (env: CloudflareBindings) =>
  AppApiLive.pipe(Layer.provide(CloudflareLive), Layer.provide(CloudflareBindingsLive(env)));

type WebHandler = (request: Request) => Promise<Response>;

const handlers = new WeakMap<CloudflareBindings, WebHandler>();

const handlerForCloudflareEnv = (env: CloudflareBindings): WebHandler => {
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
  fetch(request: Request, env: CloudflareBindings): Promise<Response> {
    return handlerForCloudflareEnv(env)(request);
  },
} satisfies ExportedHandler<CloudflareBindings>;
