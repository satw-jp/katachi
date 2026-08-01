#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_GATE="/Users/atsushisato/Projects/scripts/verify-hikari-current.mjs"
# ポートは docs/launcher-spec.md のポート台帳で一意に固定（Yohaku=5174）。
PORT=5174

if [ ! -f "${VERSION_GATE}" ]; then
  echo "Hikari version gate not found: ${VERSION_GATE}"
  exit 2
fi

GATE_OUTPUT="$(node "${VERSION_GATE}")"
CURRENT_DIR="$(printf '%s\n' "${GATE_OUTPUT}" | awk -F= '$1 == "worktree" { print $2 }')"
if [ "${PROJECT_DIR}" != "${CURRENT_DIR}" ]; then
  printf '%s\n' "${GATE_OUTPUT}"
  echo
  echo "Refusing to start an older Hikari worktree: ${PROJECT_DIR}"
  echo "Current Hikari: ${CURRENT_DIR}"
  exit 2
fi

echo "Project: Katachi"
echo "Directory: ${PROJECT_DIR}"
echo
echo "Starting Vite dev server (http://localhost:${PORT})..."
printf '%s\n' "${GATE_OUTPUT}"

cd "$PROJECT_DIR"

if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Run npm install first."
  exit 1
fi

exec npm run dev -- --port "${PORT}" --strictPort
