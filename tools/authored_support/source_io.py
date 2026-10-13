from __future__ import annotations

import hashlib
import json
import re
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


def read_locked_json(path: Path, expected_sha256: str) -> Any:
    """Check the descriptor itself before parsing or following any references."""
    if not isinstance(expected_sha256, str) or re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha256) is None:
        raise ContractError("expected JSON SHA256 must be 64 hexadecimal characters")
    if sha256_file(path) != expected_sha256.lower():
        raise ContractError(f"JSON SHA256 mismatch: {path}")
    return read_json(path)


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
    if not isinstance(expected, str) or re.fullmatch(r"[0-9a-fA-F]{64}", expected) is None:
        result["status"] = "HOLD"
        result["reason"] = "EXPECTED_SHA256_INVALID"
        return result
    if not path.is_file():
        result["status"] = "HOLD"
        result["reason"] = "SOURCE_FILE_MISSING"
        return result
    actual = sha256_file(path)
    result["actual_sha256"] = actual
    if actual.lower() != expected.lower():
        result["status"] = "HOLD"
        result["reason"] = "SOURCE_SHA256_MISMATCH"
    else:
        result["status"] = "PASS"
    return result


def check_permanent_closure(case: dict, preset_dir: Path, roots: dict) -> dict:
    if case.get('case_id')!='MINI_A_AUTHORED_SUPPORT_LEGACY_V1':
        return {'status':'NOT_APPLICABLE','checked_files':0}
    lock=read_locked_json(preset_dir/'PERMANENT_MESH_LOCK.json',case.get('permanent_mesh_lock_sha256'))
    if lock.get('case_id')!=case['case_id']:
        raise ContractError('Permanent mesh closure case mismatch')
    rows=lock.get('files',[])
    if not rows:raise ContractError('empty Permanent mesh closure')
    keys=[(r.get('root'),r.get('path')) for r in rows]
    if len(keys)!=len(set(keys)):raise ContractError('duplicate Permanent mesh closure entry')
    checks=[check_asset(r,roots) for r in rows]
    failed=[r for r in checks if r['status']!='PASS']
    return dict(status='HOLD' if failed else 'PASS',checked_files=len(checks),failed=failed,
                lock_sha256=case['permanent_mesh_lock_sha256'])


def check_downstream_sources(case, preset_dir, roots):
    if case.get('case_id') != 'MINI_A_AUTHORED_SUPPORT_LEGACY_V1':
        return dict(status='NOT_APPLICABLE', checked_files=0)
    from .lineage_constants import DOWNSTREAM_SOURCE_SHA256
    lock = read_locked_json(preset_dir/'DOWNSTREAM_SOURCE_LOCK.json', case.get('downstream_source_lock_sha256'))
    actual = {r['path']:r['sha256'] for r in lock['files']}
    if len(actual) != len(lock['files']) or actual != DOWNSTREAM_SOURCE_SHA256:
        raise ContractError('downstream source lock differs from Python registration')
    checks = [check_asset(dict(row, root='outputs'), roots) for row in lock['files']]
    failed = [r for r in checks if r['status'] != 'PASS']
    return dict(status='HOLD' if failed else 'PASS', checked_files=len(checks), failed=failed)
