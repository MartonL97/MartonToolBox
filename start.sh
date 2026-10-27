#!/usr/bin/env bash
# Starts MartonToolBox locally: backend API on :8080 and the Angular frontend on :4200.
# Usage: ./start.sh            (Ctrl+C stops both)
#        ./start.sh --no-open  (don't open the browser)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$ROOT/frontend/marton-toolbox"
LOGS="$ROOT/.logs"
API_URL="http://localhost:8080"
APP_URL="http://localhost:4200"
OPEN_BROWSER=true
[[ "${1:-}" == "--no-open" ]] && OPEN_BROWSER=false

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

# ---------- Checks ----------
command -v dotnet >/dev/null || { red "✗ .NET SDK not found. Install it from https://dotnet.microsoft.com/download"; exit 1; }
command -v npm >/dev/null || { red "✗ Node.js/npm not found. Install it from https://nodejs.org"; exit 1; }

# A previous run (from another terminal, or one left running) is stopped automatically;
# stop.sh only touches this project's processes and fails if something else holds the ports.
if lsof -iTCP:8080 -iTCP:4200 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  yellow "• MartonToolBox seems to be running already — restarting it."
  "$ROOT/stop.sh" || { red "✗ Ports 8080/4200 are used by another program (listed above). Close it and try again."; exit 1; }
fi

if ! (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  red "✗ PostgreSQL isn't reachable on localhost:5432."
  echo "  Start it (e.g. from the PostgreSQL app / pgAdmin, or 'brew services start postgresql') and try again."
  exit 1
fi

[[ -e /Applications/LibreOffice.app ]] || command -v soffice >/dev/null || \
  yellow "! LibreOffice not found — the Document Converter won't work (brew install --cask libreoffice)."

if [[ ! -d "$FRONTEND/node_modules" ]]; then
  yellow "• Installing frontend packages (first run only)…"
  (cd "$FRONTEND" && npm install --no-audit --no-fund)
fi

# ---------- Start ----------
mkdir -p "$LOGS"
echo $$ > "$LOGS/start.pid"   # lets ./stop.sh (from any terminal) stop this run
PIDS=()
cleanup() {
  echo
  yellow "Stopping…"
  for pid in "${PIDS[@]}"; do pkill -TERM -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  [[ "$(cat "$LOGS/start.pid" 2>/dev/null)" == "$$" ]] && rm -f "$LOGS/start.pid"
  green "Stopped."
}
trap cleanup EXIT INT TERM

echo "• Starting backend…  (log: .logs/backend.log)"
(cd "$ROOT" && ASPNETCORE_URLS="$API_URL" exec dotnet run --project backend/MartonToolBox.Api) >"$LOGS/backend.log" 2>&1 &
PIDS+=($!)

echo "• Starting frontend… (log: .logs/frontend.log)"
(cd "$FRONTEND" && exec npm start) >"$LOGS/frontend.log" 2>&1 &
PIDS+=($!)

wait_for() { # name, url, logfile
  for _ in $(seq 1 120); do
    curl -s -o /dev/null "$2" && { green "✓ $1 is up ($2)"; return 0; }
    if ! kill -0 "${PIDS[$3]}" 2>/dev/null; then
      red "✗ $1 stopped while starting. Last lines of its log:"
      tail -n 25 "$LOGS/$4"
      exit 1
    fi
    sleep 1
  done
  red "✗ $1 didn't start within 2 minutes. See .logs/$4"; exit 1
}
wait_for "Backend" "$API_URL/api/tools" 0 backend.log
wait_for "Frontend" "$APP_URL" 1 frontend.log

echo
green "MartonToolBox is running → $APP_URL"
echo "Press Ctrl+C to stop (or run ./stop.sh from another terminal)."
$OPEN_BROWSER && open "$APP_URL" 2>/dev/null || true

# Exit (and clean up) as soon as either process dies.
while kill -0 "${PIDS[0]}" 2>/dev/null && kill -0 "${PIDS[1]}" 2>/dev/null; do sleep 2; done
red "One of the servers stopped unexpectedly — check .logs/"
exit 1
