"""SLICE_JOB loading, validation, lock verification, and argv resolution."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import struct
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class ValidationResult:
    key: str
    label: str
    ok: bool
    detail: str = ""


@dataclass
class JobSpec:
    path: Path
    raw: dict[str, Any]
    job_dir: Path
    job_id: str
    candidate: str
    engine_path: Path
    data_dir: Path
    inputs: list[Path]
    profiles: dict[str, Path]
    output_dir: Path
    locks_path: Path
    schema_version: str | None = None
    display: dict[str, Any] = field(default_factory=dict)
    cli: dict[str, Any] = field(default_factory=dict)
    reference_duration_seconds: float = 2971.0
    input_mode: str = "legacy_unspecified"
    mesh_contract: dict[str, Any] = field(default_factory=dict)
    provenance: dict[str, Any] | None = None
    mesh_summary: dict[str, Any] | None = None


def _resolve_path(value: Any, base: Path) -> Path:
    if not isinstance(value, str) or not value.strip():
        return Path("")
    expanded = os.path.expandvars(os.path.expanduser(value.strip()))
    path = Path(expanded)
    return path if path.is_absolute() else (base / path).resolve()


def load_job(path: str | Path) -> JobSpec:
    job_path = Path(path).expanduser().resolve()
    with job_path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    if not isinstance(raw, dict):
        raise ValueError("SLICE_JOB.jsonのルートはJSON objectである必要があります")

    job_dir = job_path.parent
    profiles_raw = raw.get("profiles")
    if not isinstance(profiles_raw, dict):
        profiles_raw = {}
    locks_raw = raw.get("input_locks")
    if locks_raw is None and isinstance(raw.get("locks"), dict):
        locks_raw = raw["locks"].get("path")
    locks_path = _resolve_path(locks_raw, job_dir) if locks_raw else job_dir / "locks" / "INPUT_LOCKS.json"

    history = raw.get("history") if isinstance(raw.get("history"), dict) else {}
    reference = history.get("reference_duration_seconds", raw.get("reference_duration_seconds", 2971))
    try:
        reference_seconds = max(1.0, float(reference))
    except (TypeError, ValueError):
        reference_seconds = 2971.0

    return JobSpec(
        path=job_path,
        raw=raw,
        job_dir=job_dir,
        job_id=str(raw.get("job_id", "")),
        candidate=str(raw.get("candidate", raw.get("job_id", ""))),
        engine_path=_resolve_path(raw.get("engine_path"), job_dir),
        data_dir=_resolve_path(raw.get("data_dir"), job_dir),
        inputs=[_resolve_path(value, job_dir) for value in raw.get("inputs", []) if isinstance(value, str)],
        profiles={str(key): _resolve_path(value, job_dir) for key, value in profiles_raw.items()},
        output_dir=_resolve_path(raw.get("output_dir"), job_dir),
        locks_path=locks_path,
        schema_version=str(raw["schema_version"]) if raw.get("schema_version") is not None else None,
        display=raw.get("display") if isinstance(raw.get("display"), dict) else {},
        cli=raw.get("cli") if isinstance(raw.get("cli"), dict) else {},
        reference_duration_seconds=reference_seconds,
        input_mode=(
            raw.get("input_mode")
            if isinstance(raw.get("input_mode"), str)
            else ("legacy_unspecified" if "input_mode" not in raw else "__invalid__")
        ),
        mesh_contract=raw.get("mesh") if isinstance(raw.get("mesh"), dict) else {},
        provenance=raw.get("provenance") if isinstance(raw.get("provenance"), dict) else None,
    )


def _stl_float(token: str, label: str) -> float:
    try:
        value = float(token)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"STL {label}が数値ではありません") from exc
    if not math.isfinite(value):
        raise ValueError(f"STL {label}にNaN/Infが含まれています")
    return value


def _update_bounds(bounds: list[list[float]] | None, x: float, y: float, z: float) -> list[list[float]]:
    if bounds is None:
        return [[x, y, z], [x, y, z]]
    for axis, value in enumerate((x, y, z)):
        bounds[0][axis] = min(bounds[0][axis], value)
        bounds[1][axis] = max(bounds[1][axis], value)
    return bounds


def _parse_ascii_stl(path: Path) -> tuple[int, list[list[float]]]:
    state = "solid"
    face_count = 0
    vertex_count = 0
    vertices_in_face = 0
    bounds: list[list[float]] | None = None
    ended = False
    try:
        handle = path.open("r", encoding="ascii")
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"STLをASCIIまたはbinary STLとして読めません: {exc}") from exc
    with handle:
        for line_number, line in enumerate(handle, start=1):
            parts = line.strip().split()
            if not parts:
                continue
            if ended:
                raise ValueError(f"ASCII STLのendsolid後にデータがあります: {line_number}行")
            token = parts[0].casefold()
            if state == "solid":
                if token != "solid":
                    raise ValueError("ASCII STLの先頭にsolidがありません")
                state = "facet"
            elif state == "facet":
                if token == "endsolid":
                    if face_count == 0:
                        raise ValueError("ASCII STLにfacetがありません")
                    ended = True
                elif token == "facet" and len(parts) == 5 and parts[1].casefold() == "normal":
                    for component in parts[2:5]:
                        _stl_float(component, "normal")
                    state = "outer_loop"
                else:
                    raise ValueError(f"ASCII STLのfacet形式が不正です: {line_number}行")
            elif state == "outer_loop":
                if token != "outer" or len(parts) != 2 or parts[1].casefold() != "loop":
                    raise ValueError(f"ASCII STLにouter loopがありません: {line_number}行")
                vertices_in_face = 0
                state = "vertex"
            elif state == "vertex":
                if token == "vertex" and len(parts) == 4:
                    x, y, z = (_stl_float(value, "座標") for value in parts[1:4])
                    bounds = _update_bounds(bounds, x, y, z)
                    vertex_count += 1
                    vertices_in_face += 1
                    if vertices_in_face == 3:
                        state = "end_loop"
                else:
                    raise ValueError(f"ASCII STLのvertex形式が不正です: {line_number}行")
            elif state == "end_loop":
                if token != "endloop":
                    raise ValueError(f"ASCII STLにendloopがありません: {line_number}行")
                state = "end_facet"
            elif state == "end_facet":
                if token != "endfacet":
                    raise ValueError(f"ASCII STLにendfacetがありません: {line_number}行")
                face_count += 1
                state = "facet"
    if not ended or state != "facet" or bounds is None:
        raise ValueError("ASCII STLが途中で終わっています")
    return face_count, bounds


def inspect_stl(path: Path) -> dict[str, Any]:
    """Parse an ASCII or binary STL and return finite geometry facts."""

    size_bytes = path.stat().st_size
    if size_bytes == 0:
        raise ValueError("mesh fileが0 byteです")
    bounds: list[list[float]] | None = None
    face_count = 0
    vertex_count = 0
    fmt = ""
    with path.open("rb") as handle:
        header = handle.read(84)
        if len(header) == 84:
            declared_faces = struct.unpack_from("<I", header, 80)[0]
            expected_size = 84 + declared_faces * 50
        else:
            declared_faces = 0
            expected_size = -1
        if expected_size == size_bytes:
            fmt = "binary_stl"
            if declared_faces == 0:
                raise ValueError("binary STLにtriangleがありません")
            for _ in range(declared_faces):
                record = handle.read(50)
                if len(record) != 50:
                    raise ValueError("binary STL facetが途中で終わっています")
                values = struct.unpack("<12fH", record)
                for offset in (3, 6, 9):
                    xyz = values[offset : offset + 3]
                    if not all(math.isfinite(value) for value in xyz):
                        raise ValueError("STL座標にNaN/Infが含まれています")
                    bounds = _update_bounds(bounds, *xyz)
                face_count += 1
                vertex_count += 3
        else:
            fmt = "ascii_stl"
            face_count, bounds = _parse_ascii_stl(path)
            vertex_count = face_count * 3
    if face_count <= 0 or vertex_count <= 0 or bounds is None:
        raise ValueError("meshにvertexまたはtriangleがありません")
    if not all(math.isfinite(value) for point in bounds for value in point):
        raise ValueError("mesh boundsが有限ではありません")
    return {
        "format": fmt,
        "vertex_count": vertex_count,
        "triangle_count": face_count,
        "bounds_mm": {"min": bounds[0], "max": bounds[1]},
        "size_bytes": size_bytes,
        "sha256": _hash_file(path),
    }


def _finite_vector(value: Any, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(f"{label}は3要素の配列で指定してください")
    result: list[float] = []
    for component in value:
        if isinstance(component, bool) or not isinstance(component, (int, float)):
            raise ValueError(f"{label}は有限な数値で指定してください")
        number = float(component)
        if not math.isfinite(number):
            raise ValueError(f"{label}にNaN/Infが含まれています")
        result.append(number)
    return result


def _mesh_has_sha256_lock(spec: JobSpec, target: Path) -> bool:
    try:
        with spec.locks_path.open("r", encoding="utf-8") as handle:
            lock_data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return False
    target_key = os.path.normcase(str(target.resolve()))
    for key, value in _lock_entries(lock_data):
        lock_path_value: Any = key
        expected: Any = None
        if isinstance(value, dict):
            lock_path_value = value.get("path") or value.get("file") or key
            expected = value.get("sha256") or value.get("hash") or value.get("sha-256")
        elif isinstance(value, str):
            expected = value
        if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", expected):
            continue
        lock_path = _resolve_path(lock_path_value, spec.job_dir)
        if os.path.normcase(str(lock_path.resolve())) == target_key:
            return True
    return False


def _mesh_input_summary(spec: JobSpec) -> dict[str, Any]:
    if len(spec.inputs) != 1:
        raise ValueError("mesh_importはSTL inputを1件だけ指定してください")
    mesh_path = spec.inputs[0]
    if mesh_path.suffix.casefold() != ".stl":
        raise ValueError("このRunnerで実証済みのmesh_import形式はSTLです")
    if not mesh_path.is_file():
        raise ValueError(f"mesh fileが見つかりません: {mesh_path}")
    if not _mesh_has_sha256_lock(spec, mesh_path):
        raise ValueError("mesh fileに一致するSHA-256 input lockがありません")
    units = spec.mesh_contract.get("units")
    if units != "mm":
        raise ValueError("STL unitsは明示的にmmと指定してください")
    expected = spec.mesh_contract.get("expected_bounds_mm")
    if not isinstance(expected, dict):
        raise ValueError("mesh.expected_bounds_mmがありません")
    expected_bounds = {
        "min": _finite_vector(expected.get("min"), "expected_bounds_mm.min"),
        "max": _finite_vector(expected.get("max"), "expected_bounds_mm.max"),
    }
    if any(low > high for low, high in zip(expected_bounds["min"], expected_bounds["max"])):
        raise ValueError("expected_bounds_mmが不可能な範囲です")
    transform = spec.mesh_contract.get("intended_transform")
    if not isinstance(transform, dict):
        raise ValueError("mesh.intended_transformがありません")
    intended_transform = {
        "translation_mm": _finite_vector(transform.get("translation_mm"), "intended_transform.translation_mm"),
        "rotation_deg": _finite_vector(transform.get("rotation_deg"), "intended_transform.rotation_deg"),
        "scale": _finite_vector(transform.get("scale"), "intended_transform.scale"),
    }
    if any(scale <= 0 for scale in intended_transform["scale"]):
        raise ValueError("intended_transform.scaleは0より大きい必要があります")
    geometry = inspect_stl(mesh_path)
    actual = geometry["bounds_mm"]
    for axis in range(3):
        if not math.isclose(actual["min"][axis], expected_bounds["min"][axis], rel_tol=0.0, abs_tol=1e-6):
            raise ValueError("mesh boundsがexpected_bounds_mm.minと一致しません")
        if not math.isclose(actual["max"][axis], expected_bounds["max"][axis], rel_tol=0.0, abs_tol=1e-6):
            raise ValueError("mesh boundsがexpected_bounds_mm.maxと一致しません")
    geometry.update({
        "units": "mm",
        "expected_bounds_mm": expected_bounds,
        "intended_transform": intended_transform,
    })
    return geometry


def _input_contract_errors(spec: JobSpec) -> tuple[list[str], dict[str, Any] | None]:
    spec.mesh_summary = None
    if spec.input_mode == "legacy_unspecified":
        return [], None
    if spec.input_mode == "mesh_import":
        try:
            summary = _mesh_input_summary(spec)
        except (OSError, ValueError, struct.error) as exc:
            return [str(exc)], None
        spec.mesh_summary = summary
        return [], summary
    if spec.input_mode == "native_bambu_project":
        if len(spec.inputs) != 1 or spec.inputs[0].suffix.casefold() != ".3mf":
            return ["native_bambu_projectは3MF inputを1件だけ指定してください"], None
        provenance = spec.provenance
        required = {
            "native_saved": True,
            "externally_reduced": False,
            "manually_repacked": False,
        }
        if not isinstance(provenance, dict) or any(provenance.get(key) is not value for key, value in required.items()):
            return ["native_bambu_project provenanceが不足またはuntrustedです"], None
        return [], None
    return [f"未対応のinput_modeです: {spec.input_mode}"], None


def _writable_directory(path: Path) -> tuple[bool, str]:
    target = path
    while not target.exists() and target != target.parent:
        target = target.parent
    if not target.exists() or not target.is_dir():
        return False, "Output folderの親ディレクトリが見つかりません"
    try:
        with tempfile.NamedTemporaryFile(prefix=".fukei_write_test_", dir=target, delete=True):
            pass
    except OSError as exc:
        return False, f"Output folderに書き込めません: {exc}"
    return True, "書き込み可能"


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _lock_entries(lock_data: Any) -> list[tuple[str, Any]]:
    entries: list[tuple[str, Any]] = []
    if not isinstance(lock_data, dict):
        return entries

    def add_mapping(mapping: Any) -> None:
        if isinstance(mapping, dict):
            for key, value in mapping.items():
                entries.append((str(key), value))
        elif isinstance(mapping, list):
            for item in mapping:
                if isinstance(item, dict):
                    key = item.get("path") or item.get("file") or item.get("name")
                    if key:
                        entries.append((str(key), item))

    for key in ("files", "inputs", "profiles", "locks"):
        if key in lock_data:
            add_mapping(lock_data[key])

    if not entries:
        for key, value in lock_data.items():
            if key not in {"version", "created_at", "job_id", "required"}:
                entries.append((str(key), value))
    return entries


def verify_input_locks(spec: JobSpec) -> tuple[bool, list[str]]:
    if not spec.locks_path.is_file():
        return False, [f"Input locksが見つかりません: {spec.locks_path.name}"]
    try:
        with spec.locks_path.open("r", encoding="utf-8") as handle:
            lock_data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        return False, [f"Input locksを読めません: {exc}"]

    errors: list[str] = []
    entries = _lock_entries(lock_data)
    checked = 0
    for key, value in entries:
        expected = None
        lock_path_value: Any = key
        if isinstance(value, dict):
            expected = value.get("sha256") or value.get("hash") or value.get("sha-256")
            lock_path_value = value.get("path") or value.get("file") or key
        elif isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{64}", value):
            expected = value
        if not expected:
            continue
        checked += 1
        lock_path = _resolve_path(lock_path_value, spec.job_dir)
        if not lock_path.is_file():
            errors.append(f"Lock対象が見つかりません: {lock_path.name}")
            continue
        actual = _hash_file(lock_path)
        if actual.lower() != str(expected).lower():
            errors.append(f"Input lock hashが一致しません: {lock_path.name}")

    required = lock_data.get("required") if isinstance(lock_data, dict) else None
    if isinstance(required, list):
        for value in required:
            required_path = _resolve_path(value, spec.job_dir)
            if not required_path.is_file():
                errors.append(f"Lock対象が見つかりません: {required_path.name}")

    if checked == 0 and not isinstance(required, list):
        errors.append("INPUT_LOCKS.jsonに検証対象のsha256がありません")
    return not errors, errors


def resolve_input_identities(spec: JobSpec) -> list[dict[str, Any]]:
    identities: list[dict[str, Any]] = []
    for path in spec.inputs:
        identity: dict[str, Any] = {"path": str(path)}
        if path.is_file():
            identity["size_bytes"] = path.stat().st_size
            identity["sha256"] = _hash_file(path)
        else:
            identity["size_bytes"] = None
            identity["sha256"] = None
        identities.append(identity)
    return identities


def resolve_profile_identities(spec: JobSpec) -> list[dict[str, Any]]:
    identities: list[dict[str, Any]] = []
    for name, path in spec.profiles.items():
        identity: dict[str, Any] = {"key": name, "name": name, "path": str(path)}
        if path.is_file():
            identity["size_bytes"] = path.stat().st_size
            identity["sha256"] = _hash_file(path)
        else:
            identity["size_bytes"] = None
            identity["sha256"] = None
        identities.append(identity)
    return identities


def resolve_windows_execution(spec: JobSpec) -> str:
    value = spec.cli.get("windows_execution", "no_window")
    mode = str(value).strip().casefold()
    if mode not in {"no_window", "inherit_console"}:
        raise ValueError(f"未対応のwindows_executionです: {value}")
    return mode


def validate_job(spec: JobSpec) -> list[ValidationResult]:
    results: list[ValidationResult] = [
        ValidationResult("job", "SLICE_JOB.json", True, "読込済み"),
    ]

    engine_ok = spec.engine_path.is_file()
    results.append(ValidationResult(
        "engine", "Engine", engine_ok,
        "存在します" if engine_ok else "Engineが見つかりません",
    ))

    missing_inputs = [path for path in spec.inputs if not path.is_file()]
    input_ok = bool(spec.inputs) and not missing_inputs
    input_detail = "存在します" if input_ok else (
        "Input filesが未指定" if not spec.inputs else f"見つかりません: {missing_inputs[0].name}"
    )
    results.append(ValidationResult("inputs", "Input files", input_ok, input_detail))

    contract_errors, _ = _input_contract_errors(spec)
    if spec.input_mode == "legacy_unspecified":
        mode_detail = "legacy job: input_modeなし（backward compatible）"
    elif contract_errors:
        mode_detail = " / ".join(contract_errors)
    elif spec.input_mode == "mesh_import":
        mode_detail = (
            f"STL PASS: {spec.mesh_summary['vertex_count']} vertices / "
            f"{spec.mesh_summary['triangle_count']} triangles / SHA-256 lock一致"
        )
    else:
        mode_detail = "native Bambu project provenance PASS"
    results.append(ValidationResult(
        "input_mode", "Input mode / geometry", not contract_errors, mode_detail,
    ))

    missing_profiles = [path for path in spec.profiles.values() if not path.is_file()]
    profiles_ok = bool(spec.profiles) and not missing_profiles
    profiles_detail = "存在します" if profiles_ok else (
        "Profilesが未指定" if not spec.profiles else f"見つかりません: {missing_profiles[0].name}"
    )
    results.append(ValidationResult("profiles", "Profiles", profiles_ok, profiles_detail))

    output_ok, output_detail = _writable_directory(spec.output_dir)
    results.append(ValidationResult("output", "Output folder", output_ok, output_detail))

    locks_ok, lock_errors = verify_input_locks(spec)
    results.append(ValidationResult(
        "locks", "Input locks", locks_ok,
        "一致します" if locks_ok else " / ".join(lock_errors),
    ))

    argv = spec.cli.get("argv")
    argv_ok = isinstance(argv, list) and bool(argv) and all(isinstance(item, str) and item for item in argv)
    windows_execution = str(spec.cli.get("windows_execution", "no_window")).strip().casefold()
    execution_mode_ok = windows_execution in {"no_window", "inherit_console"}
    cwd = _resolve_path(spec.cli.get("cwd"), spec.job_dir) if spec.cli.get("cwd") else spec.job_dir
    if not execution_mode_ok:
        argv_ok = False
        argv_detail = "windows_executionはno_windowまたはinherit_consoleのみ指定できます"
    elif argv_ok and not cwd.is_dir():
        argv_ok = False
        argv_detail = "CLI cwdが見つかりません"
    else:
        argv_detail = "Runbook由来のCLI argvを使用します" if argv_ok else (
            "検証済みのcli.argvがありません。推測実行はしません"
        )
    results.append(ValidationResult("cli", "Validated CLI", argv_ok, argv_detail))
    return results


def _format_token(token: str, mapping: dict[str, str]) -> str:
    class SafeMapping(dict[str, str]):
        def __missing__(self, key: str) -> str:
            return "{" + key + "}"

    # Dotted placeholders are documented for readability but are not valid
    # direct keys for str.format_map (it treats the dot as attribute access).
    for key, value in mapping.items():
        if "." in key:
            token = token.replace("{" + key + "}", value)
    return token.format_map(SafeMapping(mapping))


def resolve_argv(spec: JobSpec, run_dir: Path) -> list[str]:
    raw_argv = spec.cli.get("argv")
    if not isinstance(raw_argv, list) or not raw_argv:
        raise ValueError("検証済みのcli.argvがありません")

    mapping = {
        "engine_path": str(spec.engine_path),
        "data_dir": str(spec.data_dir),
        "job_dir": str(spec.job_dir),
        "job_path": str(spec.path),
        "output_dir": str(run_dir),
        "output_root": str(spec.output_dir),
        "run_dir": str(run_dir),
        "python_executable": sys.executable,
    }
    for index, path in enumerate(spec.inputs):
        mapping[f"input_{index}"] = str(path)
    for name, path in spec.profiles.items():
        mapping[f"profile_{name}"] = str(path)
        mapping[f"profiles.{name}"] = str(path)

    resolved: list[str] = []
    for token in raw_argv:
        if token == "{inputs}":
            resolved.extend(str(path) for path in spec.inputs)
        elif token == "{profiles}":
            resolved.extend(str(path) for path in spec.profiles.values())
        else:
            resolved.append(_format_token(token, mapping))
    if any("{" in item or "}" in item for item in resolved):
        raise ValueError("cli.argvに未解決のplaceholderがあります")
    return resolved


def resolve_cwd(spec: JobSpec) -> Path:
    raw_cwd = spec.cli.get("cwd")
    return _resolve_path(raw_cwd, spec.job_dir) if raw_cwd else spec.job_dir


def resolve_env(spec: JobSpec, run_dir: Path) -> dict[str, str]:
    raw_env = spec.cli.get("env")
    if not isinstance(raw_env, dict):
        return {}
    mapping = {
        "job_dir": str(spec.job_dir),
        "run_dir": str(run_dir),
        "output_dir": str(run_dir),
        "data_dir": str(spec.data_dir),
    }
    return {str(key): _format_token(str(value), mapping) for key, value in raw_env.items()}
