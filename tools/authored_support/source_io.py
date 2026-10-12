from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .contracts import ContractError


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot read JSON {path}: {exc}") from exc


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise ContractError(f"cannot hash {path}: {exc}") from exc
    return digest.hexdigest()


def resolve_asset(asset: dict[str, Any], roots: dict[str, Any]) -> Path:
    root_name = asset.get("root")
    relative = asset.get("path")
    if not isinstance(root_name, str) or not isinstance(relative, str):
        raise ContractError("asset requires string 'root' and 'path'")
    raw_root = roots.get("roots", {}).get(root_name)
    if not isinstance(raw_root, str) or not raw_root:
        raise ContractError(f"root is not mapped: {root_name}")
    rel = Path(relative)
    if rel.is_absolute() or ".." in rel.parts:
        raise ContractError(f"asset path must stay inside its logical root: {relative}")
    root = Path(raw_root).expanduser().resolve(strict=False)
    candidate = (root / rel).resolve(strict=False)
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ContractError(f"asset path escapes logical root: {relative}") from exc
    return candidate


def check_asset(asset: dict[str, Any], roots: dict[str, Any]) -> dict[str, Any]:
    path = resolve_asset(asset, roots)
    expected = asset.get("sha256")
    result: dict[str, Any] = {
        "logical_name": asset.get("logical_name", "unnamed"),
        "path": str(path),
        "exists": path.is_file(),
        "expected_sha256": expected,
    }
    if not path.is_file():
        result["status"] = "HOLD"
        result["reason"] = "SOURCE_FILE_MISSING"
        return result
    actual = sha256_file(path)
    result["actual_sha256"] = actual
    if expected and actual.lower() != expected.lower():
        result["status"] = "HOLD"
        result["reason"] = "SOURCE_SHA256_MISMATCH"
    else:
        result["status"] = "PASS"
    return result
