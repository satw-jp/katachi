from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .compare import compare_support
from .contracts import ContractError, EXIT_ERROR, EXIT_HOLD, EXIT_OK, Hold
from .planner import unresolved_generation_stages
from .mesh_backend import inspect_geometry_runtime
from .run_metrics import finish_metrics, start_timer
from .source_io import check_asset, read_json, resolve_asset
from .stage_registry import resolve_stage
from .stages.v4_d2 import checkpoint_snapshot, compare_v4_d2_checkpoint


PRESET = Path(__file__).parent / "presets" / "minia_legacy_v1"


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _new_output(path: Path) -> Path:
    path = path.resolve(strict=False)
    if path.exists():
        raise ContractError(f"output already exists; refusing overwrite: {path}")
    path.mkdir(parents=True)
    return path


def _load_contracts(case_path: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    case = read_json(case_path)
    preset = case_path.parent
    recipe = read_json(preset / "RECIPE.json")
    overrides = read_json(preset / "OVERRIDES.json")
    source_map = read_json(preset / "SOURCE_RULE_MAP.json")
    return case, recipe, overrides, source_map


def _inspect(case_path: Path, roots_path: Path, out: Path) -> int:
    started = start_timer()
    case, recipe, overrides, source_map = _load_contracts(case_path)
    roots = read_json(roots_path)
    checks = [check_asset(asset, roots) for asset in case.get("inputs", [])]
    missing = [item for item in checks if item["status"] != "PASS"]
    runtime = inspect_geometry_runtime(roots.get("roots", {}).get("geometry_runtime"))
    holds = unresolved_generation_stages_for_report(source_map)
    status = "READY_FOR_GENERATION" if not missing and not holds and runtime["status"] == "PASS" else "HOLD"
    output = _new_output(out)
    report = {
        "schema_version": "authored-support-v1",
        "tool_version": __version__,
        "command": "inspect",
        "case_id": case.get("case_id"),
        "status": status,
        "source_checks": checks,
        "geometry_runtime": runtime,
        "unresolved_generation_stages": holds,
        "recipe_id": recipe.get("recipe_id"),
        "override_count": len(overrides.get("operations", [])),
        "golden_read": False,
        "network_used": False,
        "external_processes_started": False,
        "run_metrics": finish_metrics(started),
    }
    _write_json(output / "INSPECT.json", report)
    return EXIT_OK if status == "READY_FOR_GENERATION" else EXIT_HOLD


def unresolved_generation_stages_for_report(source_map: dict[str, Any]) -> list[dict[str, str]]:
    return [hold.as_dict() for hold in unresolved_generation_stages(source_map)]


def _build(case_path: Path, roots_path: Path, out: Path) -> int:
    started = start_timer()
    # This intentionally never opens GOLDEN.json or a path from it.
    case, recipe, overrides, source_map = _load_contracts(case_path)
    roots = read_json(roots_path)
    source_checks = [check_asset(asset, roots) for asset in case.get("inputs", [])]
    holds = unresolved_generation_stages_for_report(source_map)
    holds.extend(
        {
            "code": item["reason"],
            "message": f"Pinned source input failed verification: {item['logical_name']}",
            "subject": item["logical_name"],
        }
        for item in source_checks
        if item["status"] != "PASS"
    )
    runtime = inspect_geometry_runtime(roots.get("roots", {}).get("geometry_runtime"))
    if runtime["status"] != "PASS":
        holds.append(
            {
                "code": runtime["reason"],
                "message": runtime.get("detail", "Pinned geometry runtime is unavailable."),
                "subject": "geometry_runtime",
            }
        )
    output = _new_output(out)
    _write_json(
        output / "SOURCE_LOCK.json",
        {"case_id": case.get("case_id"), "inputs": source_checks, "geometry_runtime": runtime},
    )
    _write_json(output / "RECIPE_RESOLVED.json", recipe)
    _write_json(output / "OVERRIDES_APPLIED.json", {"case_id": case.get("case_id"), "applied": [], "status": "NOT_RUN"})
    metrics = finish_metrics(started)
    _write_json(
        output / "INCOMPLETE.json",
        {
            "schema_version": "authored-support-v1",
            "tool_version": __version__,
            "command": "build",
            "status": "HOLD",
            "holds": holds,
            "generated_support_objects": False,
            "golden_read": False,
            "network_used": False,
            "external_processes_started": False,
            "run_metrics": metrics,
        },
    )
    (output / "RESULT.md").write_text(
        "# MINI_A authored Support build: HOLD\n\n"
        f"Elapsed: {metrics['elapsed_seconds']} seconds. Peak process memory: "
        f"{metrics['peak_process_memory_bytes']} bytes ({metrics['memory_metric']}; "
        f"available={metrics['memory_available']}).\n\n"
        "The input locks were checked. No Support plan or mesh was generated because "
        "one or more source generation stages are not yet available as package callables. "
        "The golden reference was not read.\n",
        encoding="utf-8",
    )
    return EXIT_HOLD


def _verify(run_path: Path, golden_path: Path, roots_path: Path, out: Path) -> int:
    started = start_timer()
    roots = read_json(roots_path)
    golden = read_json(golden_path)
    actual_file = run_path / "support_geometry.json"
    if not actual_file.is_file():
        output = _new_output(out)
        result = {
            "status": "HOLD",
            "reason": "GENERATED_SUPPORT_GEOMETRY_MISSING",
            "plan_equal": False,
            "mesh_comparison": "NOT_RUN",
            "native_part_comparison": "NOT_RUN",
        }
        _write_json(output / "REPLAY_COMPARISON.json", result)
        return EXIT_HOLD
    expected_path = resolve_asset(golden["support_geometry"], roots)
    actual = read_json(actual_file)
    expected = read_json(expected_path)
    result = compare_support(actual, expected)
    result["mesh_comparison"] = "NOT_RUN"
    result["native_part_comparison"] = "NOT_RUN"
    result["run_metrics"] = finish_metrics(started)
    if result.get("status") == "PASS":
        result["status"] = "HOLD"
        result["reason"] = "MESH_OR_NATIVE_COMPARISON_NOT_RUN"
    output = _new_output(out)
    _write_json(output / "REPLAY_COMPARISON.json", result)
    return EXIT_HOLD


def _replay(case_path: Path, roots_path: Path, out: Path) -> int:
    started = start_timer()
    output = _new_output(out)
    build_out = output / "build"
    code = _build(case_path, roots_path, build_out)
    _write_json(
        output / "REPLAY.json",
        {
            "command": "replay",
            "status": "HOLD",
            "build_exit_code": code,
            "verify": "SKIPPED_BUILD_HOLD",
            "success_stop": "MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_READY",
            "hold_stop": "MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_HOLD",
            "run_metrics": finish_metrics(started),
        },
    )
    return EXIT_HOLD


def _run_v4_d2(case_path: Path, roots_path: Path, out: Path) -> int:
    started = start_timer()
    case, recipe, _overrides, source_map = _load_contracts(case_path)
    roots = read_json(roots_path)
    outputs_root = Path(roots.get("roots", {}).get("outputs", "")).expanduser().resolve(strict=False)
    output_resolved = out.resolve(strict=False)
    if output_resolved == outputs_root or outputs_root in output_resolved.parents:
        raise ContractError("V4 D2 output must be outside the frozen source outputs root")
    stage, holds = resolve_stage(
        "V4_D2_SUPPORT_GENERATION", case=case, recipe=recipe, source_map=source_map
    )
    if holds or stage is None:
        output = _new_output(out)
        _write_json(output / "V4_D2_STAGE.json", {
            "stage_id": "V4_D2_SUPPORT_GENERATION",
            "status": "MINIA_AUTHORED_SUPPORT_V4_D2_HOLD",
            "holds": [hold.as_dict() for hold in holds],
            "checkpoint_read_during_generation": False,
        })
        return EXIT_HOLD

    checkpoint_root = outputs_root / "R4_V2_V3_A1_EXPERIMENTAL_V4"
    output = _new_output(out)
    preset_dir = case_path.resolve().parent
    checkpoint_before = checkpoint_snapshot(checkpoint_root, preset_dir)
    stage_result = stage(
        case=case,
        recipe=recipe,
        source_map=source_map,
        roots=roots,
        output_dir=output,
        preset_dir=preset_dir,
    )
    runtime_root = Path(roots.get("roots", {}).get("geometry_runtime", ""))
    from .mesh_backend import ManifoldKernel

    kernel = ManifoldKernel.from_runtime_root(runtime_root)
    comparison = compare_v4_d2_checkpoint(
        output_dir=output,
        checkpoint_root=checkpoint_root,
        preset_dir=preset_dir,
        kernel=kernel,
    )
    checkpoint_after = checkpoint_snapshot(checkpoint_root, preset_dir)
    originals_unchanged = checkpoint_before == checkpoint_after
    comparison["checks"]["saved_checkpoint_files_unchanged"] = originals_unchanged
    comparison["saved_checkpoint_files_before"] = checkpoint_before
    comparison["saved_checkpoint_files_after"] = checkpoint_after
    if not originals_unchanged or not all(comparison["checks"].values()):
        comparison["status"] = "MINIA_AUTHORED_SUPPORT_V4_D2_HOLD"
    stage_result["status"] = comparison["status"]
    stage_result["checkpoint_read_during_generation"] = False
    stage_result["checkpoint_comparison"] = "completed_after_generation"
    stage_result["saved_checkpoint_files_unchanged"] = originals_unchanged
    stage_result["run_metrics"] = finish_metrics(started)
    _write_json(output / "V4_D2_STAGE.json", stage_result)
    _write_json(output / "CHECKPOINT_COMPARISON.json", comparison)
    _write_json(output / "STOP.json", {
        "status": comparison["status"],
        "scope": "V4 D2 limited replay review only",
        "full_mini_a_replay_ready": False,
        "v7_or_later_stage_executed": False,
        "minil_applied": False,
        "slice_count": 0,
        "send_count": 0,
        "print_count": 0,
    })
    (output / "RESULT.md").write_text(
        "# V4 D2 limited replay\n\n"
        f"STOP: `{comparison['status']}`.\n\n"
        f"Candidates: {comparison['candidate_count']}; exact mesh matches: "
        f"{comparison['mesh_arrays']['matching_count']}/{comparison['mesh_arrays']['candidate_count']}.\n\n"
        "This limited result does not establish full MINI_A Support replay readiness. "
        "V7+, MINIL, slice, Send, and Print were not run.\n",
        encoding="utf-8",
    )
    return EXIT_OK if comparison["status"] == "MINIA_AUTHORED_SUPPORT_V4_D2_REPLAY_READY_FOR_REVIEW" else EXIT_HOLD


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m tools.authored_support")
    sub = parser.add_subparsers(dest="command", required=True)
    inspect = sub.add_parser("inspect", help="check the fixed case input locks")
    inspect.add_argument("--case", type=Path, default=PRESET / "CASE.json")
    inspect.add_argument("--roots", type=Path, required=True)
    inspect.add_argument("--out", type=Path, required=True)
    build = sub.add_parser("build", help="build a new isolated authored-support run")
    build.add_argument("--case", type=Path, default=PRESET / "CASE.json")
    build.add_argument("--roots", type=Path, required=True)
    build.add_argument("--out", type=Path, required=True)
    verify = sub.add_parser("verify", help="compare a generated plan to the read-only golden")
    verify.add_argument("--run", type=Path, required=True)
    verify.add_argument("--golden", type=Path, default=PRESET / "GOLDEN.json")
    verify.add_argument("--roots", type=Path, required=True)
    verify.add_argument("--out", type=Path, required=True)
    replay = sub.add_parser("replay", help="build then compare in one isolated run")
    replay.add_argument("--case", type=Path, default=PRESET / "CASE.json")
    replay.add_argument("--golden", type=Path, default=PRESET / "GOLDEN.json")
    replay.add_argument("--roots", type=Path, required=True)
    replay.add_argument("--out", type=Path, required=True)
    v4_d2 = sub.add_parser("v4-d2", help="regenerate and compare only the source-bound V4 D2 stage")
    v4_d2.add_argument("--case", type=Path, default=PRESET / "CASE.json")
    v4_d2.add_argument("--roots", type=Path, required=True)
    v4_d2.add_argument("--out", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "inspect":
            return _inspect(args.case, args.roots, args.out)
        if args.command == "build":
            return _build(args.case, args.roots, args.out)
        if args.command == "verify":
            return _verify(args.run, args.golden, args.roots, args.out)
        if args.command == "replay":
            # golden is intentionally deferred until a build completes.
            return _replay(args.case, args.roots, args.out)
        if args.command == "v4-d2":
            return _run_v4_d2(args.case, args.roots, args.out)
    except (ContractError, OSError, KeyError, TypeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return EXIT_ERROR
    return EXIT_ERROR


