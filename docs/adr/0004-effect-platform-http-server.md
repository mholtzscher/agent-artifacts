# Use Effect Platform for the HTTP server

Agent Artifacts uses `@effect/platform` with `@effect/platform-bun` as the HTTP server foundation instead of a simpler Hono or Fastify app. This accepts additional framework complexity so HTTP routing, configuration, filesystem access, database access, and error handling can share Effect's typed service model while running on Bun.
