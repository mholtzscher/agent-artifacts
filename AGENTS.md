# Agent Instructions

## Required validation

After all work, run `bun run agent-validate` from the repository root before
considering the task complete. The chain short-circuits on the first failure.

If `format:check` fails, run `bun run format` to fix formatting, then re-run
`bun run agent-validate`.

## Effect usage

When writing or refactoring Effect services, prefer `Effect.Service` for concise service definitions, unless existing local conventions or compatibility constraints make `Context.Tag` clearer.

Prefer changes that keep the codebase easy to migrate to Effect v4. Avoid patterns that would make a future v4 migration harder when an equally simple v3-compatible option exists.

Use `Schema` for domain objects and boundary objects: persisted rows, HTTP request/response payloads, config, public DTOs, branded IDs, and structured errors. Plain TypeScript types are fine for small internal values that never cross a boundary.

For HTTP-bound errors, define structured errors with `Schema.TaggedErrorClass` and put the HTTP status annotation directly on the error class using the third argument, for example `{ httpApiStatus: 404 }`. Use the error classes themselves in `HttpApiEndpoint` `error` declarations; do not create duplicate `FooErrorSchema = FooError.pipe(HttpApiSchema.status(...))` exports unless the same error type genuinely needs different statuses in different HTTP contexts. Prefer failing with these typed errors from route/auth/lookup helpers instead of failing with `HttpServerResponse` values. API endpoints should return typed JSON errors; browser-facing HTML/source routes may still return raw `HttpServerResponse` successes where content type or rendering requires it.

When mapping between boundary shapes and domain shapes, prefer one bidirectional schema-level transform over a pair of ad hoc mapper functions (see `src/repository/ArtifactRepository.ts` for a live example — `Schema.decodeTo` + `SchemaGetter.transform`). The transform replaces two hand-written mappers that can drift apart, keeps the snake_case↔camelCase and `dirty: 1`↔boolean rules in a single definition, and preserves validation in the Effect error channel via `Schema.decodeUnknownEffect` / `Schema.encodeEffect`.

For persisted rows, make schemas as strict as the storage contract allows. Reuse domain schemas for constrained values (`Schema.Literal` unions, branded IDs, state/source-type enums) and model SQLite booleans explicitly as `0 | 1` rather than accepting arbitrary numbers.

Keep database schema management out of repository services. Repositories should assume their storage exists and focus on domain persistence operations. Run migrations as an explicit startup/lifecycle concern, not hidden inside repository constructors or service acquisition.

Do not create an Effect service just to run a one-time side effect. If there is no meaningful service API, prefer a named `Effect` or `Layer.effectDiscard` and compose/run it at the application edge.

For D1 migrations, keep alchemy's `Cloudflare.D1Database` resource as the schema lifecycle owner. Keep migrations append-only under `migrations/d1/` and split schema evolution into separate numbered migrations; do not modify an already-recorded migration to perform new schema changes.

Use `@effect/sql-d1` for Cloudflare D1 access and prefer tagged SQL for static SQL statements. Reserve `sql.unsafe` for truly dynamic SQL that cannot be represented with the tagged SQL API.

Compose/provide layers deliberately near the application edge. Avoid scattered duplicate `Effect.provide` / `Layer.provide` calls for the same dependency; build stable layer constants and provide each dependency once where practical.
