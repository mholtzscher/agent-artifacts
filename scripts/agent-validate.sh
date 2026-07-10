#!/usr/bin/env bash
# Runs the same checks as CI in order. On success, prints a one-line marker
# per step. On failure, prints the marker and the full output of the failing
# step, then exits non-zero. Designed to be token-efficient for agent use.
set -u

cd "$(dirname "$0")/.." || exit 1

run_step() {
  local name="$1"; shift
  local log code=0
  log=$("$@" 2>&1) || code=$?
  if [ "$code" -eq 0 ]; then
    printf '✓ %s\n' "$name"
    return 0
  fi
  printf '✗ %s (exit %d)\n' "$name" "$code"
  printf '%s\n' "$log"
  return "$code"
}

run_step format bash -c 'files=$(find . -type f -name "*.go" -print0 | xargs -0 gofmt -l); if [ -n "$files" ]; then printf "%s\n" "$files"; exit 1; fi' || exit 1
run_step generate bash -c 'go tool sqlc generate && git diff --exit-code -- internal/postgres' || exit 1
run_step test go test ./... || exit 1
run_step vet go vet ./... || exit 1
run_step docker docker build -q . || exit 1
