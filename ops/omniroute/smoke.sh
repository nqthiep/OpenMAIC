#!/usr/bin/env bash
# Smoke tests for the OmniRoute gate (setup: ops/omniroute/README.md).
#
# Usage:
#   ops/omniroute/smoke.sh <public-url> [--internal]
#
# <public-url> is any URL that reaches omniroute-gate: the Cloudflare Tunnel
# hostname in production, or http://omniroute.localhost:8081 in local dev.
#
# Gate tests (always run, no cookie and no secret needed): every request except
# /__enter must be rejected by the app's /api/admin/omniroute/check behind
# Caddy forward_auth with 401 or 403 — never 200. The garbage-cookie test also
# checks that the gate forwards the browser's Cookie header to the check route;
# whether forward_auth really does that is exactly what this test is for (see
# README, "Not verified yet"). /__enter without a valid one-time ticket must be
# a 4xx — never 200 and never a redirect.
#
# --internal adds two tests inside the Docker network (they need the running
# `docker compose --profile omniroute` stack; without the flag, or without
# docker compose, they print SKIP): the app container must reach OmniRoute's
# API port (omniroute:20129), and the omniroute container must NOT reach
# Postgres (postgres:5432).
#
# Prints PASS/FAIL/SKIP per test and exits 1 when any test FAILs. It never
# prints response bodies or header values — only HTTP statuses and the first
# line of a transport error.

set -u

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: $0 <public-url> [--internal]" >&2
  exit 2
fi
case "$1" in
  http://*|https://*) base="${1%/}" ;;
  *)
    echo "error: <public-url> must start with http:// or https://" >&2
    exit 2
    ;;
esac
internal=0
if [ "$#" -eq 2 ]; then
  if [ "$2" != "--internal" ]; then
    echo "usage: $0 <public-url> [--internal]" >&2
    exit 2
  fi
  internal=1
fi
command -v curl >/dev/null 2>&1 || {
  echo 'error: curl is required' >&2
  exit 2
}

pass=0
fail=0

# request <label> <gate|enter> <curl args...>
# One request through the gate; judges only the HTTP status.
request() {
  local label="$1" mode="$2"; shift 2
  local raw status detail expect ok=0
  raw="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$@" 2>&1 || true)"
  status="$(printf '%s\n' "$raw" | tail -n 1)"
  detail="$(printf '%s\n' "$raw" | grep -vE '^[0-9]{3}$' | head -n 1 || true)"
  if [ "$mode" = "gate" ]; then
    expect='HTTP 401 or 403 (rejected by the app check)'
    case "$status" in 401 | 403) ok=1 ;; esac
  else
    expect='a 4xx status (never 200 or a redirect)'
    case "$status" in 4??) ok=1 ;; esac
  fi
  if [ "$ok" -eq 1 ]; then
    printf 'PASS %s — HTTP %s\n' "$label" "$status"
    pass=$((pass + 1))
  else
    printf 'FAIL %s — expected %s, got %s%s\n' "$label" "$expect" "${status:-no response}" "${detail:+ ($detail)}"
    fail=$((fail + 1))
  fi
}

echo "# gate: $base"
request 'GET / (anonymous)' gate "$base/"
request 'GET /api/settings (anonymous)' gate "$base/api/settings"
request 'GET /v1/models (anonymous)' gate "$base/v1/models"
request 'POST /v1/chat/completions (anonymous, empty JSON body)' gate \
  -H 'Content-Type: application/json' -d '{}' "$base/v1/chat/completions"
request 'GET / with Cookie: omniroute_gate=garbage' gate \
  -H 'Cookie: omniroute_gate=garbage' "$base/"
request 'GET /__enter (no ticket)' enter "$base/__enter"
request 'GET /__enter?t=garbage' enter "$base/__enter?t=garbage"

# docker compose commands run from the directory that holds docker-compose.yml
# (two levels up from this script) so the script works from any CWD.
compose_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

have_compose=0
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  have_compose=1
fi

echo
echo '# internal (Docker network; needs --internal and a running stack)'
if [ "$internal" -ne 1 ]; then
  echo 'SKIP both — pass --internal to run them'
elif [ "$have_compose" -ne 1 ]; then
  echo 'SKIP both — docker compose is not available'
else
  # 1. From the app container, OmniRoute's API-only bridge port must answer.
  #    REQUIRE_API_KEY=true answers 401 without a key; 200 means it answered
  #    too. Either proves the port is reachable. busybox wget (the app image is
  #    alpine) supports -S and --timeout.
  raw="$(cd "$compose_dir" && docker compose exec -T openmaic \
    wget -S -q -O /dev/null --timeout=5 http://omniroute:20129/v1/models 2>&1 || true)"
  status="$(printf '%s\n' "$raw" | grep -oE 'HTTP/[0-9.]+ [0-9]{3}' | tail -n 1 | grep -oE '[0-9]{3}$' || true)"
  if [ "$status" = "200" ] || [ "$status" = "401" ]; then
    printf 'PASS app container -> http://omniroute:20129/v1/models — HTTP %s\n' "$status"
    pass=$((pass + 1))
  elif [ -n "$status" ]; then
    printf 'FAIL app container -> http://omniroute:20129/v1/models — expected HTTP 200 or 401, got %s\n' "$status"
    fail=$((fail + 1))
  else
    # No HTTP answer at all: wget missing, stack not running, daemon down…
    # Not a verdict about the boundary — say so and move on.
    reason="$(printf '%s\n' "$raw" | head -n 1)"
    printf 'SKIP app container -> omniroute:20129 — no HTTP answer (%s)\n' "${reason:-no output}"
  fi

  # 2. From the omniroute container, a TCP connect to Postgres must fail:
  #    postgres lives on the `default` network, omniroute is not on it, so the
  #    host name must not even resolve. node is the image's own runtime, so it
  #    is the probe; if it is missing the test is SKIPped, not guessed with
  #    another tool.
  probe='const net=require("net");const s=net.connect({host:"postgres",port:5432});'
  probe="$probe"'s.setTimeout(3000,function(){console.log("UNREACHABLE timeout");process.exit(0)});'
  probe="$probe"'s.on("error",function(e){console.log("UNREACHABLE "+e.code);process.exit(0)});'
  probe="$probe"'s.on("connect",function(){console.log("CONNECTED");process.exit(1)});'
  raw="$(cd "$compose_dir" && docker compose exec -T omniroute node -e "$probe" 2>&1 || true)"
  case "$raw" in
    *CONNECTED*)
      echo 'FAIL omniroute -> postgres:5432 — the connection SUCCEEDED; check the network boundary'
      fail=$((fail + 1))
      ;;
    *UNREACHABLE*)
      reason="$(printf '%s\n' "$raw" | tail -n 1)"
      printf 'PASS omniroute -> postgres:5432 unreachable (%s)\n' "${reason:-no detail}"
      pass=$((pass + 1))
      ;;
    *)
      reason="$(printf '%s\n' "$raw" | head -n 1)"
      printf 'SKIP omniroute -> postgres:5432 — probe did not run (%s)\n' "${reason:-no output}"
      ;;
  esac
fi

echo
printf '%d passed, %d failed\n' "$pass" "$fail"
if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
