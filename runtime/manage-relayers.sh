#!/usr/bin/env bash

RUNTIME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$RUNTIME_DIR/runtime-state"

mkdir -p "$STATE_DIR"

route_suffix() {
  local route="$1"
  [[ "$route" =~ ^iln-[a-z0-9-]+-to-[a-z0-9-]+$ ]] || return 1
  printf "%s\n" "${route#iln-}"
}

env_file() {
  local suffix
  suffix="$(route_suffix "$1")" || return 1
  printf "%s/.env.relayer.iln.%s\n" "$RUNTIME_DIR" "$suffix"
}

script_file() {
  route_suffix "$1" >/dev/null || return 1
  printf "%s/native-relayer/iln.mjs\n" "$RUNTIME_DIR"
}

pid_file() {
  route_suffix "$1" >/dev/null || return 1
  printf "%s/native-%s.pid\n" "$STATE_DIR" "$1"
}

log_file() {
  route_suffix "$1" >/dev/null || return 1
  printf "%s/native-%s.log\n" "$STATE_DIR" "$1"
}

configured_routes() {
  local file suffix
  for file in "$RUNTIME_DIR"/.env.relayer.iln.*; do
    [[ -f "$file" && "$file" != *.example ]] || continue
    suffix="${file##*/}"
    suffix="${suffix#.env.relayer.iln.}"
    route_suffix "iln-$suffix" >/dev/null || continue
    printf "iln-%s\n" "$suffix"
  done
}

is_running() {
  local route="$1"
  local pf pid
  pf="$(pid_file "$route")" || return 1
  [ -f "$pf" ] || return 1
  pid="$(cat "$pf" 2>/dev/null)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

start_one() {
  local route="$1"
  local ef sf pf lf pid

  ef="$(env_file "$route")" || return 1
  sf="$(script_file "$route")" || return 1
  pf="$(pid_file "$route")" || return 1
  lf="$(log_file "$route")" || return 1

  if is_running "$route"; then
    echo "$route relayer already running: PID $(cat "$pf")"
    return 0
  fi

  if [ ! -f "$ef" ]; then
    echo "missing env file: $ef" >&2
    return 1
  fi
  if [ ! -f "$sf" ]; then
    echo "missing relayer script: $sf" >&2
    return 1
  fi

  (
    cd "$RUNTIME_DIR" || exit 1
    set -a
    . "$ef"
    set +a

    if [ -z "${RELAYER_PRIVATE_KEY:-}" ]; then
      if [ -z "${RELAYER_KEY_ACCOUNT:-}" ]; then
        echo "missing RELAYER_PRIVATE_KEY or RELAYER_KEY_ACCOUNT in $ef" >&2
        exit 1
      fi
      RELAYER_PRIVATE_KEY="$(cast wallet private-key --account "$RELAYER_KEY_ACCOUNT")" || exit 1
      export RELAYER_PRIVATE_KEY
    fi

    nohup node "$sf" >> "$lf" 2>&1 &
    echo $! > "$pf"
  )

  sleep 1
  if ! is_running "$route"; then
    echo "$route relayer failed to start; recent log:" >&2
    tail -n 50 "$lf" >&2
    rm -f "$pf"
    return 1
  fi

  pid="$(cat "$pf")"
  echo "$route relayer started: PID $pid"
  echo "log: $lf"
}

stop_one() {
  local route="$1"
  local pf pid i

  pf="$(pid_file "$route")" || return 1
  if ! is_running "$route"; then
    echo "$route relayer not running"
    rm -f "$pf"
    return 0
  fi

  pid="$(cat "$pf")"
  kill "$pid" 2>/dev/null

  i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 20 ]; do
    sleep 1
    i=$((i + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null
  fi

  rm -f "$pf"
  echo "$route relayer stopped"
}

status_one() {
  local route="$1"
  local pf
  pf="$(pid_file "$route")" || return 1

  if is_running "$route"; then
    echo "$route: RUNNING pid=$(cat "$pf")"
  else
    echo "$route: STOPPED"
  fi
}

logs_one() {
  local route="$1"
  local lf
  lf="$(log_file "$route")" || return 1
  touch "$lf"
  tail -n 100 -f "$lf"
}

for_each_target() {
  local action="$1" target="$2" route count=0
  if [[ "$target" == "all" ]]; then
    while IFS= read -r route; do
      count=$((count + 1))
      "${action}_one" "$route" || return 1
    done < <(configured_routes)
    if ((count == 0)); then
      echo "no configured XETA ILN relayer env files found in $RUNTIME_DIR"
      [[ "$action" != "start" ]]
      return $?
    fi
    return 0
  fi
  route_suffix "$target" >/dev/null || {
    echo "target must be iln-<source>-to-<destination> or all" >&2
    return 1
  }
  "${action}_one" "$target"
}

ACTION="${1:-status}"
TARGET="${2:-all}"

case "$ACTION" in
  start)
    for_each_target start "$TARGET"
    ;;
  stop)
    for_each_target stop "$TARGET"
    ;;
  restart)
    for_each_target stop "$TARGET"
    for_each_target start "$TARGET"
    ;;
  status)
    for_each_target status "$TARGET"
    ;;
  logs)
    if [ "$TARGET" = "all" ]; then
      echo "logs requires one specific iln-<source>-to-<destination> route" >&2
      exit 1
    fi
    logs_one "$TARGET"
    ;;
  *)
    echo "usage: $0 {start|stop|restart|status|logs} [iln-<source>-to-<destination>|all]" >&2
    exit 1
    ;;
esac
