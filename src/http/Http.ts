import * as Layer from "effect/Layer";
import { HttpApi } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import { ArtifactApiGroup, ArtifactApiLive } from "./ArtifactApi.js";
import { BrowserRoutesGroup, BrowserRoutesLive } from "./BrowserRoutes.js";

export const AppApi = HttpApi.make("AgentArtifactsApi").add(ArtifactApiGroup, BrowserRoutesGroup);

export const AppApiLive = HttpApiBuilder.layer(AppApi).pipe(
  Layer.provide(Layer.mergeAll(ArtifactApiLive, BrowserRoutesLive)),
);
