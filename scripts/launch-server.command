#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OPTIMIZER_CONTROL="/Users/atsushisato/Projects/active/Optimizer/scripts/server-control.sh"
# ポートは docs/launcher-spec.md のポート台帳で一意に固定（Yohaku=5174）。
PORT=5174

echo "Project: Katachi"
echo "Directory: ${PROJECT_DIR}"
echo
echo "Starting Vite dev server (http://localhost:${PORT})..."

cd "$PROJECT_DIR"

# S-skin の印刷確認を同じ画面で使えるよう、Optimizerの計算エンジンだけ
# 起動する。Optimizerの別Web画面（5177）は起動しない。
if [ -x "$OPTIMIZER_CONTROL" ]; then
  "$OPTIMIZER_CONTROL" start-engine || echo "印刷確認エンジンは起動できませんでした。造形画面はそのまま使えます。"
fi

if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Run npm install first."
  exit 1
fi

exec npm run dev -- --port "${PORT}" --strictPort
