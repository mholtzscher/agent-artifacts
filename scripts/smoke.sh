#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-agent_artifacts_smoke}"
export AGENT_ARTIFACTS_WRITE_KEY="${AGENT_ARTIFACTS_WRITE_KEY:-ap_smoke_test}"
export APP_PORT="${APP_PORT:-18080}"

fixture=$(mktemp)
cleanup() {
  rm -f "$fixture"
  docker compose -f deployments/compose.yaml down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f deployments/compose.yaml up -d --build
for attempt in $(seq 1 60); do
  status=$(docker compose -f deployments/compose.yaml ps --format json | jq -rs '[.[] | select(.Service == "app")][0].Health // ""')
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  if [[ "$attempt" == "60" ]]; then
    docker compose -f deployments/compose.yaml ps
    docker compose -f deployments/compose.yaml logs app
    exit 1
  fi
  sleep 1
done

printf '# Docker smoke\n\nPersistent source.' >"$fixture"
published=$(curl -fsS -X POST "http://127.0.0.1:${APP_PORT}/api/v1/artifacts" \
  -H "X-Write-Key: ${AGENT_ARTIFACTS_WRITE_KEY}" \
  -F "file=@${fixture};filename=smoke.md;type=text/markdown" \
  -F "title=Docker Smoke")
slug=$(printf '%s' "$published" | jq -r .slug)
test -n "$slug"
test "$(curl -fsS "http://127.0.0.1:${APP_PORT}/source/${slug}")" = "$(cat "$fixture")"

docker compose -f deployments/compose.yaml restart app >/dev/null
for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/readyz" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    docker compose -f deployments/compose.yaml logs app
    exit 1
  fi
  sleep 1
done

test "$(curl -fsS "http://127.0.0.1:${APP_PORT}/source/${slug}")" = "$(cat "$fixture")"
printf 'Compose smoke passed: %s\n' "$slug"
