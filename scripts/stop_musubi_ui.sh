#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

UI_ROOT="${UI_ROOT:-${WORKSPACE_DIR}/musubi-tuner-ui}"
RUN_DIR="${RUN_DIR:-${UI_ROOT}/run}"
PID_FILE="${PID_FILE:-${RUN_DIR}/ui.pid}"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "No PID file found: ${PID_FILE}"
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if [[ -z "${PID}" ]]; then
  echo "PID file is empty: ${PID_FILE}"
  rm -f "${PID_FILE}"
  exit 0
fi

if kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}" || true
  sleep 1
  if kill -0 "${PID}" 2>/dev/null; then
    kill -9 "${PID}" || true
  fi
  echo "UI process stopped: ${PID}"
else
  echo "Process not running, cleaning stale PID file: ${PID}"
fi

rm -f "${PID_FILE}"
