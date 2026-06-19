import * as Schema from "effect/Schema";

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class ForbiddenError extends Schema.TaggedErrorClass<ForbiddenError>()(
  "ForbiddenError",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class BadRequestError extends Schema.TaggedErrorClass<BadRequestError>()(
  "BadRequestError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class ArtifactNotFoundError extends Schema.TaggedErrorClass<ArtifactNotFoundError>()(
  "ArtifactNotFoundError",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class ArtifactWithdrawnError extends Schema.TaggedErrorClass<ArtifactWithdrawnError>()(
  "ArtifactWithdrawnError",
  { message: Schema.String },
  { httpApiStatus: 410 },
) {}

export class ServerError extends Schema.TaggedErrorClass<ServerError>()(
  "ServerError",
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}
