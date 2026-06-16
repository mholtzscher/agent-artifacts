# Cloudflare + Alchemy Deployment Plan

## Context

The app is currently a Bun/Effect HTTP server for Agent Artifacts. It persists artifact metadata in local SQLite via `@effect/sql-sqlite-bun` and stores immutable artifact source files on the local filesystem. The new goal is to deploy to Cloudflare using Alchemy while also preserving a local runtime for development/self-hosting.

Initial code findings:

- `src/Program.ts` boots a Bun HTTP server with `BunHttpServer.layer`.
- `src/config/Config.ts` reads local env vars: `PORT`, `PUBLIC_BASE_URL`, `DATABASE_URL`, `STORAGE_DIR`, and `AGENT_ARTIFACTS_WRITE_KEY`.
- `src/repository/ArtifactDatabase.ts` owns SQLite client setup and migrations.
- `src/repository/ArtifactRepository.ts` is already service-oriented and mostly storage-backend-agnostic above SQL operations.
- `src/source-storage/ArtifactSourceStorage.ts` owns local filesystem source storage.
- `src/http/Http.ts` defines the app routes and depends on repository/storage/publishing services rather than Bun directly.
- No Cloudflare, Wrangler, D1, R2, or Alchemy config exists yet.

## Approach

Recommended direction: keep the domain, rendering, publishing, and route logic shared, then split only the runtime adapters and deployment infrastructure.

- Add a Cloudflare Worker entrypoint that serves the existing `AppRouter` using an Effect/Fetch-compatible HTTP runtime.
- Add Cloudflare-specific implementations for metadata storage (D1) and source storage (R2).
- Keep the current Bun/SQLite/filesystem runtime as one supported local runtime path.
- Also support a local Cloudflare-style runtime with local D1/R2 bindings if feasible, exposed through Alchemy-managed scripts rather than a separate Wrangler deploy path.
- Use Alchemy as the canonical deployment tool to define/provision the Worker, D1 databases, R2 buckets, bindings, secrets, and deployment outputs for staging and production.
- Do not add custom domain routing yet; deploy to default Cloudflare Worker routes until a later plan.
- Treat Cloudflare D1/R2 deployments as new empty environments; do not build SQLite/filesystem migration tooling in this change.

## Files to modify

Likely files/directories:

- `package.json` — add Alchemy/Cloudflare scripts and dependencies.
- `src/Program.ts` — keep or rename as Bun/local entrypoint.
- New `src/Worker.ts` or `src/cloudflare/Worker.ts` — Cloudflare Worker entrypoint.
- `src/config/Config.ts` — separate runtime-neutral app config from Bun env config and Cloudflare binding config.
- `src/repository/ArtifactDatabase.ts` — retain for local SQLite only.
- `src/repository/ArtifactRepository.ts` — preserve interface; add D1-backed implementation.
- `src/source-storage/ArtifactSourceStorage.ts` — preserve interface; add R2-backed implementation.
- New `alchemy.run.ts` / `alchemy.ts` for Alchemy-managed staging/production Cloudflare resources.
- Tests under `test/**` for local runtime and Cloudflare adapter behavior.
- `README.md` — document local Bun runtime and Cloudflare deployment.

## Reuse

Existing code to reuse:

- `src/http/Http.ts` route definitions and multipart/auth behavior.
- `src/publishing/ArtifactPublishing.ts` publish orchestration and source-type/slug flow.
- `src/domain/Artifact.ts` and `src/domain/ArtifactUtils.ts` domain schemas/utilities.
- `src/render/Render.ts` HTML/Markdown rendering.
- `src/repository/ArtifactRepository.ts` service contract and row mapping shape, if exposed for D1 reuse.
- `src/source-storage/ArtifactSourceStorage.ts` service contract.
- Existing integration test pattern in `test/http/Http.integration.test.ts` for end-to-end local verification.

## Decisions

- Support both local modes if possible:
  - existing Bun + SQLite + filesystem via `bun run start`;
  - Cloudflare-style local runtime with local D1/R2 bindings for parity testing.
- Use Alchemy only as the committed infrastructure/deployment interface; do not add a standalone Wrangler deploy path.
- Provision separate staging and production Cloudflare environments/resources.
- Cloudflare environments can start empty; no local SQLite/filesystem to D1/R2 migration is required.
- Custom domain routing is out of scope for this change.

## Steps

- [ ] Identify the Effect HTTP adapter/runtime needed for Cloudflare Workers and adjust app composition accordingly.
- [ ] Refactor runtime composition so Bun/local and Cloudflare Worker entrypoints can share `AppRouter`, publishing, rendering, and domain layers.
- [ ] Add D1-backed `ArtifactRepository` implementation with equivalent schema/migrations.
- [ ] Add R2-backed `ArtifactSourceStorage` implementation using stable keys derived from artifact id and source type.
- [ ] Add Cloudflare binding/config service for D1, R2, public base URL, and write key.
- [ ] Add Alchemy infrastructure definition for staging and production Workers, D1 databases, R2 buckets, env vars/secrets, and deploy scripts.
- [ ] Add Alchemy-managed local Cloudflare-style dev command if supported by the selected Alchemy/Cloudflare tooling; otherwise document the limitation and keep tests covering D1/R2 adapters.
- [ ] Preserve current local Bun runtime scripts and document Bun + SQLite + filesystem behavior.
- [ ] Add tests for shared logic plus local runtime; add adapter-level tests/mocks for D1/R2 where feasible.
- [ ] Update README with both local runtime modes and staging/production Alchemy deployment instructions.

## Verification

- Run `bun run check`.
- Run `bun run test -- --run`.
- Run existing local Bun runtime with `bun run start` and publish/read a Markdown artifact through SQLite/filesystem storage.
- Run the Alchemy-managed local Cloudflare-style runtime, if available, and publish/read using local D1/R2 bindings.
- Deploy staging with Alchemy and verify `/`, `/api/artifacts`, `POST /api/artifacts`, `/a/:slug`, and `/source/:slug` end-to-end.
- Deploy production with Alchemy after staging passes and repeat a smoke test.
