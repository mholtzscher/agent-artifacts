# Effect v4 Migration Plan

## Context

The project currently runs on **Effect v3**:

| Package                  | Current         |
| ------------------------ | --------------- |
| `effect`                 | `^3.21.3`       |
| `@effect/platform`       | `^0.96.1`       |
| `@effect/platform-bun`   | `4.0.0-beta.83` |
| `@effect/sql`            | `^0.51.1`       |
| `@effect/sql-sqlite-bun` | `4.0.0-beta.83` |
| `@effect/opentelemetry`  | `^0.63.0`       |
| `@effect/vitest`         | `^0.29.0`       |

Effect v4 is currently in **beta** (`4.0.0-beta.83`). We will target the latest v4 beta and use the new `effect/unstable/*` paths for HTTP, SQL, and observability modules. It unifies ecosystem packages under one version, consolidates many `@effect/platform` and `@effect/sql` modules into `effect`, and introduces breaking API renames. The core model stays the same.

## Approach

Upgrade all Effect packages together to matching v4 beta versions, then fix imports and API calls module by module. Because v4 requires a single shared version, a partial upgrade is not viable.

Order of work:

1. Bump `package.json` deps and install.
2. Rewrite moved imports (`@effect/platform/*` → `effect/unstable/http`, `effect/Path`, `effect/FileSystem`; `@effect/sql/*` → `effect/unstable/sql`).
3. Migrate services from `Effect.Service` to `Context.Service` with explicit `Layer.effect` layers.
4. Migrate Schema APIs (`TaggedError`, `transform`, decode/encode renames).
5. Migrate `Either` → `Result` and `catchAll` → `catch`.
6. Fix `Yieldable` compile errors.
7. Type-check and test.

## Files to modify

| File                                          | Changes                                           |
| --------------------------------------------- | ------------------------------------------------- |
| `package.json`                                | Bump Effect deps to v4 beta.                      |
| `src/Program.ts`                              | Platform imports.                                 |
| `src/config/Config.ts`                        | `Effect.Service` → `Context.Service`.             |
| `src/http/Http.ts`                            | Platform imports, `catchAll` if used.             |
| `src/domain/Artifact.ts`                      | `Schema.TaggedError` → `Schema.TaggedErrorClass`. |
| `src/domain/ArtifactUtils.ts`                 | `Either` → `Result`.                              |
| `src/repository/ArtifactRepository.ts`        | SQL imports, service, schema transform.           |
| `src/repository/ArtifactDatabase.ts`          | SQL/SQLite/platform imports, layer.               |
| `src/source-storage/ArtifactSourceStorage.ts` | Platform imports, service.                        |
| `src/publishing/ArtifactPublishing.ts`        | Service, tagged error, `Effect.fn`.               |
| `src/telemetry/Telemetry.ts`                  | OpenTelemetry imports.                            |
| `test/config/Config.test.ts`                  | `@effect/vitest` API.                             |
| `test/domain/ArtifactUtils.test.ts`           | `Result` assertions.                              |
| `test/publishing/ArtifactPublishing.test.ts`  | Service layer construction, `SqlError` import.    |
| `test/http/Http.integration.test.ts`          | Likely none, but verify via integration run.      |

## Reuse

Existing code patterns to preserve:

- `Effect.gen` generators remain idiomatic in v4.
- `Layer` wiring in `src/Program.ts` stays structurally the same; only import paths and layer constructors change.
- Schema class-based domain models (`Artifact`, `PublishResponse`) keep their shape; only constructor and transform APIs change.
- `Effect.fn` traced function wrappers are still supported in v4.

Key v4 reference mappings used:

- `Effect.Service<Self>()(id, { effect, accessors })` → `Context.Service<Self>()(id, { make })` + `static layer = Layer.effect(this, this.make)`.
- `Schema.TaggedError` → `Schema.TaggedErrorClass`.
- `Schema.transform(from, to, { decode, encode, strict })` → `from.pipe(Schema.decodeTo(to, SchemaTransformation.transform({ decode, encode })))`.
- `Schema.decodeUnknown` / `Schema.encode` → `Schema.decodeUnknownEffect` / `Schema.encodeEffect`.
- `Either` → `Result`; `Either.right/left/isLeft` → `Result.succeed/fail/isFailure`.
- `Effect.catchAll` → `Effect.catch`; `Effect.catchAllCause` → `Effect.catchCause`.

## Steps

- [ ] **Pin target version**: update all Effect ecosystem packages in `package.json` to the latest v4 beta (`^4.0.0-beta.83` or newer). Remove `@effect/platform` and `@effect/sql` from dependencies (their modules now ship inside `effect`).
- [ ] **Install and baseline**: run `bun install`, then `bun run check` to capture the full set of compile errors.
- [ ] **Import migration pass**: rewrite imports across `src` and `test` per the v3→v4 import map, focusing on:
  - `@effect/platform` → `effect/unstable/http`
  - `@effect/platform/Path` → `effect/Path`
  - `@effect/platform/FileSystem` → `effect/FileSystem`
  - `@effect/sql` → `effect/unstable/sql`
  - `@effect/sql/SqlError` → `effect/unstable/sql/SqlError`
  - `@effect/sql-sqlite-bun` → stays as a separate package, bumped to v4 beta
  - `@effect/opentelemetry/NodeSdk` → migrate into `effect/unstable/observability` or the matching v4 `@effect/opentelemetry` export
- [ ] **Service migration pass**: convert each `Effect.Service` class to `Context.Service` with `make`, and replace auto-generated `.Default` layers with explicit `static layer = Layer.effect(this, this.make)` layers wired via `Layer.provide`.
- [ ] **Schema migration pass**:
  - `Schema.TaggedError` → `Schema.TaggedErrorClass`
  - `Schema.transform(ArtifactRow, Artifact, { ... })` → `ArtifactRow.pipe(Schema.decodeTo(Artifact, SchemaTransformation.transform({ ... })))`
  - `Schema.decodeUnknown` → `Schema.decodeUnknownEffect`, `Schema.encode` → `Schema.encodeEffect`
  - Verify `Schema.Class` constructor signature is unchanged.
- [ ] **Either/Result migration pass**: update `src/domain/ArtifactUtils.ts` and tests to use `Result` instead of `Either`.
- [ ] **Error handling pass**: rename any `Effect.catchAll`/`catchAllCause` calls.
- [ ] **Yieldable compile fixes**: ensure no code passes `Option`, `Result`, or services directly to `Effect` combinators expecting `Effect`; convert with `.asEffect()` or use `Effect.gen`.
- [ ] **Type check**: run `bun run check` until clean.
- [ ] **Unit tests**: run `bun run test` and fix failures.
- [ ] **Integration tests**: run HTTP integration tests and manual publish/read flow.
- [ ] **Lint**: run `bun run lint` and fix any import-sort or codegen issues.

## Verification

- `bun run check` passes with no TypeScript errors.
- `bun run test` passes (unit + integration).
- Manual smoke test: start server, publish Markdown and HTML artifacts, verify feed, rendered page, and source endpoints.
- Docker build still succeeds if dependencies changed.

## Decisions

- **Target version**: Use the latest Effect v4 beta (`effect@^4.0.0-beta.83` and matching versions for all ecosystem packages). We accept the risk of future beta breaking changes.
- **Unstable modules**: Use the new `effect/unstable/*` paths for HTTP, SQL, and observability modules.
- **Scope**: Include the OpenTelemetry telemetry layer in the same migration pass.

## Open questions / decisions needed

None remaining.
