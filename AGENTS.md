# Agent Instructions

## Required validation

After all work, run `./scripts/agent-validate.sh` from the repository root.
The chain short-circuits on the first failure.

## Go application

- Keep changes small and match nearby Go style.
- Run `go tool sqlc generate` after changing `migrations/` or `queries/`; commit generated changes in `internal/postgres/`.
- Goose migrations under `migrations/` are append-only after release.
- Use `just` targets for common development commands.
