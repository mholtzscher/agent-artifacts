import * as Layer from "effect/Layer";
import { HttpApi } from "effect/unstable/httpapi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  ArtifactPublicationApiGroup,
  ArtifactPublicationHttpLive,
} from "../artifact-publication/artifact-publication.js";
import {
  PublicArtifactApiGroup,
  PublicArtifactBrowserApiGroup,
  PublicArtifactAccessHttpLive,
} from "../public-artifact-access/public-artifact-access.js";

export const AppApi = HttpApi.make("AgentArtifactsApi").add(
  ArtifactPublicationApiGroup,
  PublicArtifactApiGroup,
  PublicArtifactBrowserApiGroup,
);

export const AppHttpLive = HttpApiBuilder.layer(AppApi).pipe(
  Layer.provide(Layer.mergeAll(ArtifactPublicationHttpLive, PublicArtifactAccessHttpLive)),
);
