# Bun Migration Plan

## Context

The project currently uses pnpm via Corepack as its package manager and script runner. Evidence found so far:

- `package.json` declares `"packageManager": "pnpm@10.14.0"` and scripts call `pnpm` internally for chained scripts (`build`, `lint-fix`).
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` are present; workspace only includes the root package.
- `README.md`, `docs/smoke-testing.md`, `Dockerfile`, and existing plans reference `pnpm` commands.
- `Dockerfile` starts from `node:24-slim`, enables Corepack, installs with `pnpm install --frozen-lockfile`, runs `pnpm check`, and starts with `pnpm start`.
- Nix dev shell currently provides `corepack`, `nodejs_22`, and `python3` for `node-gyp`.

Goal: fully migrate local development, container build/runtime, docs, lockfile/package-manager metadata, and the server start command to Bun.

User-selected scope:

- Use Bun as package manager, script runner, and JavaScript runtime for the server.
- Switch Docker to an official Bun base image.
- Remove pnpm-specific artifacts after generating `bun.lock`.

## Approach

Recommended approach: perform a full Bun migration with explicit compatibility checkpoints around the Node-oriented runtime pieces. The app currently starts through `tsx src/Program.ts`, uses `@effect/platform-node`/`NodeRuntime`, `node:http`, and `@effect/sql-sqlite-node` with native SQLite dependencies. Bun supports many Node APIs, but this codepath must be verified directly before removing the Node/pnpm path.

Change `start` to run the TypeScript entrypoint with Bun (for example `bun run src/Program.ts`, or `bun src/Program.ts` if preferred), keep the existing Effect Node platform modules unless verification proves they need replacement, and update Docker to run the same Bun start command in production.

## Files to modify

Initial expected files:

- `package.json`
- `bun.lock` / remove `pnpm-lock.yaml`
- remove `pnpm-workspace.yaml` because the current workspace only includes `.`; add `workspaces` to `package.json` only if Bun requires it later
- `README.md`
- `docs/smoke-testing.md`
- `Dockerfile`
- `flake.nix`
- Possibly `.github/workflows/docker.yml` only if Docker build args/cache setup changes

## Reuse

- Keep existing build/test tools: `tsc`, `babel`, `eslint`, `vitest`, `build-utils`.
- Reuse the current application edge in `src/Program.ts`: `NodeHttpServer`, `NodeRuntime`, `NodeServices`, and `node:http` should stay initially and be compatibility-tested under Bun.
- Reuse existing SQLite setup in `src/repository/ArtifactDatabase.ts` and verify `@effect/sql-sqlite-node`/native SQLite behavior under Bun before changing repository code.
- Reuse current verification commands by translating invocations: `bun run check`, `bun run lint`, `bun run test -- --run`, `bun run build`.
- Keep existing Docker environment variables, volume, exposed port, and app entrypoint semantics; only change package/runtime tooling and base image.

## Steps

- [ ] Update `package.json`: set `packageManager` to the chosen Bun version, convert script-internal `pnpm` calls (`build`, `lint-fix`) to `bun run`, and change `start` from `tsx src/Program.ts` to a Bun runtime invocation.
- [ ] Decide whether `tsx` is still needed after `start` uses Bun; remove it only if no build/test tooling still depends on it.
- [ ] Run `bun install` to generate `bun.lock`; remove `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
- [ ] Update `Dockerfile` to use an official Bun image, copy `package.json` and `bun.lock`, install with Bun's frozen-lockfile mode, run `bun run check`, and start with `bun run start`.
- [ ] Update `flake.nix` dev shell to provide Bun and keep native build prerequisites such as `python3`; remove `corepack` if it is no longer needed.
- [ ] Update `README.md` local development and Docker/development commands from pnpm to Bun.
- [ ] Update `docs/smoke-testing.md`: replace pnpm start/rebuild commands, replace the `node -e` helper with `bun -e` or another Bun-compatible helper, and adjust native module troubleshooting for Bun.
- [ ] Search the repository for remaining `pnpm`, `pnpm-lock`, `pnpm-workspace`, `corepack`, and `tsx` references and update/remove them as appropriate.
- [ ] Run verification and fix compatibility issues, especially startup under Bun and native SQLite install/runtime behavior.

## Verification

- `bun install --frozen-lockfile`
- `bun run check`
- `bun run lint`
- `bun run test -- --run`
- `bun run build`
- `AGENT_ARTIFACTS_WRITE_KEY=ap_test bun run start` starts the server without runtime errors.
- Run the smoke test in `docs/smoke-testing.md` and publish/view a sample artifact.
- Build the Docker image successfully with the Bun base image.
- Run the Docker image and verify `GET /api/artifacts` responds.
