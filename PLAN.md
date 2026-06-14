# Agent Artifacts Implementation Plan

## Context

Agent Artifacts should become a self-hosted public artifact feed for agent-generated Markdown and HTML documents. The current repository is still close to the Effect TypeScript template: `src/Program.ts` only logs `Hello, World!`, and `test/Dummy.test.ts` is a placeholder.

Project vocabulary and decisions already exist in:

- `CONTEXT.md` — product language: Artifact, Publisher, Write Key, Source, Rendered View, Artifact State, Withdrawn Artifact, etc.
- `docs/adr/0001-immutable-artifact-source.md` — published source is immutable; later edits are metadata-only.
- `docs/adr/0002-same-origin-scripted-html-artifacts.md` — v1 intentionally permits scripted HTML on the app origin.
- `docs/adr/0003-withdrawn-artifacts-retain-slugs.md` — withdrawn artifacts retain identity/metadata/slug; source and rendered routes return `410 Gone`.
- `docs/adr/0004-effect-platform-http-server.md` — use `@effect/platform` and `@effect/platform-bun` for the HTTP server.
- `agent-pages-implementation-handoff.md` — broad product/route/storage/API handoff.

## Approach

Implement the server/API MVP first in thin, testable vertical slices using Effect services. Defer CLI implementation, metadata edits, and withdrawal routes to follow-up plans, while designing the schema so ADR-defined withdrawal can be added without changing public slugs.

1. Establish an Effect Platform HTTP server with configuration for port, public base URL, data directory, SQLite database path, and write key.
2. Use Effect SQL SQLite for artifact metadata persistence.
3. Store immutable source files on disk under a stable per-artifact directory.
4. Render Markdown/HTML on request from immutable source rather than caching or storing rendered output in v1.
5. Implement only the agreed MVP routes:
   - `POST /api/artifacts`
   - `GET /`
   - `GET /a/:slug`
   - `GET /source/:slug`
   - `GET /api/artifacts`
6. Add Docker packaging for homelab deployment.

## Files to modify

Likely files/directories:

- `package.json` — package name, scripts, runtime dependencies, binary entrypoint.
- `src/Program.ts` — server bootstrap or delegate to new server module.
- `src/**` — new modules for config, HTTP routes, auth, persistence, storage, rendering, slug generation, and CLI.
- `test/**` — replace placeholder tests with unit/integration tests.
- `README.md` — update from template docs to Agent Artifacts usage/deployment notes.
- New deployment files such as `Dockerfile` and optional `docker-compose.yml`.

## Reuse

Existing reusable project assets:

- `CONTEXT.md` for exact terminology.
- `docs/adr/*.md` for hard architectural constraints.
- Effect test setup via `@effect/vitest` in `test/Dummy.test.ts`.
- Existing TypeScript/Effect build and lint scripts in `package.json`.

Dependencies to add:

- `@effect/platform`, `@effect/platform-bun` for the HTTP server per ADR 0004.
- Effect SQL SQLite packages for metadata persistence.
- Markdown renderer such as `markdown-it` or `marked`.
- Small utilities for hashing, multipart handling if not covered by Effect Platform, and safe HTML escaping/page templates as needed.

## Steps

- [x] Normalize project metadata from template to Agent Artifacts (`package.json`, README wording, import aliases if needed).
- [x] Add runtime dependencies for Effect Platform HTTP, Effect SQL SQLite, and Markdown rendering.
- [x] Implement configuration service and validation for `PORT`, `PUBLIC_BASE_URL`, `DATABASE_URL` or database path, `STORAGE_DIR`, and `AGENT_ARTIFACTS_WRITE_KEY`.
- [x] Implement metadata schema and startup migration/initialization for the MVP `artifacts` table. Include a state column or equivalent now so future withdrawal can preserve metadata/slugs cleanly, but do not expose `DELETE` yet.
- [x] Implement filesystem storage layout for immutable source files, e.g. `${STORAGE_DIR}/artifacts/<artifact-id>/source.<ext>`.
- [x] Implement slug/title/source-type utilities:
  - infer title from form field or filename;
  - detect Markdown and HTML source types for v1;
  - generate lowercase readable slug plus short random suffix;
  - verify slug uniqueness through the repository layer.
- [x] Implement `POST /api/artifacts`:
  - require `X-Write-Key`;
  - accept multipart `file` plus optional metadata fields from the handoff;
  - compute SHA-256 and size;
  - persist metadata and source;
  - return `id`, `slug`, `title`, `sourceType`, `artifactUrl`, `sourceUrl`, and `createdAt`.
- [x] Implement `GET /api/artifacts` public JSON feed for recent active artifacts.
- [x] Implement `GET /source/:slug` to return the immutable raw source for active artifacts.
- [x] Implement `GET /a/:slug` to render a simple app wrapper page from source on request:
  - Markdown source becomes HTML inside the wrapper;
  - HTML source is displayed faithfully per ADR 0002, preferably via an internal iframe/embed helper if simple, otherwise directly with the same-origin risk documented;
  - include title, metadata, created timestamp, and raw source link.
- [x] Implement `GET /` public HTML feed of recent active artifacts.
- [x] Add Docker packaging and README deployment instructions.
- [x] Replace placeholder tests with coverage for config and slugging, plus manual publish/read route verification.
- [x] Document follow-up plan items: CLI publish command, `PATCH` metadata edits, `DELETE` withdrawal, tags/projects/repos/collections pages.

## Verification

- Run `bun run check`.
- Run `bun run test`.
- Run HTTP integration tests for public reads, protected writes, and publish/read flows.
- Manually publish a Markdown file and an HTML file locally, then verify `/`, `/a/:slug`, `/source/:slug`, and `/api/artifacts`.
- Manually verify missing/invalid `X-Write-Key` responses and success path.
- Restart the server and verify persisted SQLite metadata and filesystem source still serve correctly.
- Build and run the Docker image with a mounted data volume.

## Decisions from planning

- First pass scope: server/API MVP routes only.
- SQLite: use Effect SQL SQLite.
- Rendering: generate rendered HTML on request from immutable source.
- CLI: defer until after server/API MVP.
