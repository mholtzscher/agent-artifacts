# Use Effect Platform for the HTTP server

Agent Pages uses `@effect/platform` with `@effect/platform-node` as the HTTP server foundation instead of a simpler Hono or Fastify app. This accepts additional framework complexity so HTTP routing, configuration, filesystem access, database access, and error handling can share Effect's typed service model.
