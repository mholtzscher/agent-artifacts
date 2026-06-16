import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { AppRouter } from "../http/Http.js";
import { ArtifactPublishingLive } from "../publishing/ArtifactPublishing.js";
import { D1ArtifactRepositoryLive } from "../repository/d1/D1ArtifactRepository.js";
import { R2ArtifactSourceStorageLive } from "../source-storage/r2/R2ArtifactSourceStorage.js";
import { CloudflareAppConfigLive, CloudflareBindingsLive, type CloudflareBindings } from "./Bindings.js";

const CloudflareLive = ArtifactPublishingLive.pipe(
  Layer.provideMerge(Layer.mergeAll(CloudflareAppConfigLive, D1ArtifactRepositoryLive, R2ArtifactSourceStorageLive)),
);

const buildCloudflareApp = (env: CloudflareBindings) =>
  HttpRouter.addAll(AppRouter).pipe(
    HttpRouter.provideRequest(CloudflareLive.pipe(Layer.provide(CloudflareBindingsLive(env)))),
  );

type WebHandler = (request: Request) => Promise<Response>;

const handlers = new WeakMap<CloudflareBindings, WebHandler>();

export const handlerForCloudflareEnv = (env: CloudflareBindings): WebHandler => {
  const existing = handlers.get(env);
  if (existing !== undefined) {
    return existing;
  }

  const { handler } = HttpRouter.toWebHandler(buildCloudflareApp(env));
  handlers.set(env, handler);
  return handler;
};
