# Agent Instructions

## Effect usage

When writing or refactoring Effect services, prefer `Effect.Service` for concise service definitions, unless existing local conventions or compatibility constraints make `Context.Tag` clearer.

Prefer changes that keep the codebase easy to migrate to Effect v4. Avoid patterns that would make a future v4 migration harder when an equally simple v3-compatible option exists.

Use `Schema` for domain objects and boundary objects: persisted rows, HTTP request/response payloads, config, public DTOs, branded IDs, and structured errors. Plain TypeScript types are fine for small internal values that never cross a boundary.

When mapping between boundary shapes and domain shapes, prefer schema-level transforms (`Schema.transform` / `Schema.transformOrFail`) over ad hoc mapper functions. Decode with `Schema.decodeUnknown` at boundaries so validation failures stay in the Effect error channel, and encode through the same transform when writing back to the boundary so read/write mappings do not drift.

For persisted rows, make schemas as strict as the storage contract allows. Reuse domain schemas for constrained values (`Schema.Literal` unions, branded IDs, state/source-type enums) and model SQLite booleans explicitly as `0 | 1` rather than accepting arbitrary numbers.

Keep database schema management out of repository services. Repositories should assume their storage exists and focus on domain persistence operations. Run migrations as an explicit startup/lifecycle concern, not hidden inside repository constructors or service acquisition.

Do not create an Effect service just to run a one-time side effect. If there is no meaningful service API, prefer a named `Effect` or `Layer.effectDiscard` and compose/run it at the application edge.

For SQLite migrations, prefer `@effect/sql-sqlite-node/SqliteMigrator` over the generic migrator unless there is a specific reason not to. Keep migrations append-only and split schema evolution into separate numbered migrations; do not modify an already-recorded migration to perform new schema changes.

Prefer tagged SQL for static SQL statements. Reserve `sql.unsafe` for truly dynamic SQL that cannot be represented with the tagged SQL API.

Compose/provide layers deliberately near the application edge. Avoid scattered duplicate `Effect.provide` / `Layer.provide` calls for the same dependency; build stable layer constants and provide each dependency once where practical.

## Smoke testing

When a change affects publishing, rendering, routing, layout, or local runtime behavior, run the repeatable smoke test in [`docs/smoke-testing.md`](docs/smoke-testing.md).

Use the smoke test to verify that the app starts, an HTML artifact can be published, the artifact detail page renders, the app-shell layout fills the remaining viewport, and the page can be opened for human inspection.
