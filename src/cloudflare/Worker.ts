import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { AppApiLive } from "../http/Http.js";
import { ArtifactPublishingLive } from "../publishing/ArtifactPublishing.js";
import { D1ArtifactRepositoryLive } from "../repository/d1/D1ArtifactRepository.js";
import { R2ArtifactSourceStorageLive } from "../source-storage/r2/R2ArtifactSourceStorage.js";
import { CloudflareAppConfigLive, CloudflareBindingsLive, type CloudflareBindings } from "./Bindings.js";

const CloudflareLive = ArtifactPublishingLive.pipe(
  Layer.provideMerge(Layer.mergeAll(CloudflareAppConfigLive, D1ArtifactRepositoryLive, R2ArtifactSourceStorageLive)),
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
