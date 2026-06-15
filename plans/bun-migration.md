# Bun Migration Plan

## Context

The project currently uses pnpm via Corepack as its package manager and script runner. Evidence found so far:

- `package.json` declares `"packageManager": "pnpm@10.14.0"` and scripts call `pnpm` internally for chained scripts (`build`, `lint-fix`).
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` are present; workspace only includes the root package.
- `README.md`, `docs/smoke-testing.md`, `Dockerfile`, and existing plans reference `pnpm` commands.
- `Dockerfile` starts from `node:24-slim`, enables Corepack, installs with `pnpm install --frozen-lockfile`, runs `pnpm check`, and starts with `pnpm start`.
- Nix dev shell currently provides `corepack`, `nodejs_22`, and `python3` for `node-gyp`.
- Runtime-specific source touchpoints are `src/Program.ts` (`@effect/platform-node`, `NodeHttpServer`, `NodeRuntime`, `NodeServices`, `node:http`) and `src/repository/ArtifactDatabase.ts` (`@effect/sql-sqlite-node`, `SqliteMigrator`).
- Other Node built-in imports currently appear in `src/domain/ArtifactUtils.ts` (`node:crypto`, `node:path`); either keep them intentionally as Bun-compatible Node built-ins or replace them only if a Bun-native replacement is simpler.

Goal: make the project look and behave as if it had used Bun from the start: local development, container build/runtime, docs, lockfile/package-manager metadata, server runtime, and persistence should all be Bun-native with no visible pnpm/Node-runtime migration scars.

User-selected scope:

- Use Bun as package manager, script runner, and JavaScript runtime for the server.
- Switch Docker to an official Bun base image.
- Remove pnpm-specific artifacts after generating `bun.lock`.
- Remove Node runtime-only packages that are replaced by Bun-specific Effect packages.
- Prefer clean Bun-first naming, docs, scripts, and dependency choices over compatibility notes or temporary fallback paths.

## Approach

Recommended approach: perform a full Bun migration rather than keeping the Node-oriented runtime path. The app currently starts through `tsx src/Program.ts`, uses `@effect/platform-node`/`NodeRuntime`, `node:http`, and `@effect/sql-sqlite-node` with native SQLite dependencies; migrate those application-edge and persistence pieces to Bun equivalents as part of this work.

Change `start` to run the TypeScript entrypoint with Bun (for example `bun run src/Program.ts`, or `bun src/Program.ts` if preferred), switch the server edge to `@effect/platform-bun` (`BunHttpServer`, `BunRuntime`, Bun services layer), switch SQLite access to `@effect/sql-sqlite-bun`, and update Docker to run the same Bun start command in production. Preserve the existing HTTP routes, config contract, migration table name, database file path semantics, data volume, and artifact storage behavior, but do not preserve old tool names, transitional comments, or fallback code once Bun-native behavior is verified.

## Files to modify

Initial expected files:

- `package.json`
- `bun.lock` / remove `pnpm-lock.yaml`
- remove `pnpm-workspace.yaml` because the current workspace only includes `.`; add `workspaces` to `package.json` only if Bun requires it later
- `README.md`
- `docs/smoke-testing.md`
- `Dockerfile`
- `flake.nix`
- `docker-compose.yml` only if the container image/runtime env or documented local compose flow changes
- `.github/workflows/docker.yml` only if Docker build args/cache setup changes
- `tsconfig*.json` only if Bun globals or `bun:sqlite` types require explicit `bun-types` configuration
- any checked-in generated metadata or examples that mention pnpm, Corepack, Node runtime startup, or `tsx`

## Reuse

- Keep `vitest` for tests.
- Reassess the rest of the build/check toolchain instead of keeping it by default: keep `typescript`/`tsc` only if we still want a dedicated typecheck command because Bun does not replace TypeScript typechecking; remove Babel and `@effect/build-utils` if the package no longer needs library-style ESM/CJS build artifacts; keep Oxlint as the linting quality gate.
- Add Bun-specific Effect packages: `@effect/platform-bun` and `@effect/sql-sqlite-bun`.
- Remove replaced Node-specific dependencies: `@effect/platform-node`, `@effect/sql-sqlite-node`, and `tsx`.
- Switch the current application edge in `src/Program.ts` from `NodeHttpServer`, `NodeRuntime`, `NodeServices`, and `node:http` to Bun runtime/platform APIs.
- Switch SQLite persistence in `src/repository/ArtifactDatabase.ts` from `@effect/sql-sqlite-node`/native SQLite to Bun SQLite while keeping migrations append-only and preserving the existing `artifact_migrations` table.
- Reuse current verification commands by translating invocations: `bun run check`, `bun run lint`, `bun run test -- --run`, `bun run build`.
- Keep existing Docker environment variables, volume, exposed port, and app entrypoint semantics; change package/runtime tooling and base image cleanly to Bun.
- Keep `node:crypto`/`node:path` only if verified under Bun and still the most idiomatic/simple option; do not leave accidental Node runtime dependencies.
- Avoid comments, docs, scripts, or code paths that describe Bun as a compatibility layer over the previous setup. The final project should read as Bun-first.

## Steps

- [ ] Update `package.json`: set `packageManager` to the chosen Bun version, convert script-internal `pnpm` calls to `bun run`, change `start` from `tsx src/Program.ts` to a Bun runtime invocation, add Bun-specific Effect packages, remove `tsx` plus replaced Node-specific Effect packages, and make scripts read naturally for a Bun-first project.
- [ ] Simplify `package.json` scripts/dependencies for a Bun-first app: keep `test` on Vitest; keep a `check` script with `tsc --noEmit` or project references only if typechecking remains desired; remove Babel/`build-utils`/library packaging scripts if they are not needed for runtime, Docker, or publishing; keep Oxlint as the linting quality gate.
- [ ] Run `bun install` to generate `bun.lock`; remove `pnpm-lock.yaml` and `pnpm-workspace.yaml`; ensure `.dockerignore` does not exclude `bun.lock`.
- [ ] Update `src/Program.ts` to use `@effect/platform-bun` server/runtime/services, remove `node:http`, and keep the existing layer wiring semantics.
- [ ] Update `src/repository/ArtifactDatabase.ts` to use `@effect/sql-sqlite-bun` `SqliteClient`/`SqliteMigrator`; preserve existing migrations, schema, migration table, and `DATABASE_URL=file:...` path handling.
- [ ] Audit remaining Node-specific imports and dependencies. Keep `node:crypto`/`node:path` only if intentionally compatible with Bun; remove `@types/node` only if TypeScript and tooling no longer require Node declarations, and add/configure `bun-types` only if Bun globals or `bun:` imports are used directly.
- [ ] Update `Dockerfile` to use an official Bun image, copy `package.json` and `bun.lock`, install with Bun's frozen-lockfile mode, run `bun run check`, and start with `bun run start`.
- [ ] Check `docker-compose.yml` remains valid with the Bun image, especially `/data` volume permissions and `DATABASE_URL=file:/data/agent-artifacts.db`.
- [ ] Update `flake.nix` dev shell to provide Bun and keep only still-needed native build prerequisites; remove `corepack` and Node-only prerequisites if they are no longer required.
- [ ] Rewrite `README.md` local development and Docker/development commands as Bun-first instructions, not as pnpm-to-Bun translation notes.
- [ ] Update `docs/smoke-testing.md`: use Bun commands directly, replace the `node -e` helper with `bun -e` or another Bun-native helper, and make troubleshooting describe Bun SQLite rather than migrated native modules.
- [ ] Remove migration-scar language from non-plan docs: no “formerly pnpm”, “compatibility under Bun”, “Node path”, or `tsx` cleanup notes in user-facing docs.
- [ ] Search the repository for remaining `pnpm`, `pnpm-lock`, `pnpm-workspace`, `corepack`, `tsx`, `@effect/platform-node`, and `@effect/sql-sqlite-node` references and update/remove them as appropriate.
- [ ] Run verification and fix compatibility issues, especially startup under Bun, HTTP serving behavior, SQLite migrations, and read/write persistence.

## Verification

- `bun install --frozen-lockfile`
- `bun run check` if a dedicated TypeScript typecheck script remains
- `bun run lint`
- `bun run test -- --run`
- `bun run build` only if a build/package script remains
- `AGENT_ARTIFACTS_WRITE_KEY=ap_test bun run start` starts the server without runtime errors.
- Verify startup runs SQLite migrations against a fresh database and the current existing database.
- Publish an artifact through the API and verify it persists, can be listed, and can be rendered after restart.
- Run the smoke test in `docs/smoke-testing.md` and publish/view a sample artifact.
- Build the Docker image successfully with the Bun base image.
- Run the Docker image with a mounted `/data` volume and verify `GET /api/artifacts` responds.
- Search after migration confirms no unintended `pnpm`, `pnpm-lock`, `pnpm-workspace`, `corepack`, `tsx`, `@effect/platform-node`, or `@effect/sql-sqlite-node` references remain outside this migration plan or generated artifacts.
- User-facing docs, scripts, Docker files, and source code read as Bun-first, with no transitional fallback paths or compatibility caveats.
