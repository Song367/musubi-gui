#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# You can override these with env vars before running the script.
UI_ROOT="${UI_ROOT:-${WORKSPACE_DIR}/musubi-tuner-ui}"
BACKEND_DIR="${BACKEND_DIR:-${UI_ROOT}/backend}"
CONDA_ENV_NAME="${CONDA_ENV_NAME:-musubi}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
LOG_DIR="${LOG_DIR:-${UI_ROOT}/logs}"
RUN_DIR="${RUN_DIR:-${UI_ROOT}/run}"
PID_FILE="${PID_FILE:-${RUN_DIR}/ui.pid}"

# Initialize conda
# Check common locations for conda.sh
CONDA_SH_LOCATIONS=(
    "/opt/miniconda/etc/profile.d/conda.sh"
    "/opt/anaconda3/etc/profile.d/conda.sh"
    "$HOME/miniconda3/etc/profile.d/conda.sh"
    "$HOME/anaconda3/etc/profile.d/conda.sh"
)

CONDA_SH=""
for candidate in "${CONDA_SH_LOCATIONS[@]}"; do
  if [[ -f "${candidate}" ]]; then
    CONDA_SH="${candidate}"
    break
  fi
done

if [[ -z "${CONDA_SH}" ]]; then
  echo "Error: conda.sh not found in common locations." >&2
  exit 1
fi

source "${CONDA_SH}"
conda activate "${CONDA_ENV_NAME}"

mkdir -p "${LOG_DIR}" "${RUN_DIR}"

if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "Error: backend directory not found: ${BACKEND_DIR}" >&2
  exit 1
fi

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}")"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "Stopping existing UI process: ${OLD_PID}"
    kill "${OLD_PID}" || true
    sleep 1
  fi
fi

cd "${BACKEND_DIR}"
export PYTHONPATH="${BACKEND_DIR}"

nohup python -m uvicorn app.main:app \
  --host "${HOST}" \
  --port "${PORT}" \
  > "${LOG_DIR}/ui.out.log" 2> "${LOG_DIR}/ui.err.log" &

NEW_PID=$!
echo "${NEW_PID}" > "${PID_FILE}"

echo "UI started successfully."
echo "PID: ${NEW_PID}"
echo "URL: http://<server-ip>:${PORT}"
echo "Logs: ${LOG_DIR}/ui.out.log, ${LOG_DIR}/ui.err.log"
