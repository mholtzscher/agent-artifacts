---
name: upload-artifact
description: Publish Markdown or HTML artifacts to the Agent Artifacts service. Use this whenever the user asks to upload, publish, share, host, or create a public URL for an agent-generated artifact/document/page/report, especially .md or .html files. This skill explains the required API call, metadata, authorization, verification, and safety checks.
---

# Upload Artifact

Use this skill to publish an agent-generated Markdown or HTML artifact to Agent Artifacts and return the public rendered URL.

## Before publishing

1. Confirm the source file exists and is the intended artifact.
2. Treat published artifacts as public unless the user explicitly says otherwise and the service supports another visibility.
3. Do not publish secrets, write keys, private repository remotes, credentials, or sensitive personal data.
4. Supported source files are Markdown and HTML. If the source type is unclear, ask before publishing.
5. If no base URL or write key is available, ask the user for it. Do not invent either value.

## Required configuration

Use these environment variables when available:

- `AGENT_ARTIFACTS_WRITE_KEY` — shared write key for publishing.
- `AGENT_ARTIFACTS_BASE_URL` — service origin, for example `https://artifacts.example.com`.

If `AGENT_ARTIFACTS_BASE_URL` is not set but `PUBLIC_BASE_URL` is set in the current project, use `PUBLIC_BASE_URL` as the service origin.

## Publish API

Send a multipart form request:

```http
POST <base-url>/api/v1/artifacts
X-Write-Key: <write-key>
```

Required form field:

- `file` — the Markdown or HTML source file.

Optional form fields supported by the current service:

- `title` — human-readable artifact title.
- `description` — short explanation for lists/link previews.
- `project` — project name.
- `repo` — repository full name only, not a remote URL.
- `branch` — git branch.
- `commit_sha` — commit SHA.
- `dirty` — `true` when the working tree had uncommitted changes.
- `agent` — agent name.
- `generator` — tool or command that generated the artifact.

## Recommended shell workflow

Prefer `curl` because it handles multipart uploads reliably:

```sh
BASE_URL="${AGENT_ARTIFACTS_BASE_URL:-${PUBLIC_BASE_URL:-}}"
WRITE_KEY="${AGENT_ARTIFACTS_WRITE_KEY:-}"
FILE="path/to/artifact.md"
TITLE="Artifact Title"

if [ -z "$BASE_URL" ] || [ -z "$WRITE_KEY" ]; then
  echo "Missing AGENT_ARTIFACTS_BASE_URL/PUBLIC_BASE_URL or AGENT_ARTIFACTS_WRITE_KEY" >&2
  exit 1
fi

curl -fsS -X POST "$BASE_URL/api/v1/artifacts" \
  -H "X-Write-Key: $WRITE_KEY" \
  -F "file=@${FILE}" \
  -F "title=${TITLE}" \
  -F "agent=${AGENT_NAME:-pi}" \
  -F "generator=${GENERATOR:-agent}"
```

Add optional fields only when they are known and safe to publish. For example:

```sh
-F "description=Implementation plan for the artifact service" \
-F "project=agent-artifacts" \
-F "branch=$(git branch --show-current 2>/dev/null || true)" \
-F "commit_sha=$(git rev-parse HEAD 2>/dev/null || true)" \
-F "dirty=$([ -n "$(git status --porcelain 2>/dev/null)" ] && echo true || echo false)"
```

## Handling the response

A successful publish returns HTTP `201` with JSON like:

```json
{
  "id": "...",
  "slug": "artifact-title-abc123",
  "title": "Artifact Title",
  "sourceType": "markdown",
  "artifactUrl": "https://artifacts.example.com/a/artifact-title-abc123",
  "sourceUrl": "https://artifacts.example.com/source/artifact-title-abc123",
  "createdAt": "2026-06-02T12:00:00.000Z"
}
```

Return `artifactUrl` to the user first. Include `sourceUrl` if useful.

## Verification

After publishing, verify the returned `artifactUrl` is reachable:

```sh
curl -fsSI "$ARTIFACT_URL" >/dev/null
```

If `HEAD` is not supported, use:

```sh
curl -fsSL "$ARTIFACT_URL" >/dev/null
```

Report failures loudly. Do not say the artifact was published if the API request failed or the response did not include `artifactUrl`.

## Error handling

- `401 Missing write key`: ask for or configure `AGENT_ARTIFACTS_WRITE_KEY`.
- `403 Invalid write key`: tell the user the configured write key was rejected; do not print the key.
- `400 Missing file`: check the file path and multipart field name.
- Source type errors: confirm the file is Markdown or HTML and has an appropriate extension/content type.

## Final response format

Use a concise final response:

```text
Published artifact: <artifactUrl>
Source: <sourceUrl>
Title: <title>
```

If publishing was skipped or failed, explain exactly what is missing or what failed.
