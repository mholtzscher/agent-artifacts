# Smoke Testing

This project uses automated Playwright E2E tests as its primary smoke check.
The goal is to verify that the app can start, API endpoints behave correctly, a
published artifact can be served, the artifact detail page renders in a real
browser, and the rendered view stays in the intended app-shell layout.

Run the default automated smoke check with:

```sh
bun run test:e2e
```

`bun run agent-validate` also runs this E2E suite as its final step. The manual
`agent-browser` flow below is fallback diagnostics for investigating failures or
collecting extra visual evidence.

## Success criteria

A smoke test passes when:

- The app starts locally without runtime errors.
- A test HTML artifact can be published through `POST /api/v1/artifacts`.
- The returned artifact URL loads in a browser.
- The artifact detail page has a compact top banner with:
  - Back link to recent artifacts
  - Artifact title
  - Source link
- The rendered artifact fills the remaining viewport width and height.
- The outer page does not have a vertical scrollbar; scrolling is contained in
  the rendered content when needed.
- Playwright browser assertions pass for the artifact page.

## Prerequisites

- Run commands from the repository root.
- Use write key `ap_test` for local smoke testing.
- Prefer `bun run test:e2e` for automated smoke verification.
- Use the Zellij/`agent-browser` steps below only as fallback diagnostics.
- Make sure dependencies are installed with Bun before starting the app:

```sh
bun install
```

## Automated smoke check

```sh
bun run test:e2e
```

The Playwright suite starts the local app, validates API success/error behavior,
publishes Markdown and HTML artifacts, fetches source/rendered routes, opens an
HTML artifact page in Chromium, and checks the app-shell layout. It uses
`WRITE_KEY=ap_test` for the local server.

## Manual fallback: Start the app in Zellij

Close any stale smoke-test pane first:

```sh
APP_PANES=$(zellij action list-panes -j -c -s -t | jq -r '.[] | select(.title=="artifact-app") | .id')
for id in $APP_PANES; do zellij action close-pane -p terminal_$id 2>/dev/null || true; done
```

Start the app with `alchemy dev` via `bun run dev:cloudflare` (there is no `bun run start` script). Alchemy loads `.env` automatically, so do not pass the write key inline:

```sh
zellij run --name artifact-app --cwd "$PWD" -- sh -lc \
  'WRITE_KEY=ap_test PUBLIC_BASE_URL=http://localhost:1339 bun run dev:cloudflare'
```

Alchemy prints the local Worker URL dynamically — it is not fixed to port 3000. Wait for the worker to report `updated`, then capture the URL from the pane output into `BASE_URL`:

```sh
APP_PANE=$(zellij action list-panes -j -c -s -t | jq -r '.[] | select(.title=="artifact-app") | .id' | tail -1)
BASE_URL=$(zellij action dump-screen -p terminal_$APP_PANE --full \
  | grep -oE 'url: "https?://[^"]+"' | head -1 | sed -E 's/url: "(.*)"/\1/')
BASE_URL=${BASE_URL%/}
echo "$BASE_URL"
```

If `BASE_URL` is empty, the worker has not finished starting — re-dump the pane and retry once `worker (Cloudflare.Worker) updated` appears.

Wait until the server is responding instead of doing a single immediate `curl`:

```sh
for i in $(seq 1 30); do
  if curl -sS http://localhost:1339/api/v1/artifacts >/tmp/artifacts-list.json 2>/tmp/artifact-smoke-curl.err; then
    cat /tmp/artifacts-list.json
    break
  fi
  sleep 0.5
done
```

Expected: JSON response with an `artifacts` array.

If the app does not start, inspect the pane before retrying:

```sh
APP_PANE=$(zellij action list-panes -j -c -s -t | jq -r '.[] | select(.title=="artifact-app") | .id' | tail -1)
zellij action dump-screen -p terminal_$APP_PANE --full
```

D1 and R2 are provisioned by alchemy's `Cloudflare.D1Database` and `Cloudflare.R2Bucket` resources (local Miniflare-backed bindings); there is no `DATABASE_URL` to configure. If provisioning fails, look for alchemy errors in the pane output rather than a SQLite file path.

## Manual fallback: Generate a test HTML artifact

```sh
cat > /tmp/artifact-smoke.html <<'EOF'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Smoke Test Artifact</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .hero { min-height: 100vh; display: grid; place-items: center; padding: 48px; background: linear-gradient(135deg, #f0f9ff, #eef2ff); }
    .panel { max-width: 960px; border: 1px solid #dbeafe; border-radius: 28px; padding: 48px; background: rgba(255,255,255,.86); box-shadow: 0 24px 80px rgba(30, 41, 59, .12); }
    h1 { margin: 0 0 16px; font-size: clamp(2.5rem, 8vw, 6rem); line-height: .95; }
    p { font-size: 1.25rem; line-height: 1.7; color: #475569; }
    .stripe { height: 70vh; display: grid; place-items: center; font-size: 3rem; font-weight: 800; }
    .stripe:nth-of-type(2) { background: #ecfeff; }
    .stripe:nth-of-type(3) { background: #fef3c7; }
  </style>
</head>
<body>
  <section class="hero">
    <div class="panel">
      <h1>Full-viewport artifact preview</h1>
      <p>This generated HTML artifact is intentionally wide and tall so the detail page layout can be verified quickly.</p>
    </div>
  </section>
  <section class="stripe">Scroll happens inside the artifact</section>
  <section class="stripe">No centered card wrapper</section>
</body>
</html>
EOF
```

## Manual fallback: Publish the artifact

Source `.env` so the publish request uses the same `WRITE_KEY` alchemy loaded into the Worker:

```sh
curl -sS -X POST http://localhost:1339/api/v1/artifacts \
  -H 'X-Write-Key: ap_test' \
  -F 'file=@/tmp/artifact-smoke.html;type=text/html' \
  -F 'title=Smoke Test Artifact' \
  -F 'description=Generated smoke test artifact.' \
  | tee /tmp/artifact-smoke-response.json
```

Extract the URL. Normalize relative URLs (the local Worker returns `/a/...`
when `PUBLIC_BASE_URL` is unset) against `$BASE_URL`:

```sh
ARTIFACT_URL=$(bun -e 'const r = await import("/tmp/artifact-smoke-response.json", { with: { type: "json" } }); const url = r.default.artifactUrl; console.log(url.startsWith("http") ? url : `http://localhost:1339${url}`)')
echo "$ARTIFACT_URL"
```

## Manual fallback: Verify with agent-browser

```sh
agent-browser open "$ARTIFACT_URL"
agent-browser snapshot -i -u
```

Expected snapshot includes:

- `← Recent artifacts`
- `Smoke Test Artifact`
- `Source`
- An iframe containing the rendered artifact heading

Run layout checks:

```sh
cat <<'EOF' | agent-browser eval --stdin
(() => {
  const banner = document.querySelector('.artifact-banner');
  const preview = document.querySelector('.artifact-preview');
  const frame = document.querySelector('iframe.source-frame');
  const body = document.body;
  const html = document.documentElement;
  return {
    bannerHeight: banner.getBoundingClientRect().height,
    previewWidth: preview.getBoundingClientRect().width,
    previewHeight: preview.getBoundingClientRect().height,
    frameWidth: frame.getBoundingClientRect().width,
    frameHeight: frame.getBoundingClientRect().height,
    bodyOverflow: getComputedStyle(body).overflow,
    pageHasVerticalScrollbar: html.scrollHeight > html.clientHeight,
    previewFillsRemainingHeight: Math.abs(preview.getBoundingClientRect().height - (innerHeight - banner.getBoundingClientRect().height)) <= 1,
    frameFillsPreview: Math.abs(frame.getBoundingClientRect().height - preview.getBoundingClientRect().height) <= 1 && Math.abs(frame.getBoundingClientRect().width - preview.getBoundingClientRect().width) <= 1,
    bannerItems: Array.from(banner.children).map((el) => el.textContent.trim())
  };
})()
EOF
```

Expected key values:

- `bannerHeight` is between `40` and `56`.
- `bodyOverflow` is `hidden`.
- `pageHasVerticalScrollbar` is `false`.
- `previewFillsRemainingHeight` is `true`.
- `frameFillsPreview` is `true`.

Optional screenshot:

```sh
agent-browser screenshot /tmp/artifact-smoke.png
```

This is useful to keep as a quick visual artifact when reporting the smoke-test
result.

## Manual fallback: Record evidence

Keep the agent-browser snapshot, layout assertion output, and optional
screenshot as evidence for the run:

```sh
agent-browser snapshot -i -u > /tmp/artifact-smoke-snapshot.txt
agent-browser screenshot /tmp/artifact-smoke.png
```

The smoke test should be fully agent-driven. Do not require manual desktop
browser inspection for pass/fail.

## Manual fallback: Shut down

```sh
APP_PANES=$(zellij action list-panes -j -c -s -t | jq -r '.[] | select(.title=="artifact-app" and .exited==false) | .id')
for id in $APP_PANES; do zellij action send-keys "Ctrl c" -p terminal_$id; done
sleep 1
for id in $APP_PANES; do zellij action close-pane -p terminal_$id; done
agent-browser close --all
```
