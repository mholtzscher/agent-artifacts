# Go Docker Rewrite — Implementation Spec

**Status:** Implemented and validated
**Effort:** XL (>2 days)
**Approved by:** User
**Date:** 2026-07-09

## Problem Statement

**Who:** Operators and publishers of Agent Artifacts.

**What:** The current application is coupled to Cloudflare Workers, D1, R2, Alchemy, and the TypeScript/Effect runtime. The desired deployment is a conventional single-host Docker application backed by PostgreSQL and a local persistent filesystem.

**Why it matters:** A Go binary and Docker Compose deployment remove the Cloudflare-specific runtime and make the application portable to a single Docker host while retaining the existing publish-and-read product.

**Evidence:** The current application exposes five routes, stores artifact metadata in D1, stores immutable sources in R2, and has no supported local filesystem application runner. The rewrite was explicitly requested with Huma, chi, sqlc, Goose, PostgreSQL, and local filesystem storage.

## Decisions Already Made

- Build the rewrite alongside the existing application under `go-app/`; do not replace the TypeScript application during implementation.
- Start with a fresh PostgreSQL database and empty source volume. Do not build D1/R2 import or dual-run tooling.
- Target one application replica on one Docker Compose host.
- Preserve the existing route paths and multipart publish workflow, but use consistent Huma/RFC 9457 errors rather than matching the existing error bodies exactly.
- Keep only the current product capabilities: publish, recent feed, rendered artifact, and immutable source retrieval.
- Keep a server-rendered browser feed and artifact pages.
- Isolate active HTML in a sandboxed iframe without same-origin privileges. Do not render raw HTML embedded in Markdown.

## Proposed Solution

Create a standalone Go 1.25 module in `go-app/`. A chi router owns middleware, health routes, browser routes, and source responses. Huma v2 is adapted to the same chi router for `/api/v1/*`, generated OpenAPI, validation, and RFC 9457 problem responses. This avoids forcing browser-oriented HTML and byte-stream routes through Huma while preserving one HTTP server.

PostgreSQL stores artifact identity and metadata. SQL migrations are append-only Goose files embedded into the binary and applied before the HTTP server starts. sqlc generates pgx/v5 query code from the same migration directory and handwritten SQL queries. Application queries use `pgxpool`; startup migrations use Goose with pgx's `database/sql` adapter and close that temporary connection after migration.

The source filesystem stores one immutable source per artifact at `DATA_DIR/artifacts/<artifact-uuid>/source.<ext>`. Files are written to a temporary file in the destination directory, hashed and counted while copying, synced, and atomically renamed. Metadata is inserted only after the final source exists. If the insert fails, the application removes the source best-effort and returns an internal error. A process crash can leave an unreferenced source file, but cannot intentionally publish a database row before its source exists. Cross-resource transactions and automatic orphan reconciliation are out of scope.

## Architecture and Module Seams

Use a few deep modules rather than a repository layer for every table:

- `publication`: exposes one `Publish` interface that hides authentication-independent publication behavior: source detection, title inference, UUID and slug assignment, hashing, filesystem persistence, metadata insertion, compensation, and response construction.
- `access`: exposes recent-list and artifact-lookup interfaces, hiding active-record lookup and source loading.
- `sourcefs`: owns safe path derivation, atomic writes, reads, and cleanup. Callers never construct filesystem paths.
- `render`: owns the feed shell, Markdown rendering policy, HTML iframe shell, and escaping.
- `httpapi`: translates chi/Huma inputs and outputs to the publication/access interfaces and owns HTTP-specific authentication and error mapping.
- `postgres`: sqlc-generated types and queries. Do not wrap generated queries in a pass-through repository interface.
- `app`: configuration, migrations, dependency construction, server lifecycle, and graceful shutdown.

Dependencies are accepted by constructors. Tests exercise the same module interfaces used by HTTP handlers. Temporary filesystem adapters and a real ephemeral PostgreSQL database are preferred over speculative generic storage interfaces.

### Proposed Layout

```text
go-app/
  cmd/agent-artifacts/main.go
  internal/
    access/access.go
    app/app.go
    artifact/model.go
    httpapi/api.go
    httpapi/browser.go
    httpapi/middleware.go
    postgres/                 # committed sqlc output
    publication/publication.go
    render/render.go
    sourcefs/store.go
  migrations/
    00001_create_artifacts.sql
  queries/
    artifacts.sql
  web/
    templates/
    static/
  compose.yaml
  Dockerfile
  .dockerignore
  .env.example
  go.mod
  go.sum
  sqlc.yaml
  README.md
```

Files may be split when implementation size warrants it, but no barrel-like packages or single-method pass-through layers should be added.

## Supporting Stack

| Concern           | Choice                                                   | Reason                                                                         |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Go version        | Go 1.25                                                  | Current Huma requires Go 1.25 or newer.                                        |
| HTTP API          | Huma v2                                                  | Typed operations, validation, OpenAPI 3.1, and RFC 9457 errors.                |
| Router            | chi v5                                                   | One router for Huma API operations, browser routes, middleware, and probes.    |
| PostgreSQL driver | pgx/v5 + pgxpool                                         | Native PostgreSQL support and direct sqlc integration.                         |
| SQL generation    | sqlc                                                     | Type-safe generated query code; generated files are committed.                 |
| Migrations        | Goose v3                                                 | Append-only embedded SQL migrations applied at startup.                        |
| Markdown          | goldmark                                                 | Go-native CommonMark renderer; unsafe/raw HTML remains disabled.               |
| HTML templates    | `html/template`                                          | Sufficient for the small server-rendered UI; avoids a template code generator. |
| IDs               | `github.com/google/uuid`                                 | Application-generated UUIDs are needed before filesystem persistence.          |
| Logging           | `log/slog`                                               | Structured JSON logs without another logging dependency.                       |
| Configuration     | Environment variables + standard library                 | The deployment has a small fixed configuration surface.                        |
| Testing           | `testing`, `httptest`, and Testcontainers for PostgreSQL | Unit/HTTP tests plus real PostgreSQL semantics.                                |

sqlc should be version-pinned as a Go tool dependency. Do not require sqlc in the runtime image.

## Data Model

### PostgreSQL `artifacts`

| Column            | PostgreSQL type | Constraints / meaning                            |
| ----------------- | --------------- | ------------------------------------------------ |
| `id`              | `uuid`          | Primary key; generated by the application.       |
| `slug`            | `text`          | Unique, non-empty public identifier.             |
| `title`           | `text`          | Required, non-empty display title.               |
| `description`     | `text`          | Nullable.                                        |
| `source_type`     | `text`          | Check constraint: `markdown` or `html`.          |
| `source_filename` | `text`          | Original multipart filename.                     |
| `sha256`          | `text`          | Lowercase 64-character SHA-256 hex digest.       |
| `size_bytes`      | `bigint`        | Non-negative source size.                        |
| `project`         | `text`          | Nullable provenance.                             |
| `repo_full_name`  | `text`          | Nullable provenance.                             |
| `branch`          | `text`          | Nullable provenance.                             |
| `commit_sha`      | `text`          | Nullable provenance.                             |
| `dirty`           | `boolean`       | Required; defaults to false.                     |
| `agent`           | `text`          | Nullable provenance.                             |
| `generator`       | `text`          | Nullable provenance.                             |
| `created_at`      | `timestamptz`   | Required; application UTC timestamp.             |
| `updated_at`      | `timestamptz`   | Required; equal to `created_at` in this release. |

Indexes:

- Unique index on `slug`.
- Descending index on `created_at` for the recent feed.

Artifact lifecycle state is omitted because withdrawal is explicitly outside the first Go release. Adding lifecycle later requires a new append-only migration.

### Filesystem Contract

```text
DATA_DIR/
  artifacts/
    <uuid>/
      source.md | source.html
```

Invariants:

- Paths are derived only from a parsed UUID and the closed `SourceType` enum; user filenames never become path segments.
- Published source bytes are immutable.
- Writes use a temporary file in the target directory followed by atomic rename.
- Existing destinations are never overwritten.
- Reads verify the source exists; a missing source for an existing row is an internal consistency error.

## HTTP Contract

### Existing routes retained

| Method | Path                | Behavior                                                           |
| ------ | ------------------- | ------------------------------------------------------------------ |
| `GET`  | `/`                 | Server-rendered recent artifact feed, newest first, limited to 50. |
| `GET`  | `/a/{slug}`         | Server-rendered artifact shell and view.                           |
| `GET`  | `/source/{slug}`    | Immutable source bytes.                                            |
| `GET`  | `/api/v1/artifacts` | JSON recent feed, newest first, limited to 50.                     |
| `POST` | `/api/v1/artifacts` | Authenticated multipart publication.                               |

### Operational and documentation routes

| Method | Path            | Behavior                                                                                             |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `GET`  | `/healthz`      | Liveness: process can serve HTTP; no dependency check.                                               |
| `GET`  | `/readyz`       | Readiness: startup completed and PostgreSQL responds. Filesystem writability is verified at startup. |
| `GET`  | `/docs`         | Huma-generated interactive API documentation.                                                        |
| `GET`  | `/openapi.json` | Generated OpenAPI 3.1 document.                                                                      |

### Publish request

Headers:

- `X-Write-Key: <secret>` is required.
- Compare the provided key with the configured key using constant-time comparison.
- Missing key returns 401; incorrect key returns 403.

Multipart fields:

- `file` — required; one `.md`, `.markdown`, `.html`, or `.htm` file.
- `title` — optional; inferred from the filename when absent or blank.
- `description`, `project`, `repo`, `branch`, `commit_sha`, `agent`, `generator` — optional trimmed strings; blanks become null.
- `dirty` — optional boolean accepting `1`, `true`, or `yes` as true; all other submitted values are false for compatibility.

Rules:

- A chi middleware wraps the body with `http.MaxBytesReader` before Huma parses multipart data. Default maximum request size: 10 MiB, configurable with `MAX_UPLOAD_BYTES`.
- Unsupported source types return 415.
- Invalid multipart/form values return 400 or Huma validation errors.
- Successful publication returns 201.
- Slugs use a slugified title plus an 8-character random hex suffix. A PostgreSQL unique constraint is authoritative; collision retries are bounded.

Success body fields:

```json
{
  "id": "uuid",
  "slug": "implementation-plan-1a2b3c4d",
  "title": "Implementation Plan",
  "sourceType": "markdown",
  "artifactUrl": "/a/implementation-plan-1a2b3c4d",
  "sourceUrl": "/source/implementation-plan-1a2b3c4d",
  "createdAt": "2026-07-09T12:00:00Z"
}
```

`PUBLIC_BASE_URL`, when configured, turns response URLs into absolute URLs. Otherwise they remain relative.

### Error format

API errors use Huma's `application/problem+json` RFC 9457 representation with a stable status, title, detail, and validation errors where applicable. Internal causes and the write key are never returned.

Browser routes return small server-rendered 404/500 pages rather than JSON problem bodies.

### Rendering and active-content policy

- Markdown is rendered by goldmark with raw HTML disabled. Template values are escaped by `html/template`.
- HTML artifacts are placed in `iframe[srcdoc]` with `sandbox="allow-scripts"`; `allow-same-origin`, top navigation, forms, popups, and downloads are not granted.
- The HTML source route uses `text/plain; charset=utf-8` plus `X-Content-Type-Options: nosniff`, so opening `/source/{slug}` cannot execute publisher HTML on the application origin.
- Markdown sources use `text/markdown; charset=utf-8` plus `X-Content-Type-Options: nosniff`.
- The artifact shell retains a feed link, title, source link, and full-viewport iframe layout.

## Configuration

| Variable                    | Required | Default    | Meaning                                       |
| --------------------------- | -------- | ---------- | --------------------------------------------- |
| `DATABASE_URL`              | Yes      | —          | PostgreSQL connection URL.                    |
| `AGENT_ARTIFACTS_WRITE_KEY` | Yes      | —          | Shared publication secret.                    |
| `DATA_DIR`                  | No       | `/data`    | Root of persistent source storage.            |
| `LISTEN_ADDR`               | No       | `:8080`    | HTTP listen address.                          |
| `PUBLIC_BASE_URL`           | No       | unset      | Absolute public URL prefix for API responses. |
| `MAX_UPLOAD_BYTES`          | No       | `10485760` | Maximum complete multipart request size.      |

Configuration is parsed and validated once at startup. Invalid or missing required configuration fails startup with an error that names the variable but never prints secret values.

## Startup and Shutdown

1. Parse configuration.
2. Verify/create `DATA_DIR/artifacts` and prove it is writable with a create/remove probe.
3. Connect through pgx's `database/sql` adapter and apply embedded Goose migrations.
4. Open and ping the application `pgxpool`.
5. Construct modules and start HTTP serving.
6. Mark readiness true.
7. On SIGINT/SIGTERM, stop readiness, gracefully drain HTTP requests with a bounded timeout, close PostgreSQL, and exit.

Any migration, filesystem, or database startup failure prevents HTTP serving.

## Docker Deployment

- Multi-stage Dockerfile produces one static Linux binary in a minimal non-root runtime image.
- Runtime image contains templates/static assets via Go embedding; only `/data` is writable.
- Compose defines:
  - `app`, built from `go-app/Dockerfile`.
  - `postgres`, pinned to a specific major version and protected by a health check.
  - A named PostgreSQL data volume.
  - A named source data volume mounted at `/data`.
- `app` waits for PostgreSQL health, but also owns retry/fail-fast startup behavior and migrations.
- App port defaults to `8080` and is published to the host.
- `.env.example` documents non-secret examples; real secrets are not committed.

Single-host named volumes are the durability model. Automated backups, restore orchestration, TLS termination, reverse proxy configuration, and multi-host shared storage are documented as operator concerns but are not implemented in this release. A valid backup must include both PostgreSQL and the source volume.

## Scope and Ordered Deliverables

| ID  | Deliverable                                                                                                                                                         | Effort | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | ---------- |
| D1  | Scaffold `go-app/`, pin tools/dependencies, define config and domain model, add initial Goose migration/sqlc queries, and commit generated query code.              |      L | —          |
| D2  | Implement filesystem source storage and the publication module, including atomic writes, hashing, compensation, auth integration, multipart limits, and POST route. |      L | D1         |
| D3  | Implement access queries, JSON feed, source retrieval, safe Markdown/HTML rendering, templates, and browser routes.                                                 |      L | D1, D2     |
| D4  | Add embedded migrations, startup/shutdown lifecycle, probes, structured logging, Dockerfile, Compose, and environment documentation.                                |      L | D1-D3      |
| D5  | Add unit, PostgreSQL integration, filesystem, HTTP, and end-to-end tests; integrate Go checks into root validation; document local development and operation.       |      L | D1-D4      |

Total effort is XL because this is a parallel runtime rewrite with persistence, security, deployment, and end-to-end verification, not a mechanical language translation.

## Non-Goals

- Migrating or importing existing D1/R2 data.
- Editing metadata, withdrawing artifacts, deleting artifacts, search, or pagination.
- User accounts, per-publisher keys, OAuth, sessions, or an admin UI.
- Multiple app replicas or network/distributed source storage.
- Kubernetes manifests, TLS certificates, reverse proxy setup, automated backup jobs, or restore tooling.
- Byte-for-byte parity with current HTML, JSON error bodies, or generated slugs.
- Replacing or deleting the existing TypeScript/Cloudflare app during this implementation.
- Automatic reconciliation of orphan files after process or host failure.

## Acceptance Criteria

- [x] `docker compose up --build` from `go-app/` starts healthy app and PostgreSQL containers from an empty state without a separate migration command.
- [x] Restarting the stack with volumes retained preserves metadata and source bytes.
- [x] A valid write key can publish Markdown and HTML using the retained multipart route and fields; the response is 201 and contains working artifact/source URLs.
- [x] Missing and invalid write keys return 401 and 403 RFC 9457 responses respectively.
- [x] Unsupported files return 415; missing file returns a validation/client error; requests over the configured limit return 413.
- [x] Publication computes and stores the exact SHA-256 and byte size of the immutable source.
- [x] A failed metadata insert removes the newly written source best-effort and does not expose an artifact.
- [x] The JSON and HTML feeds show the newest 50 artifacts in descending creation order.
- [x] Markdown renders without executing embedded raw HTML.
- [x] HTML artifact scripts can execute inside the iframe but cannot obtain same-origin access to the parent application.
- [x] Directly opening an HTML source URL displays source text and does not execute it.
- [x] Missing artifact and source routes return 404; a database row with a missing source returns/logs an internal consistency failure without exposing filesystem paths.
- [x] `/openapi.json` documents both JSON API operations and their request/response/error shapes.
- [x] `/healthz` and `/readyz` report expected states; SIGTERM causes bounded graceful shutdown.
- [x] The runtime container runs as a non-root user and writes only to the mounted source volume.
- [x] `go test ./...`, `go vet ./...`, sqlc generation verification, Docker build, and the repository's `bun run agent-validate` pass.

## Test Strategy

| Layer                  | What                                                                                                 | How                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Unit                   | Title inference, source detection, slug generation, config parsing, URL construction, error mapping. | Table-driven Go tests.                                                            |
| Filesystem             | Atomic write/read, no overwrite, path safety, digest/size, cleanup.                                  | Real temporary directories.                                                       |
| Rendering              | Escaping, raw Markdown HTML suppression, iframe sandbox attributes, source content headers.          | Golden/DOM-oriented output assertions without snapshotting incidental whitespace. |
| PostgreSQL integration | Migration, insert, uniqueness, lookup, recent ordering/limit.                                        | Testcontainers PostgreSQL using the production migration and generated sqlc code. |
| HTTP integration       | Auth, multipart validation/limit, RFC 9457 errors, feeds, browser routes, OpenAPI, probes.           | `httptest.Server` with temporary source directory and test PostgreSQL.            |
| Container E2E          | Fresh startup, publish/read round trip, restart persistence, health.                                 | Docker Compose smoke script.                                                      |

Tests should assert observable behavior at module interfaces. Do not duplicate sqlc-generated implementation tests or mock every SQL call.

## Risks and Mitigations

| Risk                                                                                            |              Likelihood | Impact | Mitigation                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ----------------------: | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL and filesystem cannot participate in one atomic transaction.                         |                  Medium |   High | Persist source atomically before metadata, compensate on insert failure, never expose a row before its source exists, log cleanup failure, document possible orphans. |
| Publisher HTML escapes isolation or executes through the source route.                          |                  Medium |   High | Omit `allow-same-origin`, disable raw Markdown HTML, serve HTML source as `text/plain`, add `nosniff`, and cover with browser/security tests.                         |
| Multipart uploads bypass Huma's documented body-size path.                                      | High without mitigation |   High | Apply chi `http.MaxBytesReader` before Huma multipart parsing and test 413 behavior.                                                                                  |
| Named-volume ownership prevents a non-root container from writing.                              |                  Medium |   High | Create `/data` with the runtime UID/GID in the image, test from a completely fresh named volume, and fail startup on writability check.                               |
| App-start migrations make rollback to an older image unsafe after a forward-only schema change. |                  Medium | Medium | Keep migrations append-only and backward-compatible where practical; document database backup before upgrade.                                                         |
| Committed sqlc output drifts from migrations/queries.                                           |                  Medium | Medium | Pin sqlc and make validation regenerate/check for a clean diff.                                                                                                       |

## Trade-offs Made

| Chose                                                      | Over                                     | Because                                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Huma only for JSON API routes                              | Routing every response through Huma      | Browser HTML and immutable byte responses are clearer as chi handlers; OpenAPI still covers the public JSON API.                  |
| Startup-embedded Goose migrations                          | Separate migration container/manual step | Single-host Compose should start from empty with one command and one image.                                                       |
| pgxpool plus temporary `database/sql` migration connection | One shared connection abstraction        | sqlc integrates directly with pgx/v5 while Goose's provider interface requires `*sql.DB`.                                         |
| Concrete sqlc/source dependencies                          | Generic repository/storage interfaces    | There is one production database and one filesystem implementation; pass-through seams add no leverage.                           |
| `html/template`                                            | templ or a frontend framework            | The UI is small and server-rendered; code generation or a JS build adds unnecessary tooling.                                      |
| Named local Docker volumes                                 | Bind mounts by default                   | Named volumes provide the simplest repeatable Compose setup; operators can replace the source mount with a bind mount if desired. |
| Safe rendering changes                                     | Exact current active-content behavior    | The current same-origin source behavior permits stored XSS; the user selected sandboxing.                                         |

## Rollout

1. Implement and validate `go-app/` without changing current deployment files.
2. Start a fresh Compose environment and pass container E2E acceptance criteria.
3. Publish representative Markdown and scripted HTML artifacts and manually verify rendering/isolation.
4. Put the Go deployment behind the intended external TLS/reverse proxy if needed.
5. Switch publishers and traffic to the Go deployment. Because data starts fresh, rollback means routing traffic back to the unchanged Cloudflare app; artifacts published only to Go remain only in its PostgreSQL/source volumes.
6. Remove the TypeScript/Cloudflare app only in a separately approved cleanup task.

## Research Basis

- Huma provides an official chi adapter, OpenAPI 3.1 generation, RFC 9457 errors, multipart support, and request-limit controls. Multipart takes a distinct adapter parsing path, which is why publication also requires chi-level request limiting.
- sqlc supports `sql_package: "pgx/v5"` and generated queries bound to pgx transactions.
- Goose v3 supports embedded SQL migrations, PostgreSQL, and a provider constructed with `*sql.DB`.

Official references:

- <https://huma.rocks/features/bring-your-own-router/>
- <https://huma.rocks/features/request-inputs/#multipart-form-data>
- <https://huma.rocks/features/request-limits/>
- <https://docs.sqlc.dev/en/latest/guides/using-go-and-pgx.html>
- <https://docs.sqlc.dev/en/latest/howto/transactions.html>
- <https://pressly.github.io/goose/documentation/provider/>

## Open Questions

None blocking. The proposed `go-app/` folder name and 10 MiB default upload limit are reversible implementation defaults and can be changed during review.
