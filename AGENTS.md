# Agent Instructions

## Required validation

After all work, run `bun run agent-validate` from the repository root before
considering the task complete. The chain short-circuits on the first failure.

If `format:check` fails, run `bun run format` to fix formatting, then re-run
`bun run agent-validate`.

## Effect style guide

Use these rules when writing or refactoring Effect v4 code. Keep changes small,
consistent with nearby code, and aligned with the Effect v4 APIs and idioms used
in this codebase.

### Services and capabilities

- Prefer `Effect.Service` for concise service definitions, unless existing local
  conventions or compatibility constraints make `Context.Tag` clearer.
- Model services around capabilities or runtime dependencies, not implementation
  details. Prefer names like `ArtifactCatalog`, `ArtifactSource`,
  `ArtifactPublication`, `PublicArtifactAccess`, `AppConfig`, and
  `CloudflareBindings` over generic names like `ArtifactService`.
- Effect service tags do not use a `Service` suffix. Keep service tag keys as
  stable domain identifiers matching the service name, for example
  `AgentArtifacts/AppConfig`, with no `Service` suffix or implementation or
  platform detail.
- Do not create an Effect service just to run a one-time side effect. If there
  is no meaningful service API, prefer a named `Effect` or `Layer.effectDiscard`
  and compose/run it at the application edge.

### Schemas and boundaries

- Use `Schema` for domain objects and boundary objects: persisted rows, HTTP
  request/response payloads, config, public DTOs, branded IDs, and structured
  errors. Plain TypeScript types are fine for small internal values that never
  cross a boundary.
- Use a `Schema` suffix only when it disambiguates a representation or adapter
  schema, for example `ArtifactRowSchema`. Otherwise prefer idiomatic Effect
  Schema value/type pairs such as `Artifact` or `PublicArtifactFeedResponse`.
- When a service tag would collide with a raw boundary/config shape, give the
  raw shape a distinct name. Use `AppConfigDefinition` for the Effect config
  definition, `AppConfigShape` for the raw config object type, and
  `CloudflareEnv` for the raw Cloudflare Worker environment interface.
- When mapping between boundary shapes and domain shapes, prefer one
  bidirectional schema-level transform over a pair of ad hoc mapper functions
  (see `src/artifact-catalog/artifact-catalog.ts` for a live example —
  `Schema.decodeTo` + `SchemaGetter.transform`). The transform replaces two
  hand-written mappers that can drift apart, keeps rules such as
  snake_case↔camelCase and `dirty: 1`↔boolean in one definition, and preserves
  validation in the Effect error channel via `Schema.decodeUnknownEffect` /
  `Schema.encodeEffect`.

### Errors and HTTP APIs

- Structured error classes always end in `Error`.
- Keep shared HTTP/domain errors in the domain module, service-specific backend
  errors next to their service contract, and use-case-specific errors next to
  the use case.
- For HTTP-bound errors, define structured errors with `Schema.TaggedErrorClass`
  and put the HTTP status annotation directly on the error class using the third
  argument, for example `{ httpApiStatus: 404 }`.
- Use the error classes themselves in `HttpApiEndpoint` `error` declarations. Do
  not create duplicate
  `FooErrorSchema = FooError.pipe(HttpApiSchema.status(...))` exports unless the
  same error type genuinely needs different statuses in different HTTP contexts.
- Prefer failing with typed errors from route/auth/lookup helpers instead of
  failing with `HttpServerResponse` values. API endpoints should return typed
  JSON errors; browser-facing HTML/source routes may still return raw
  `HttpServerResponse` successes where content type or rendering requires it.
- HTTP API contracts and groups use `Api` / `ApiGroup`; HTTP handler layers use
  `HttpLive`. For example, use `ArtifactPublicationHttpLive`,
  `PublicArtifactAccessHttpLive`, `AppApi`, `AppHttpLive`, and
  `PublicArtifactBrowserApiGroup`.

### Persistence and database access

- For persisted rows, make schemas as strict as the storage contract allows.
  Reuse domain schemas for constrained values (`Schema.Literal` unions, branded
  IDs, state/source-type enums) and model SQLite booleans explicitly as `0 | 1`
  rather than accepting arbitrary numbers.
- Keep database schema management out of repository services. Repositories
  should assume their storage exists and focus on domain persistence operations.
  Run migrations as an explicit startup/lifecycle concern, not hidden inside
  repository constructors or service acquisition.
- For D1 migrations, keep alchemy's `Cloudflare.D1Database` resource as the
  schema lifecycle owner. Keep migrations append-only under `migrations/d1/` and
  split schema evolution into separate numbered migrations; do not modify an
  already-recorded migration to perform new schema changes.
- Use `@effect/sql-d1` for Cloudflare D1 access and prefer tagged SQL for static
  SQL statements. Reserve `sql.unsafe` for truly dynamic SQL that cannot be
  represented with the tagged SQL API.

### Layers and composition

- Compose/provide layers deliberately near the application edge. Avoid scattered
  duplicate `Effect.provide` / `Layer.provide` calls for the same dependency;
  build stable layer constants and provide each dependency once where practical.
- Exported `Layer` values always end in `Live`.
- Implementation-backed layers put the implementation or platform prefix first,
  for example `D1ArtifactCatalogLive`, `R2ArtifactSourceLive`,
  `CloudflareD1SqlLive`, and `CloudflareConfigProviderLive`.
- Runtime-only composed layers should have descriptive names and still end in
  `Live`; use `CloudflareServicesLive` for the app service graph backed by
  Cloudflare infrastructure.

### Files and helper modules

- Use kebab-case for every source and test filename. Do not add barrels just to
  hide filenames; keep direct imports explicit.
- Adapter filenames should include the technology prefix even inside technology
  subdirectories, for example `artifact-catalog/d1/d1-artifact-catalog.ts`.
- Internal helper modules should be kebab-case files with plain helper exports.
  Do not promote helpers to services/layers unless there is a real service API.
