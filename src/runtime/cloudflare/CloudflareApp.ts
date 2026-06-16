import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { CloudflareAppConfigLive, CloudflareBindingsLive, type CloudflareBindings } from "./CloudflareBindings.js";
import { D1ArtifactRepositoryLive } from "../../repository/d1/D1ArtifactRepository.js";
import { R2ArtifactSourceStorageLive } from "../../source-storage/r2/R2ArtifactSourceStorage.js";
import { AppRouter } from "../../http/Http.js";
import { ArtifactPublishingLive } from "../../publishing/ArtifactPublishing.js";

export const AppRouteLive = HttpRouter.addAll(AppRouter);

export const CloudflareDataLive = Layer.merge(D1ArtifactRepositoryLive, R2ArtifactSourceStorageLive);

export const CloudflareAppLive = (env: CloudflareBindings) => {
  const BindingsLive = CloudflareBindingsLive(env);
  const ConfigLive = CloudflareAppConfigLive(env);
  const DataLive = CloudflareDataLive.pipe(Layer.provide(BindingsLive));
  const PublishingLive = ArtifactPublishingLive.pipe(Layer.provide(DataLive));

  return AppRouteLive.pipe(
    HttpRouter.provideRequest(PublishingLive),
    HttpRouter.provideRequest(DataLive),
    HttpRouter.provideRequest(ConfigLive),
  );
};
