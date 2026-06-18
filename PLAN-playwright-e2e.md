# Plan: Add Playwright E2E Smoke Tests

## Context

The project currently relies on `docs/smoke-testing.md` for an agent-driven publish-and-view smoke test. That flow verifies behavior that unit/integration tests do not fully cover: starting the app, publishing an HTML artifact over HTTP, rendering the artifact detail page in a real browser, and validating viewport/layout behavior.

Existing validation is `bun run agent-validate`, which runs typecheck, lint, format check, and Vitest. Existing Vitest coverage includes Worker route integration in `test/http/Http.integration.test.ts` and render-string assertions in `test/render/Render.test.ts`, but neither uses a real browser layout engine.

## Approach

Add a small, focused Playwright E2E test suite that covers both HTTP API behavior and browser-rendered artifact behavior. The suite should start the local app, validate key API endpoints with Playwright's `request` fixture, publish artifacts through `POST /api/v1/artifacts`, navigate to returned artifact URLs in Chromium, and assert artifact shell layout using browser-executed DOM measurements.

Make this part of the default local validation path by adding it to `bun run agent-validate`, while keeping a standalone `bun run test:e2e` script for targeted debugging. In CI, run E2E on every pull request as a separate job so type/lint/unit failures remain easy to identify and browser setup/runtime stays isolated.

## Files to modify

- `package.json` — add Playwright dependency and scripts.
- `bun.lock` — update after adding Playwright.
- `playwright.config.ts` — new Playwright config.
- `test/e2e/api.spec.ts` — focused API endpoint coverage through Playwright's request fixture.
- `test/e2e/publish-and-source.spec.ts` — focused publish/source retrieval E2E coverage.
- `test/e2e/artifact-layout.spec.ts` — focused browser layout coverage for rendered artifact pages.
- `.github/workflows/format.yml` — add a separate Playwright E2E job that runs on every pull request.
- `docs/smoke-testing.md` — document the automated replacement and keep manual steps as fallback debugging.
- `scripts/agent-validate.sh` — add Playwright E2E as the final validation step after Vitest.
- `AGENTS.md` — update required validation notes to mention that `agent-validate` now includes E2E.

## Reuse

- `docs/smoke-testing.md` — reuse its generated HTML artifact fixture and layout assertions.
- `src/cloudflare/Worker.ts` and `alchemy.run.ts` — local app target remains the existing Worker-backed app entrypoint; the Playwright `webServer` should use the project’s local dev command with `WRITE_KEY=ap_test` so Alchemy maps it into the Worker binding.
- `test/http/Http.integration.test.ts` — reuse its publish-flow expectations and fake artifact content shape as a reference.
- `test/render/Render.test.ts` — keep render-string tests for cheap contract coverage; Playwright adds real browser layout verification.
- `.github/workflows/format.yml` — extend the existing verify workflow rather than creating a disconnected validation path.

## Steps

- [ ] Add Playwright as a dev dependency, preferably `@playwright/test`.
- [ ] Add scripts:
  - `test:e2e`: run Playwright tests in Chromium.
  - optionally `test:e2e:ui` or `test:e2e:headed` for local debugging.
- [ ] Create `playwright.config.ts` with:
  - Chromium project only for the initial suite.
  - `webServer` that starts the app with `WRITE_KEY=ap_test` and the local Alchemy dev server URL.
  - `baseURL` matching the local Alchemy dev server URL.
  - CI-friendly retries/reporting.
  - trace/screenshot/video capture only on failure.
- [ ] Create focused Playwright tests instead of one broad smoke-test clone:
  - `test/e2e/api.spec.ts`:
    - `GET /api/v1/artifacts` returns JSON with an `artifacts` array.
    - `POST /api/v1/artifacts` without `X-Write-Key` returns 401.
    - `POST /api/v1/artifacts` with an invalid key returns 403.
    - unsupported file type upload returns 415.
    - missing artifact/source routes return 404.
  - `test/e2e/publish-and-source.spec.ts`:
    - publish Markdown and assert response fields, feed inclusion, source content type/body, and rendered page response.
    - publish HTML and assert source preservation plus rendered wrapper/iframe response.
  - `test/e2e/artifact-layout.spec.ts`:
    - publish the HTML layout fixture derived from `docs/smoke-testing.md` using `request.post('/api/v1/artifacts')` with `X-Write-Key: ap_test` and multipart form data.
    - normalize the returned `artifactUrl` to an absolute URL.
    - open the artifact page with `page.goto()`.
    - assert visible shell content: `← Recent artifacts`, artifact title, `Source`, and the iframe.
    - run browser-side layout assertions equivalent to the existing `agent-browser eval` checks.
- [ ] Keep the assertions deterministic:
  - Avoid screenshot assertions at first.
  - Prefer DOM/layout numeric checks from the smoke-test doc.
  - Save trace/screenshot only on failure through Playwright config.
- [ ] Add `bun run test:e2e` as the final step in `scripts/agent-validate.sh`, after `bun run test --run`.
- [ ] Update `.github/workflows/format.yml` to run E2E on every PR as a separate job:
  - Checkout repo.
  - Setup Bun.
  - Install dependencies with `bun install --frozen-lockfile`.
  - Install Chromium browser dependencies as required by Playwright.
  - Run `bun run test:e2e`.
- [ ] Update docs to say the automated Playwright test is the default smoke check and manual `agent-browser` steps are fallback diagnostics.

## Verification

- Run `bun run check`.
- Run `bun run lint`.
- Run `bun run format:check`.
- Run `bun run test --run`.
- Run `bun run test:e2e` locally and confirm it:
  - Starts the app automatically using `WRITE_KEY=ap_test`.
  - Validates API endpoint success and error behavior through Playwright `request`.
  - Publishes Markdown and HTML artifacts.
  - Fetches source and rendered artifact routes.
  - Opens the layout artifact page in Chromium.
  - Passes layout assertions.
- Run `bun run agent-validate` and confirm the new final E2E step passes.
- In CI, verify the separate Playwright E2E job installs Chromium successfully and passes on Ubuntu for pull requests.
