from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Iterable

import numpy as np


VENDOR = os.environ.get("ASTRA_RESEARCH_VENDOR")
if VENDOR and Path(VENDOR).is_dir() and VENDOR not in sys.path:
    sys.path.insert(0, VENDOR)

H = 11.0 / 15.0
FLOWER_COUNT = 2303
TARGET_SEMANTIC_SHA256 = "e48b2a1ca56d30e6d91a1f3bc14807e279b72be53b3501c6b1806926061df723"
TARGET_CANDIDATE_POOL_SHA256 = "94e084cd4aa859c33c278b7e376b04f345e58f9620ea49a17047ce418d1c24ec"
D6_SHA256 = "854ac6f30cbdfa674c284702240dc060bd68e16080dd4c22f5a1abd294ed2f2d"
HOST_SHA256 = "c44ea6883c20d1dafcde094c108f06ac2380e0f4d946356279b21a1442eb62ae"
TARGET_PLACEMENTS_SHA256 = "d118edbf8cee917242e7a8fd6745870e5fc7f3c8e8f7f3f35b804beb0291a9eb"
SOURCE_STRUCTURE_SHA256 = "e3505511dfa793d14ef6da183016a0b40bdad564c6a15241116b9d7cca81b0b2"
HOST_DOMAIN_SHA256 = "d7a4c25c6987ed7afba0e76a073108853579b5a0141ca16906c6264fb261f30c"
CORRIDORS_SHA256 = "171174d80a72ae748058ef259dac3db37be71d822bcff10c4e32bcad9b15afdc"
R4_PARAMETERS_SHA256 = "53912e3a70854bde5f7db3d798648a4bc5cb5246e59d9e010726d6a33d614acc"


class ReplayFailure(RuntimeError):
    def __init__(self, code: str, detail: str):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


def require(condition: bool, code: str, detail: str) -> None:
    if not condition:
        raise ReplayFailure(code, detail)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def digest_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def canonical_array_digest(named_arrays: dict[str, np.ndarray]) -> str:
    h = hashlib.sha256()
    for name in sorted(named_arrays):
        value = np.asarray(named_arrays[name])
        if value.dtype.kind == "f":
            value = np.asarray(value, dtype="<f8", order="C")
        elif value.dtype.kind in "iu":
            value = np.asarray(value, dtype="<i8", order="C")
        elif value.dtype.kind == "b":
            value = np.asarray(value, dtype=np.uint8, order="C")
        else:
            raise ReplayFailure("INVALID_TARGET_ARRAY", f"unsupported array: {name} ({value.dtype})")
        h.update(name.encode("utf-8") + b"\0")
        h.update(str(value.shape).encode("ascii") + b"\0")
        h.update(value.tobytes(order="C"))
    return h.hexdigest()


def ensure_new_output(path: Path) -> None:
    if path.exists():
        raise ReplayFailure("OUTPUT_ALREADY_EXISTS", f"refusing to overwrite {path}")


def validate_recipe(recipe: dict[str, Any]) -> None:
    require(recipe.get("schema") == "skin_mini_target_internal_replay_recipe_v0", "UNSUPPORTED_RECIPE", "schema")
    require(recipe.get("issue") == "satw-jp/katachi#36", "UNSUPPORTED_RECIPE", "issue authority")
    require(recipe.get("target", {}).get("flower_count") == FLOWER_COUNT, "UNSUPPORTED_RECIPE", "fixed TARGET count")
    require(recipe.get("target", {}).get("semantic_geometry_sha256") == TARGET_SEMANTIC_SHA256, "UNSUPPORTED_RECIPE", "fixed TARGET semantic hash")
    target = recipe.get("target", {})
    require(target.get("bundle") == "SKIN_MINI_A1_FLOWER_REPLAY_V0_FIX1_20260925T111000JST", "UNSUPPORTED_RECIPE", "accepted TARGET bundle")
    require(target.get("candidate_pool_sha256") == TARGET_CANDIDATE_POOL_SHA256, "UNSUPPORTED_RECIPE", "accepted candidate pool")
    require(target.get("placements_sha256") == TARGET_PLACEMENTS_SHA256, "UNSUPPORTED_RECIPE", "accepted placement bytes")
    require(target.get("D6_sha256") == D6_SHA256, "UNSUPPORTED_RECIPE", "accepted D6")
    require(target.get("Host_sha256") == HOST_SHA256, "UNSUPPORTED_RECIPE", "accepted Host")
    require(recipe.get("source") == {
        "structure_sha256": SOURCE_STRUCTURE_SHA256,
        "member_count": 4240,
        "retained_role_counts": {"SHARED_CORE": 95, "ROOT_ADDITION": 2, "INTERNAL_SPATIAL_LINK": 9},
    }, "UNSUPPORTED_RECIPE", "R4 source core identity")
    rules = recipe.get("rule_versions", {})
    expected = {
        "natural_contact": "r4-v2-manifold-actual-d6-v0",
        "host_core_transfer": "r4-a-short-join-g-core-subset-h-scale-v0",
        "twig_attachment": "r4-v3-component-greedy-sharing-v0",
        "a_short_normal": "r4-author-a-short-normal-rule-v0",
        "ascending_bypass": "r4-a-short-join-g-new-graph-v0",
        "chronology": "r4-v2-geometry-raster-rooted-v0",
    }
    require(all(rules.get(key) == value for key, value in expected.items()), "UNSUPPORTED_RECIPE", "rule version")
    require(recipe.get("host_uniform_scale") == H, "UNSUPPORTED_RECIPE", "Host scale H")
    require(recipe.get("print_assembly") == {
        "bed_plane_source": "inputs/target/host.npz minimum-Z datum",
        "uniform_scale": H,
        "translation_z_mm": 0.0,
        "bed_plane_rule": "locked Host datum transformed in the Issue #36 assembly frame",
    }, "UNSUPPORTED_RECIPE", "print assembly bed-plane binding")
    require(recipe.get("ordered_stages") == ["natural contacts", "Host/core transfer", "twig/flower attachment", "A_SHORT_NORMAL", "ascending bypass", "static verification", "0.2 mm geometry-only chronology"], "UNSUPPORTED_RECIPE", "ordered R4 recipe")
    expected_parameters = {
        "positive_contact_volume": 1e-8,
        "hull_reject_volume": 1e-9,
        "main_diameter": 2.2,
        "core_sampling_spacing": 3.0 * H,
        "core_depth": 14.0 * H,
        "core_spacing": 30.0 * H,
        "core_max_edge": 58.0 * H,
        "twig_group_radius": 11.0 * H,
        "twig_max_group_size": 8,
        "twig_inward_candidates": [7.0 * H, 11.0 * H, 15.0 * H],
        "twig_down_candidates": [0.0, 4.0 * H, 8.0 * H],
        "twig_normal_dot_min_exclusive": 0.7,
        "twig_core_nearest_samples": 12,
        "a_short_normal_angle_threshold_deg": 30.0,
        "a_short_normal_run_max": 4.0 * H,
        "a_short_normal_run_fraction_max": 0.6,
        "a_short_normal_parent_collar_max": 2.0 * H,
        "a_short_normal_taper_length": 3.0 * H,
        "bypass_port_depth": 18.0 * H,
        "bypass_path_depth": 14.0 * H,
        "bypass_material_depth": 11.0 * H,
        "bypass_length_min": 8.0 * H,
        "bypass_length_max": 26.0 * H,
        "bypass_rise_min": 6.0 * H,
        "bypass_crowd_spacing": 8.0 * H,
        "bypass_endpoint_overlap_min": 0.1 * H**3,
        "bypass_slope_min_rise_over_horizontal": 0.7,
        "bypass_distinct_parent_lineage": True,
        "bypass_max_per_lower": 2,
        "bypass_max_per_upper": 1,
        "bypass_total_cap": None,
        "chronology_layer_step_mm": 0.2,
        "chronology_xy_sampling_mm": 0.3,
    }
    require(recipe.get("parameters_mini_mm") == expected_parameters, "UNSUPPORTED_RECIPE", "explicit R4 parameters")
    require(recipe.get("exclusions") == [
        "LR001-LR003: NOT_GENERATED",
        "R3 root reinforcement: NOT_GENERATED",
        "authored removable Support: NOT_GENERATED",
        "automatic Support: NOT_GENERATED",
        "STL/3MF package: NOT_GENERATED",
        "slice/Runner/G-code/Send/Print: NOT_RUN",
        "Issue #35 geometry/patches: NOT_USED",
    ], "UNSUPPORTED_RECIPE", "explicit exclusions")
    require(isinstance(recipe.get("input_files"), dict) and recipe["input_files"], "UNSUPPORTED_RECIPE", "input lock")
    require(isinstance(recipe.get("tool_code_sha256"), dict) and recipe["tool_code_sha256"], "UNSUPPORTED_RECIPE", "tool code lock")
    require(recipe.get("manual_geometry_edits") == 0 and recipe.get("AI_geometry_transformations") == 0 and recipe.get("explicit_recipe") is True, "UNSUPPORTED_RECIPE", "geometry transformation policy")


def verify_code_snapshot(tool_dir: Path, expected: dict[str, str]) -> dict[str, str]:
    observed: dict[str, str] = {}
    for name, digest in expected.items():
        path = tool_dir / name
        require(path.is_file(), "CODE_SNAPSHOT_MISMATCH", f"missing {name}")
        observed[name] = sha256_file(path)
        require(observed[name] == digest, "CODE_SNAPSHOT_MISMATCH", name)
    return observed


def validate_core_source(members: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    ids = [m.get("id") for m in members]
    require(all(isinstance(mid, str) and mid for mid in ids), "CORE_TOPOLOGY_MISMATCH", "empty member ID")
    require(len(ids) == len(set(ids)), "CORE_TOPOLOGY_MISMATCH", "duplicate source member ID")
    expected_roles = {"SHARED_CORE": 95, "ROOT_ADDITION": 2, "INTERNAL_SPATIAL_LINK": 9}
    observed = {role: sum(m.get("kind") == role for m in members) for role in expected_roles}
    require(observed == expected_roles, "CORE_TOPOLOGY_MISMATCH", f"retained role counts {observed}")
    by_id = {m["id"]: m for m in members}
    retained = [m for m in members if m.get("kind") in expected_roles]
    retained_ids = {m["id"] for m in retained}
    external_endpoints: list[dict[str, str]] = []
    for m in retained:
        points = np.asarray(m.get("points_mm"), dtype=np.float64)
        require(points.ndim == 2 and points.shape[1] == 3 and len(points) >= 2 and np.isfinite(points).all(), "CORE_TOPOLOGY_MISMATCH", f"invalid centerline {m['id']}")
        require(float(np.linalg.norm(np.diff(points, axis=0), axis=1).sum()) > 0, "CORE_TOPOLOGY_MISMATCH", f"zero-length member {m['id']}")
        if m["kind"] == "ROOT_ADDITION":
            require(m.get("parent_id") == "BED", "CORE_TOPOLOGY_MISMATCH", f"root parent {m['id']}")
        elif m["kind"] == "SHARED_CORE":
            require(m.get("parent_id") in retained_ids, "CORE_TOPOLOGY_MISMATCH", f"unproven core parent {m['id']}->{m.get('parent_id')}")
        else:
            endpoints = [m.get("parent_id"), m.get("target_id")]
            connected_core = [x for x in endpoints if x in retained_ids]
            junctions = [x for x in endpoints if isinstance(x, str) and x.startswith("AUTHOR_JUNCTION_")]
            require(bool(connected_core) or bool(junctions), "CORE_TOPOLOGY_MISMATCH", f"no proven retained endpoint for {m['id']}")
            for endpoint in endpoints:
                if endpoint and endpoint not in retained_ids and not endpoint.startswith("AUTHOR_JUNCTION_"):
                    external_endpoints.append({"member_id": m["id"], "source_endpoint_id": endpoint, "disposition": "old flower-dependent endpoint excluded; no nearest remap"})
    require(len(retained) == 106, "CORE_TOPOLOGY_MISMATCH", "expected 106 retained members")
    return retained, external_endpoints


def validate_inputs(recipe_dir: Path, recipe: dict[str, Any]) -> dict[str, Any]:
    try:
        lock_manifest = json.loads((recipe_dir / "INPUT_LOCK.json").read_text(encoding="utf-8"))
    except Exception as exc:
        raise ReplayFailure("INPUT_HASH_MISMATCH", f"INPUT_LOCK.json: {exc}") from exc
    require(lock_manifest.get("schema") == "skin_mini_target_internal_replay_input_lock_v0", "INPUT_HASH_MISMATCH", "input lock schema")
    require(lock_manifest.get("target") == recipe.get("target"), "INPUT_HASH_MISMATCH", "fixed target input lock")
    require(lock_manifest.get("R4_source", {}).get("structure_sha256") == SOURCE_STRUCTURE_SHA256 and lock_manifest.get("R4_source", {}).get("member_count") == 4240, "INPUT_HASH_MISMATCH", "fixed R4 input lock")
    require(lock_manifest.get("file_count") == len(recipe["input_files"]), "INPUT_HASH_MISMATCH", "input file count")
    require(lock_manifest.get("total_source_bytes") == sum(x.get("bytes", 0) for x in recipe["input_files"].values()), "INPUT_HASH_MISMATCH", "input bytes total")
    require(set(lock_manifest.get("files", {})) == set(recipe.get("input_files", {})), "INPUT_HASH_MISMATCH", "input lock/recipe file set")
    for name, recipe_lock in recipe["input_files"].items():
        lock_file = lock_manifest["files"].get(name, {})
        require(lock_file.get("bytes") == recipe_lock.get("bytes") and lock_file.get("sha256") == recipe_lock.get("sha256"), "INPUT_HASH_MISMATCH", f"input lock/recipe identity {name}")
    actual_input_files = {p.relative_to(recipe_dir).as_posix() for p in (recipe_dir / "inputs").rglob("*") if p.is_file()}
    require(actual_input_files == set(recipe["input_files"]), "INPUT_HASH_MISMATCH", "unlocked or missing input files")
    observed_files: dict[str, dict[str, Any]] = {}
    paths: dict[str, Path] = {}
    for name, lock in recipe["input_files"].items():
        path = recipe_dir / Path(name)
        require(path.is_file(), "INPUT_HASH_MISMATCH", f"missing {name}")
        size = path.stat().st_size
        digest = sha256_file(path)
        observed_files[name] = {"bytes": size, "sha256": digest, "source": lock.get("source", {})}
        require(size == lock.get("bytes") and digest == lock.get("sha256"), "INPUT_HASH_MISMATCH", name)
        paths[name] = path

    expected_files = {
        "inputs/target/placements.npz": TARGET_PLACEMENTS_SHA256,
        "inputs/target/D6_local.npz": D6_SHA256,
        "inputs/target/host.npz": HOST_SHA256,
        "inputs/r4/structure.json": SOURCE_STRUCTURE_SHA256,
        "inputs/r4/host_domain.npz": HOST_DOMAIN_SHA256,
        "inputs/r4/protected_corridors.json": CORRIDORS_SHA256,
        "inputs/r4/parameters.json": R4_PARAMETERS_SHA256,
    }
    for name, digest in expected_files.items():
        require(observed_files.get(name, {}).get("sha256") == digest, "INPUT_HASH_MISMATCH", f"Issue-fixed identity {name}")

    placements_path = paths["inputs/target/placements.npz"]
    anchors_path = paths["inputs/target/flower_back_anchors.json"]
    surface_path = paths["inputs/target/surface.json"]
    d6_path = paths["inputs/target/D6_local.npz"]
    host_path = paths["inputs/target/host.npz"]
    source_path = paths["inputs/r4/structure.json"]
    placements: dict[str, np.ndarray] = {}
    try:
        with np.load(placements_path, allow_pickle=False) as archive:
            placements = {key: np.asarray(archive[key]) for key in archive.files}
    except Exception as exc:
        raise ReplayFailure("INVALID_TARGET_ARRAY", f"placements.npz: {exc}") from exc
    required_arrays = {"position_mm", "normal", "rotation_matrix", "physical_scale", "anchor_world_mm", "bbox_min_mm", "bbox_max_mm"}
    require(required_arrays.issubset(placements), "INVALID_TARGET_ARRAY", "missing placement arrays")
    require(len(placements["position_mm"]) == FLOWER_COUNT, "FLOWER_COUNT_MISMATCH", str(len(placements["position_mm"])))
    for name, value in placements.items():
        require(np.isfinite(value).all(), "NONFINITE_GEOMETRY", f"placements.{name}")
    semantic = canonical_array_digest(placements)
    require(semantic == TARGET_SEMANTIC_SHA256, "INPUT_HASH_MISMATCH", f"TARGET semantic geometry {semantic}")

    try:
        anchors = json.loads(anchors_path.read_text(encoding="utf-8"))
        surface = json.loads(surface_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ReplayFailure("ANCHOR_BINDING_MISMATCH", f"invalid JSON mirror: {exc}") from exc
    items = anchors.get("items", [])
    instances = surface.get("instances", [])
    require(len(items) == FLOWER_COUNT, "ANCHOR_BINDING_MISMATCH", f"anchor count {len(items)}")
    require(len(instances) == FLOWER_COUNT, "ANCHOR_BINDING_MISMATCH", f"surface mirror count {len(instances)}")
    ids = [row.get("instance_id") for row in items]
    surface_ids = [row.get("instance_id") for row in instances]
    require(all(isinstance(x, str) and x for x in ids), "ANCHOR_BINDING_MISMATCH", "missing flower ID")
    require(len(ids) == len(set(ids)), "DUPLICATE_FLOWER_ID", "anchor instance IDs")
    require(surface_ids == ids and len(surface_ids) == len(set(surface_ids)), "ANCHOR_BINDING_MISMATCH", "surface mirror ID/order")
    require(anchors.get("status") == "CONNECTED_GEOMETRY_NOT_GENERATED" or all(x.get("connected_geometry") is False for x in items), "ANCHOR_BINDING_MISMATCH", "initial anchors must be unconnected")
    for i, anchor in enumerate(items):
        target_anchor = np.asarray(anchor.get("anchor_world_mm"), dtype=np.float64)
        require(target_anchor.shape == (3,) and np.isfinite(target_anchor).all(), "ANCHOR_BINDING_MISMATCH", ids[i])
        require(np.array_equal(target_anchor, placements["anchor_world_mm"][i]), "PLACEMENTS_ANCHOR_MISMATCH", ids[i])
        require(np.array_equal(np.asarray(instances[i].get("anchor_world_mm"), dtype=np.float64), target_anchor), "PLACEMENTS_ANCHOR_MISMATCH", f"surface:{ids[i]}")
        require(instances[i].get("source_size_index") == int(placements["source_size_index"][i]), "PLACEMENTS_ANCHOR_MISMATCH", f"size index:{ids[i]}")
        require(instances[i].get("source_motif_id") == int(placements["source_motif_id"][i]), "PLACEMENTS_ANCHOR_MISMATCH", f"motif ID:{ids[i]}")

    for path, label in ((d6_path, "D6"), (host_path, "Host")):
        try:
            with np.load(path, allow_pickle=False) as archive:
                vertices = np.asarray(archive["vertices"])
                faces = np.asarray(archive["faces"])
        except Exception as exc:
            raise ReplayFailure("MISSING_D6_TEMPLATE" if label == "D6" else "INVALID_HOST_MESH", str(exc)) from exc
        require(vertices.ndim == 2 and vertices.shape[1] == 3 and len(vertices) > 0, "NONFINITE_GEOMETRY", f"{label} vertices")
        require(faces.ndim == 2 and faces.shape[1] == 3 and len(faces) > 0, "NONFINITE_GEOMETRY", f"{label} faces")
        require(np.isfinite(vertices).all(), "NONFINITE_GEOMETRY", f"{label} vertices")
        require(np.all(faces >= 0) and np.all(faces < len(vertices)), "NONFINITE_GEOMETRY", f"{label} face index")

    source_structure = json.loads(source_path.read_text(encoding="utf-8"))
    source_members = source_structure.get("members", [])
    source_ids = [m.get("id") for m in source_members]
    require(len(source_ids) == 4240 and len(source_ids) == len(set(source_ids)), "CORE_TOPOLOGY_MISMATCH", "source member count or identity")
    core, external_endpoints = validate_core_source(source_members)
    require(not ({m["id"] for m in core} & set(ids)), "CORE_TOPOLOGY_MISMATCH", "core/flower ID collision")
    return {
        "paths": paths,
        "print_assembly": recipe["print_assembly"],
        "files": observed_files,
        "placements": placements,
        "flower_ids": ids,
        "anchors": items,
        "surface_mirror": surface,
        "d6_path": d6_path,
        "host_path": host_path,
        "source_structure": source_structure,
        "source_members": source_members,
        "core_members": core,
        "excluded_old_endpoints": external_endpoints,
        "target_semantic_sha256": semantic,
    }


def stable_unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(values))
