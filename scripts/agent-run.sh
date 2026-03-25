#!/usr/bin/env bash

set -uo pipefail

TIMEOUT_SEC=120
IDLE_TIMEOUT_SEC=30
HEARTBEAT_SEC=5
COMMAND_LINE=""

write_marker() {
  local name="$1"
  shift || true
  if [ "$#" -eq 0 ] || [ -z "${1:-}" ]; then
    printf '__AGENT_RUN_%s__\n' "$name"
    return
  fi
  printf '__AGENT_RUN_%s__ %s\n' "$name" "$1"
}

usage_fail() {
  write_marker "FAIL" "exit=64 reason=no_command"
  exit 64
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -TimeoutSec)
      TIMEOUT_SEC="${2:-}"
      shift 2
      ;;
    -IdleTimeoutSec)
      IDLE_TIMEOUT_SEC="${2:-}"
      shift 2
      ;;
    -HeartbeatSec)
      HEARTBEAT_SEC="${2:-}"
      shift 2
      ;;
    -CommandLine)
      COMMAND_LINE="${2:-}"
      shift 2
      ;;
    *)
      write_marker "FAIL" "exit=64 reason=unknown_arg arg=$1"
      exit 64
      ;;
  esac
done

[ -n "$COMMAND_LINE" ] || usage_fail

cwd="$(pwd)"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/agent-run.XXXXXX")"
stdout_file="$tmp_dir/stdout.log"
stderr_file="$tmp_dir/stderr.log"
touch "$stdout_file" "$stderr_file"

stdout_offset=0
stderr_offset=0
started_at="$(date +%s)"
last_activity_at="$started_at"
last_heartbeat_at="$started_at"

write_marker "START" "cwd=$cwd command=$COMMAND_LINE"

bash -lc "$COMMAND_LINE" >"$stdout_file" 2>"$stderr_file" &
child_pid=$!

cleanup() {
  if kill -0 "$child_pid" 2>/dev/null; then
    kill -TERM "$child_pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8; do
      if ! kill -0 "$child_pid" 2>/dev/null; then
        break
      fi
      sleep 0.25
    done
    kill -KILL "$child_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp_dir"
}

trap cleanup EXIT INT TERM

flush_delta() {
  local file="$1"
  local offset="$2"
  local target="$3"
  local size
  size="$(wc -c <"$file" | tr -d " ")"
  if [ "$size" -le "$offset" ]; then
    printf "%s" "$offset"
    return
  fi

  local count=$((size - offset))
  if [ "$target" = "stderr" ]; then
    tail -c "$count" "$file" >&2
  else
    tail -c "$count" "$file"
  fi
  printf "%s" "$size"
}

timed_out=0
idle_timed_out=0

while kill -0 "$child_pid" 2>/dev/null; do
  sleep 0.25

  new_stdout_offset="$(flush_delta "$stdout_file" "$stdout_offset" "stdout")"
  new_stderr_offset="$(flush_delta "$stderr_file" "$stderr_offset" "stderr")"
  if [ "$new_stdout_offset" -ne "$stdout_offset" ] || [ "$new_stderr_offset" -ne "$stderr_offset" ]; then
    last_activity_at="$(date +%s)"
    stdout_offset="$new_stdout_offset"
    stderr_offset="$new_stderr_offset"
  fi

  now="$(date +%s)"
  elapsed_sec=$((now - started_at))
  silent_sec=$((now - last_activity_at))

  if [ "${HEARTBEAT_SEC:-0}" -gt 0 ] && [ $((now - last_heartbeat_at)) -ge "$HEARTBEAT_SEC" ]; then
    write_marker "HEARTBEAT" "elapsed_s=${elapsed_sec}.0 silent_s=${silent_sec}.0"
    last_heartbeat_at="$now"
  fi

  if [ "${TIMEOUT_SEC:-0}" -gt 0 ] && [ "$elapsed_sec" -ge "$TIMEOUT_SEC" ]; then
    timed_out=1
    break
  fi

  if [ "${IDLE_TIMEOUT_SEC:-0}" -gt 0 ] && [ "$silent_sec" -ge "$IDLE_TIMEOUT_SEC" ]; then
    idle_timed_out=1
    break
  fi
done

if [ "$timed_out" -eq 1 ] || [ "$idle_timed_out" -eq 1 ]; then
  cleanup
  trap - EXIT INT TERM
  if [ "$timed_out" -eq 1 ]; then
    elapsed_ms=$(( ( $(date +%s) - started_at ) * 1000 ))
    write_marker "TIMEOUT" "exit=124 elapsed_ms=$elapsed_ms limit_s=$TIMEOUT_SEC"
    exit 124
  fi
  elapsed_ms=$(( ( $(date +%s) - started_at ) * 1000 ))
  write_marker "IDLE_TIMEOUT" "exit=125 elapsed_ms=$elapsed_ms idle_limit_s=$IDLE_TIMEOUT_SEC"
  exit 125
fi

wait "$child_pid"
exit_code=$?

stdout_offset="$(flush_delta "$stdout_file" "$stdout_offset" "stdout")"
stderr_offset="$(flush_delta "$stderr_file" "$stderr_offset" "stderr")"

trap - EXIT INT TERM
rm -rf "$tmp_dir"

elapsed_ms=$(( ( $(date +%s) - started_at ) * 1000 ))
if [ "$exit_code" -eq 0 ]; then
  write_marker "OK" "exit=0 elapsed_ms=$elapsed_ms"
  exit 0
fi

write_marker "FAIL" "exit=$exit_code elapsed_ms=$elapsed_ms"
exit "$exit_code"
