# Agent Instructions

## Effect usage

When writing or refactoring Effect services, prefer `Effect.Service` for concise service definitions, unless existing local conventions or compatibility constraints make `Context.Tag` clearer.

Prefer changes that keep the codebase easy to migrate to Effect v4. Avoid patterns that would make a future v4 migration harder when an equally simple v3-compatible option exists.

Use `Schema` for domain objects and boundary objects: persisted rows, HTTP request/response payloads, config, public DTOs, branded IDs, and structured errors. Plain TypeScript types are fine for small internal values that never cross a boundary.

When mapping between boundary shapes and domain shapes, prefer schema-level transforms (`Schema.transform` / `Schema.transformOrFail`) over ad hoc mapper functions. Decode with `Schema.decodeUnknown` at boundaries so validation failures stay in the Effect error channel.

## Smoke testing

When a change affects publishing, rendering, routing, layout, or local runtime behavior, run the repeatable smoke test in [`docs/smoke-testing.md`](docs/smoke-testing.md).

Use the smoke test to verify that the app starts, an HTML artifact can be published, the artifact detail page renders, the app-shell layout fills the remaining viewport, and the page can be opened for human inspection.
