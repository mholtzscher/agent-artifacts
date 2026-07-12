# Agent Artifacts

A single-host Docker application for agent-generated artifacts, using Go, Huma, chi, PostgreSQL, sqlc, Goose, and local persistent source files.

## Run with Docker Compose

```sh
cp .env.example .env
# Edit AGENT_ARTIFACTS_WRITE_KEY in .env.
docker compose --env-file .env -f deployments/compose.yaml up --build
```

The app is available at <http://localhost:8080/>. API documentation is at <http://localhost:8080/docs>, and OpenAPI JSON is at <http://localhost:8080/openapi.json>.

Publish Markdown:

```sh
curl -X POST http://localhost:8080/api/v1/artifacts \
  -H "X-Write-Key: ap_change_me" \
  -F "file=@PLAN.md" \
  -F "title=Implementation Plan"
```

Compose persists PostgreSQL metadata in `postgres_data` and immutable artifact sources in `artifact_sources`. Preserve both volumes when backing up or moving an installation.

Stop without deleting data:

```sh
docker compose --env-file .env -f deployments/compose.yaml down
```

Delete the deployment and all of its data:

```sh
docker compose --env-file .env -f deployments/compose.yaml down --volumes
```

## Production deployment

`deployments/compose.production.yaml` pulls a registry image, binds the HTTP port to localhost for a host-managed Cloudflare Tunnel, and stores data in Docker named volumes.

Set these production values in `.env`:

```dotenv
# Optional; defaults to ghcr.io/mholtzscher/agent-artifacts:latest
APP_IMAGE=ghcr.io/mholtzscher/agent-artifacts:1.0.0
POSTGRES_PASSWORD=replace_with_a_long_url_safe_password
AGENT_ARTIFACTS_WRITE_KEY=replace_with_a_long_random_key
PUBLIC_BASE_URL=https://artifacts.example.com
APP_PORT=8080
```

The default image is `ghcr.io/mholtzscher/agent-artifacts:latest`; overriding `APP_IMAGE` with an immutable release tag or image digest makes deployments repeatable. Because the database password is embedded in a URL, generate it from URL-safe characters. Keep `.env` readable only by the deployment user.

Start the stack:

```sh
chmod 600 .env
docker compose --env-file .env -f deployments/compose.production.yaml pull
docker compose --env-file .env -f deployments/compose.production.yaml up -d
docker compose --env-file .env -f deployments/compose.production.yaml ps
```

Configure the Cloudflare Tunnel origin as `http://localhost:8080`. PostgreSQL is not published, and the application port accepts host-local connections only.

The `artifact_sources` and `postgres_data` named volumes persist across container recreation and `docker compose down`; do not pass `--volumes` in production. Back up artifact files from the named volume and use `pg_dump` for PostgreSQL rather than copying its live data directory. Test restores periodically. The memory limits in the production file are conservative defaults and should be adjusted to the server and workload.

## Routes

- `GET /` — recent server-rendered feed
- `GET /a/{slug}` — rendered artifact page
- `GET /source/{slug}` — immutable source
- `GET /api/v1/artifacts` — recent JSON feed
- `POST /api/v1/artifacts` — publish with `X-Write-Key`
- `GET /docs` — interactive Huma API documentation
- `GET /openapi.json` — OpenAPI 3.1
- `GET /healthz` — liveness
- `GET /readyz` — readiness

HTML artifacts execute in an iframe with `sandbox="allow-scripts"` and no same-origin permission. Raw HTML inside Markdown is disabled. Direct HTML source responses use `text/plain` and `X-Content-Type-Options: nosniff`.

## Configuration

| Variable                    | Required | Default       |
| --------------------------- | -------: | ------------- |
| `DATABASE_URL`              |      yes | —             |
| `AGENT_ARTIFACTS_WRITE_KEY` |      yes | —             |
| `DATA_DIR`                  |       no | `/data`       |
| `LISTEN_ADDR`               |       no | `:8080`       |
| `PUBLIC_BASE_URL`           |       no | relative URLs |
| `MAX_UPLOAD_BYTES`          |       no | `10485760`    |

## Development

Requirements: Go 1.25.7+, Docker, and a running Docker daemon for PostgreSQL integration tests.

```sh
just generate
just test
just vet
docker build -f deployments/Dockerfile .
just smoke
```

Goose migrations in `internal/platform/db/migrations/` are embedded into the application and applied before HTTP starts. They are append-only after release. sqlc reads those migrations and `internal/platform/db/queries/`; generated code in `internal/platform/db/sqlc/` is committed.

## Operational scope

This release targets one app replica on one Docker host. TLS termination, reverse proxy configuration, automated backups, restore automation, and multi-host source storage are operator concerns. A valid backup includes both PostgreSQL and the source volume.
