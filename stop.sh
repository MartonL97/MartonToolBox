#!/usr/bin/env bash
# Stops a running MartonToolBox (backend :8080 and frontend :4200), however it was started.
# Only processes that belong to this project folder are stopped.
# Usage: ./stop.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$ROOT/.logs/start.pid"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

# Is this pid part of this project? (its command or working directory is inside ROOT)
belongs_here() {
  local pid=$1 cmd cwd
  cmd=$(ps -o command= -p "$pid" 2>/dev/null) || return 1
  [[ "$cmd" == *"$ROOT"* ]] && return 0
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
  [[ "$cwd" == "$ROOT"* ]]
}

# PIDs listening on the app ports that belong to this project.
app_pids() {
  local pid
  for pid in $(lsof -tiTCP:8080 -sTCP:LISTEN 2>/dev/null; lsof -tiTCP:4200 -sTCP:LISTEN 2>/dev/null); do
    belongs_here "$pid" && echo "$pid"
  done | sort -u
}

stopped_something=false

# 1. A ./start.sh run: stopping it lets it shut both servers down cleanly.
if [[ -f "$PIDFILE" ]]; then
  pid=$(cat "$PIDFILE")
  if kill -0 "$pid" 2>/dev/null && [[ "$(ps -o command= -p "$pid")" == *start.sh* ]]; then
    echo "• Stopping ./start.sh (pid $pid)…"
    kill -TERM "$pid" 2>/dev/null
    stopped_something=true
  fi
  rm -f "$PIDFILE"
fi

# 2. Anything of ours still holding the ports (e.g. started by hand or a crashed run).
for _ in $(seq 1 15); do [[ -z "$(app_pids)" ]] && break; sleep 1; done
pids=$(app_pids)
if [[ -n "$pids" ]]; then
  echo "• Stopping leftover app processes: $(echo $pids)"
  for pid in $pids; do pkill -TERM -P "$pid" 2>/dev/null; kill -TERM "$pid" 2>/dev/null; done
  stopped_something=true
  for _ in $(seq 1 10); do [[ -z "$(app_pids)" ]] && break; sleep 1; done
  for pid in $(app_pids); do kill -KILL "$pid" 2>/dev/null; done
fi

# 3. Report anything else on the ports — not ours, so we leave it alone.
others=$(lsof -iTCP:8080 -iTCP:4200 -sTCP:LISTEN -n -P 2>/dev/null | awk 'NR>1 {print "    " $1 " (pid " $2 ") on " $9}' | sort -u)
if [[ -n "$others" ]]; then
  yellow "! These programs are using port 8080/4200 but aren't part of this project, so they were left running:"
  echo "$others"
  exit 1
fi

$stopped_something && green "MartonToolBox stopped." || green "MartonToolBox wasn't running."
