#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# ポートは docs/launcher-spec.md のポート台帳で一意に固定（Yohaku=5174）。
PORT=5174

echo "Project: Katachi"
echo "Directory: ${PROJECT_DIR}"
echo
echo "Starting Vite dev server (http://localhost:${PORT})..."

cd "$PROJECT_DIR"

if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Run npm install first."
  exit 1
fi

exec npm run dev -- --port "${PORT}" --strictPort
