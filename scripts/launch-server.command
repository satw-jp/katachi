#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Project: Yohaku"
echo "Directory: ${PROJECT_DIR}"
echo
echo "Starting Vite dev server..."

cd "$PROJECT_DIR"

if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Run npm install first."
  exit 1
fi

exec npm run dev
