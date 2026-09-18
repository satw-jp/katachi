"""Command-line workflow for the bounded path roundtrip helper."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .blender_adapter import BlenderUnavailable, build_review_blend, extract_blend, find_blender, verify_review_blend
from .core import (
    CHANGE_CLASSES,
    RoundtripError,
    analyze_diff,
    build_input_lock,
    compute_impact,
    input_descriptors,
    load_locked_input,
    load_normalized_json,
    read_json,
    rebuild_changed_extract,
    selected_object,
    sha256_file,
    stable_hash,
    compare_line_geometry,
    validate_resolution,
    verify_blender_roundtrip,
    verify_json_rebuild,
    write_json,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _manifest_and_roots(manifest_path: Path, roots_path: Path) -> tuple[dict[str, Any], Any]:
    manifest = read_json(manifest_path)
    roots = read_json(roots_path)
    if not isinstance(manifest, dict):
        raise RoundtripError("manifest must be a JSON object")
    if manifest.get("schema_version") != "1.0":
        raise RoundtripError("manifest schema_version must be 1.0")
    return manifest, roots


def _write_state(run_dir: Path, state: dict[str, Any]) -> None:
    write_json(run_dir / "RUN_STATE.json", state)


def _initial_state(run_dir: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "run_id": run_dir.name,
        "candidate_id": manifest.get("candidate_id"),
        "baseline_id": manifest.get("baseline_id"),
        "created_at": _utc_now(),
        "status": "STARTED",
        "stages": {},
        "next_action": "inspect",
    }


def _write_run_readme(run_dir: Path, manifest: dict[str, Any], state: dict[str, Any]) -> None:
    lines = [
        "# SKIN_R4 Path Roundtrip v0 run",
        "",
        f"- candidate: `{manifest.get('candidate_id')}`",
        f"- baseline: `{manifest.get('baseline_id')}`",
        f"- run status: `{state.get('status')}`",
        "- authority: explicit manifest paths and hashes only",
        "- source behavior: inputs are opened read-only; review output is written to a separate run directory",
        "",
        "## Workflow",
        "",
        "`inspect` locks inputs, extracts one explicit face-less line mesh, classifies the delta, and emits Support impact without modifying Support.",
        "`build-review` requires an explicit resolution and materializes only the resolved line-mesh scope into a separate review artifact.",
        "`verify` rechecks the lock and the review artifact. Physical strength, printability, Author acceptance, and hardware transmission are never inferred.",
        "`resume` is a read-only checkpoint summary that can be used after an interrupted run.",
        "",
        "## State boundary",
        "",
        "| state | meaning |",
        "| --- | --- |",
        "| tool_execution | helper process and artifact status |",
        "| mapping | one-to-one identity proof or fail-closed ambiguity |",
        "| geometry_check | local extraction/review verification only |",
        "| support_validity | always `NOT_REVALIDATED` here |",
        "| printability | always `NOT_EVALUATED` here |",
        "| author_acceptance | always `PENDING` here |",
        "",
        "No source/master overwrite, whole-flower regeneration, Support repair, STL/3MF/slice, print, or hardware send is part of this run.",
        "",
    ]
    (run_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")


def _input_name(manifest: dict[str, Any], role: str, fallback: str) -> str:
    for item in input_descriptors(manifest):
        if item.get("role") == role:
            return str(item.get("name"))
    return fallback


def _object_name(manifest: dict[str, Any], side: str, fallback: str) -> str:
    selection = manifest.get("object_selection", {})
    if isinstance(selection, dict):
        for key in (f"{side}_name", f"{side}_object_name"):
            if selection.get(key):
                return str(selection[key])
    for key in (f"{side}_object_name", f"{side}_name"):
        if manifest.get(key):
            return str(manifest[key])
    return str(selection.get("name", fallback)) if isinstance(selection, dict) else fallback


def _load_edit_extract(path: Path, object_name: str, output: Path, blender: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    if path.suffix.lower() == ".json":
        return load_normalized_json(path, object_name), {"kind": "JSON", "path": str(path)}
    executable = find_blender(blender)
    if executable is None:
        raise BlenderUnavailable("Blender executable not found; .blend extraction is unavailable")
    extract_blend(executable, path, object_name, output)
    return read_json(output), {"kind": "BLENDER_HEADLESS", "path": str(path), "blender": executable}


def _load_baseline_extract(path: Path, object_name: str, output: Path, blender: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    return _load_edit_extract(path, object_name, output, blender)


def cmd_inspect(args: argparse.Namespace) -> int:
    run_dir = Path(args.out).resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = Path(args.manifest).resolve()
    roots_path = Path(args.roots).resolve()
    try:
        manifest, roots = _manifest_and_roots(manifest_path, roots_path)
        state = _initial_state(run_dir, manifest)
        _write_state(run_dir, state)
        lock = build_input_lock(manifest, roots, manifest_path.parent, args.edit)
        write_json(run_dir / "INPUT_LOCK.json", lock)
        state["stages"]["input_lock"] = lock.get("status")
        if lock.get("status") != "PASS":
            state.update({"status": "BLOCKED", "next_action": "repair manifest/root mapping or stale input hash", "errors": lock.get("errors", [])})
            _write_run_readme(run_dir, manifest, state)
            _write_state(run_dir, state)
            return 2

        object_name = _object_name(manifest, "baseline", "INTERNAL_PATHS_EDIT__A1_100PCT")
        edit_object_name = _object_name(manifest, "edit", object_name)
        baseline_name = str(manifest.get("baseline_input", _input_name(manifest, "BASELINE", "baseline")))
        edit_name = str(manifest.get("edit_input", "edit_blend"))
        baseline_path = load_locked_input(lock, baseline_name)
        edit_path = load_locked_input(lock, edit_name)
        baseline_extract, baseline_adapter = _load_baseline_extract(baseline_path, object_name, run_dir / "baseline-extract.json", args.blender)
        edit_extract, edit_adapter = _load_edit_extract(edit_path, edit_object_name, run_dir / "edit-extract.json", args.blender)
        baseline_blend_extract = None
        baseline_blend_adapter = None
        baseline_blend_name = manifest.get("baseline_blend_input")
        baseline_geometry_check = None
        if baseline_blend_name:
            baseline_blend_path = load_locked_input(lock, str(baseline_blend_name))
            if baseline_blend_path.suffix.lower() == ".blend":
                baseline_blend_extract, baseline_blend_adapter = _load_edit_extract(baseline_blend_path, object_name, run_dir / "baseline-blend-extract.json", args.blender)
                baseline_geometry_check = compare_line_geometry(baseline_extract, baseline_blend_extract, object_name, object_name, float(manifest.get("policies", {}).get("point_tolerance_mm", 1e-4)))
                if baseline_geometry_check["status"] != "PASS":
                    raise RoundtripError("baseline data does not match the explicit baseline line blend: " + "; ".join(baseline_geometry_check["failures"][:8]))
        extract_payload = {
            "schema_version": "1.0",
            "status": "PASS",
            "object_name": object_name,
            "baseline_object_name": object_name,
            "edit_object_name": edit_object_name,
            "baseline_input": baseline_name,
            "baseline_blend_input": manifest.get("baseline_blend_input", baseline_name),
            "edit_input": edit_name,
            "baseline": baseline_extract,
            "edit": edit_extract,
            "adapters": {"baseline": baseline_adapter, "edit": edit_adapter},
            "baseline_blend": baseline_blend_extract,
            "baseline_blend_adapter": baseline_blend_adapter,
            "baseline_geometry_check": baseline_geometry_check,
            "provenance": "RECORDED input bytes + DERIVED normalized extraction",
        }
        write_json(run_dir / "EXTRACT.json", extract_payload)
        state["stages"]["extract"] = "PASS"
        delta = analyze_diff(baseline_extract, edit_extract, manifest.get("policies"), object_name, edit_object_name)
        delta["input_lock_sha256"] = lock.get("lock_sha256")
        delta["extract_sha256"] = stable_hash(extract_payload)
        write_json(run_dir / "DELTA.json", delta)
        state["stages"]["mapping"] = delta.get("status")
        impact = compute_impact(delta, baseline_extract, edit_extract, manifest)
        write_json(run_dir / "IMPACT.json", impact)
        state["stages"]["impact"] = impact.get("status")
        state.update({"status": "INSPECTED", "next_action": "write an explicit resolution.json, then build-review", "delta_status": delta.get("status")})
        _write_run_readme(run_dir, manifest, state)
        _write_state(run_dir, state)
        print(json.dumps({"run": str(run_dir), "status": state["status"], "delta": delta["status"], "counts": delta["counts"]}, ensure_ascii=False))
        return 0
    except (RoundtripError, BlenderUnavailable, OSError) as exc:
        state = locals().get("state")
        if not isinstance(state, dict):
            state = {"schema_version": "1.0", "run_id": run_dir.name, "created_at": _utc_now()}
        state.update({"status": "BLOCKED", "next_action": "resolve the reported boundary before retrying", "errors": [str(exc)]})
        if isinstance(locals().get("manifest"), dict):
            object_name = str(manifest.get("object_selection", {}).get("name", manifest.get("object_name", "UNRESOLVED")))
            blocked_delta = {
                "schema_version": "1.0",
                "status": "UNSUPPORTED",
                "object_name": object_name,
                "mapping": {"status": "UNSUPPORTED", "pairs": [], "ambiguous": [], "unmatched_baseline": [], "unmatched_edit": [], "provenance": "DERIVED blocked extraction"},
                "operations": [{"operation_id": "delta-0001", "class": "UNSUPPORTED_INPUT", "scope": "__object__", "reason": str(exc), "provenance": "DERIVED"}],
                "counts": {name: 1 if name == "UNSUPPORTED_INPUT" else 0 for name in CHANGE_CLASSES},
                "affected_scopes": ["__object__"],
            }
            write_json(run_dir / "EXTRACT.json", {"schema_version": "1.0", "status": "BLOCKED", "object_name": object_name, "error": str(exc), "provenance": "DERIVED blocked extraction"})
            write_json(run_dir / "DELTA.json", blocked_delta)
            write_json(run_dir / "IMPACT.json", {"schema_version": "1.0", "status": "BLOCKED", "support_validity": "NOT_REVALIDATED", "printability": "NOT_EVALUATED", "author_acceptance": "PENDING", "items": [{"scope": "__object__", "reasons": ["UNKNOWN_SCOPE"], "support_ids": [], "provenance": "DERIVED"}], "note": "Extraction boundary blocked; no Support action is proposed."})
            state["stages"] = {**state.get("stages", {}), "extract": "UNSUPPORTED", "mapping": "UNSUPPORTED", "impact": "BLOCKED"}
            _write_run_readme(run_dir, manifest, state)
        _write_state(run_dir, state)
        print(f"inspect blocked: {exc}", file=sys.stderr)
        return 2


def cmd_build_review(args: argparse.Namespace) -> int:
    run_dir = Path(args.run).resolve()
    try:
        lock = read_json(run_dir / "INPUT_LOCK.json")
        delta = read_json(run_dir / "DELTA.json")
        extract_payload = read_json(run_dir / "EXTRACT.json")
        resolution = read_json(Path(args.resolution).resolve())
        errors = validate_resolution(resolution, delta, lock)
        if errors:
            raise RoundtripError("resolution rejected: " + "; ".join(errors))
        selected_ids = [str(item) for item in resolution.get("selected_operation_ids", [])]
        baseline = extract_payload["baseline"]
        edit = extract_payload["edit"]
        baseline_name = resolution.get("baseline_input", extract_payload.get("baseline_input", "baseline"))
        edit_name = resolution.get("edit_input", extract_payload.get("edit_input", "edit_blend"))
        baseline_path = next(item for item in lock["inputs"] if item["name"] == baseline_name)
        edit_path = next(item for item in lock["inputs"] if item["name"] == edit_name)
        baseline_blend_name = resolution.get("baseline_blend_input", extract_payload.get("baseline_blend_input", baseline_name))
        baseline_blend_path = next(item for item in lock["inputs"] if item["name"] == baseline_blend_name)
        review_dir = run_dir / "review"
        review_dir.mkdir(parents=True, exist_ok=True)
        rebuilt = rebuild_changed_extract(baseline, edit, delta, selected_ids)
        write_json(review_dir / "rebuilt_extract.json", rebuilt)
        json_check = verify_json_rebuild(baseline, edit, rebuilt, delta)
        if Path(str(baseline_path["resolved_path"])).suffix.lower() == ".json" and Path(str(edit_path["resolved_path"])).suffix.lower() == ".json":
            verification = json_check
            artifact = str(review_dir / "rebuilt_extract.json")
        else:
            if Path(str(baseline_blend_path["resolved_path"])).suffix.lower() != ".blend" or Path(str(edit_path["resolved_path"])).suffix.lower() != ".blend":
                raise RoundtripError("Blender review requires explicit .blend baseline_blend_input and edit_input")
            executable = find_blender(args.blender)
            if executable is None:
                raise BlenderUnavailable("Blender executable not found; cannot save a review .blend")
            object_name = str(delta["object_name"])
            output = review_dir / "PATH_DELTA_REVIEW.blend"
            scopes = [str(item.get("scope")) for item in delta["operations"] if item.get("operation_id") in selected_ids]
            build_review_blend(executable, Path(str(baseline_blend_path["resolved_path"])), Path(str(edit_path["resolved_path"])), object_name, output, scopes, rebuilt)
            blender_report = verify_review_blend(executable, output, object_name, review_dir / "blender-verify.json")
            verification = verify_blender_roundtrip(
                blender_report,
                extract_payload.get("baseline_blend") or baseline,
                baseline,
                edit,
                rebuilt,
                delta,
                scopes,
                not _verify_lock(lock),
                Path(str(baseline_blend_path["resolved_path"])).resolve() != output.resolve() and Path(str(edit_path["resolved_path"])).resolve() != output.resolve(),
                float(delta.get("policy", {}).get("point_tolerance_mm", 1e-4)),
            )
            write_json(review_dir / "BLENDER_ROUNDTRIP_VERIFY.json", verification)
            artifact = str(output)
        report = {
            "schema_version": "1.0",
            "status": "PASS" if verification["status"] == "PASS" else "UNVERIFIED",
            "selected_operation_ids": selected_ids,
            "changed_material": sorted({str(item.get("scope")) for item in delta["operations"] if item.get("operation_id") in selected_ids}),
            "artifact": artifact,
            "verification": verification,
            "source_modified": False,
            "support_modified": False,
            "provenance": "DERIVED review materialization; source paths remain untouched",
        }
        write_json(run_dir / "BUILD_REVIEW.json", report)
        state = read_json(run_dir / "RUN_STATE.json")
        state.update({"status": "REVIEW_BUILT", "next_action": "verify", "stages": {**state.get("stages", {}), "build_review": report["status"]}})
        _write_state(run_dir, state)
        print(json.dumps({"run": str(run_dir), "status": report["status"], "artifact": artifact}, ensure_ascii=False))
        return 0 if report["status"] == "PASS" else 2
    except (RoundtripError, BlenderUnavailable, OSError, KeyError, StopIteration) as exc:
        print(f"build-review blocked: {exc}", file=sys.stderr)
        return 2


def _verify_lock(lock: dict[str, Any]) -> list[str]:
    errors = []
    for item in lock.get("inputs", []):
        path = Path(str(item.get("resolved_path"))) if item.get("resolved_path") else None
        if path is None or not path.is_file():
            errors.append(f"missing input: {item.get('name')}")
        elif sha256_file(path) != item.get("actual_sha256"):
            errors.append(f"input changed: {item.get('name')}")
    return errors


def cmd_verify(args: argparse.Namespace) -> int:
    run_dir = Path(args.run).resolve()
    try:
        lock = read_json(run_dir / "INPUT_LOCK.json")
        delta = read_json(run_dir / "DELTA.json")
        impact = read_json(run_dir / "IMPACT.json")
        lock_errors = _verify_lock(lock)
        review = read_json(run_dir / "BUILD_REVIEW.json") if (run_dir / "BUILD_REVIEW.json").is_file() else None
        failures = list(lock_errors)
        geometry_status = "UNVERIFIED"
        if review and review.get("artifact", "").endswith("rebuilt_extract.json"):
            extract_payload = read_json(run_dir / "EXTRACT.json")
            rebuilt = read_json(Path(review["artifact"]))
            json_check = verify_json_rebuild(extract_payload["baseline"], extract_payload["edit"], rebuilt, delta)
            failures.extend(json_check.get("failures", []))
            geometry_status = json_check["status"]
        elif review and review.get("artifact"):
            geometry_status = review.get("verification", {}).get("status", "UNVERIFIED")
        state = {
            "schema_version": "1.0",
            "status": "PASS" if not failures and review and geometry_status == "PASS" else "FAIL",
            "tool_execution": "PASS" if not failures else "FAIL",
            "mapping": delta.get("status"),
            "geometry_check": geometry_status,
            "support_validity": impact.get("support_validity", "NOT_REVALIDATED"),
            "printability": impact.get("printability", "NOT_EVALUATED"),
            "author_acceptance": impact.get("author_acceptance", "PENDING"),
            "failures": failures,
            "source_modified": False,
            "support_modified": False,
            "provenance": "DERIVED verification; no physical or author acceptance claim",
        }
        write_json(run_dir / "VERIFY.json", state)
        prior = read_json(run_dir / "RUN_STATE.json")
        prior.update({"status": "VERIFIED" if state["status"] == "PASS" else "VERIFY_FAILED", "next_action": "SOL review / Author workflow review" if state["status"] == "PASS" else "repair the reported verification failure", "stages": {**prior.get("stages", {}), "verify": state["status"]}})
        _write_state(run_dir, prior)
        print(json.dumps(state, ensure_ascii=False))
        return 0 if state["status"] == "PASS" else 2
    except (RoundtripError, OSError, KeyError) as exc:
        print(f"verify blocked: {exc}", file=sys.stderr)
        return 2


def cmd_resume(args: argparse.Namespace) -> int:
    run_dir = Path(args.run).resolve()
    try:
        state = read_json(run_dir / "RUN_STATE.json")
        lock = read_json(run_dir / "INPUT_LOCK.json")
        errors = _verify_lock(lock)
        result = {
            "run": str(run_dir),
            "status": "RESUMABLE" if not errors else "STALE_INPUT_LOCK",
            "prior_state": state.get("status"),
            "next_action": state.get("next_action"),
            "lock_errors": errors,
            "read_only": True,
        }
        write_json(run_dir / "RESUME.json", result)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if not errors else 2
    except (RoundtripError, OSError, KeyError) as exc:
        print(f"resume blocked: {exc}", file=sys.stderr)
        return 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m tools.skin_path_roundtrip")
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect = subparsers.add_parser("inspect", help="lock, extract, diff, and compute impact")
    inspect.add_argument("--manifest", required=True, type=Path)
    inspect.add_argument("--edit", type=str)
    inspect.add_argument("--roots", required=True, type=Path)
    inspect.add_argument("--out", required=True, type=Path)
    inspect.add_argument("--blender", type=str)
    inspect.set_defaults(func=cmd_inspect)
    build = subparsers.add_parser("build-review", help="materialize an explicit local review")
    build.add_argument("--run", required=True, type=Path)
    build.add_argument("--resolution", required=True, type=Path)
    build.add_argument("--blender", type=str)
    build.set_defaults(func=cmd_build_review)
    verify = subparsers.add_parser("verify", help="recheck locks and review output")
    verify.add_argument("--run", required=True, type=Path)
    verify.set_defaults(func=cmd_verify)
    resume = subparsers.add_parser("resume", help="read-only checkpoint summary")
    resume.add_argument("--run", required=True, type=Path)
    resume.set_defaults(func=cmd_resume)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))
