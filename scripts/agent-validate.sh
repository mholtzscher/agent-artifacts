#!/usr/bin/env bash
# Runs the same checks as CI in order. On success, prints a one-line marker
# per step. On failure, prints the marker and the full output of the failing
# step, then exits non-zero. Designed to be token-efficient for agent use
# while still giving agents enough information to diagnose failures.
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

run_step check vp check || exit 1
run_step test  vp test --run || exit 1
run_step e2e   vp run test:e2e || exit 1
