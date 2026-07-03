#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

echo "Project: ${PROJECT_NAME}"
echo "Directory: ${PROJECT_DIR}"
echo
echo "Open this directory in Codex:"
echo "${PROJECT_DIR}"
echo
echo "Before editing, read README.md, AGENTS.md, STATEMENT.md, RESEARCH.md, and ~/Projects/AGENTS.md."

cd "$PROJECT_DIR"
if command -v codex >/dev/null 2>&1; then
  exec codex
else
  echo "codex command not found. Open the directory above in Codex manually."
fi
