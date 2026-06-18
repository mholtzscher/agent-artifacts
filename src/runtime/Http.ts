import * as Layer from "effect/Layer";
import { HttpApi } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  ArtifactPublicationApiGroup,
  ArtifactPublicationApiLive,
} from "../artifact-publication/ArtifactPublication.js";
import {
  PublicArtifactApiGroup,
  PublicArtifactBrowserGroup,
  PublicArtifactHttpLive,
} from "../public-artifact-access/PublicArtifactAccess.js";

export const AppApi = HttpApi.make("AgentArtifactsApi").add(
  ArtifactPublicationApiGroup,
  PublicArtifactApiGroup,
  PublicArtifactBrowserGroup,
);

export const AppApiLive = HttpApiBuilder.layer(AppApi).pipe(
  Layer.provide(Layer.mergeAll(ArtifactPublicationApiLive, PublicArtifactHttpLive)),
);
