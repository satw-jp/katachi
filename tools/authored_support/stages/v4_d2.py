from __future__ import annotations

import hashlib
import importlib
import json
import math
from pathlib import Path
from typing import Any

from ..contracts import ContractError
from ..mesh_backend import ManifoldKernel
from ..source_io import read_json, sha256_file


LEGACY_SOURCE_CODE_SHA256 = {
    "R4_V2_V3_A1_EXPERIMENTAL_V4/reproduce/prepare.py": "41b3a945420131936d65c4edc4b055baded80c2d51a2c527f3bf553687e5ee84",
    "R4_V2_V3_A1_EXPERIMENTAL_V4/reproduce/additions.py": "17125efa3a19175e437243c5494e3c50769e9fbe330f1ddd374b3e469bac9b31",
    "R4_V2_V3_A1_EXPERIMENTAL_V4/reproduce/removal_below.py": "ca8fc76181c44d22415a8c9f3b8cdc623e7a332954bf43a1bf3a6c5e2e893149",
}


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=_json_default) + "\n", encoding="utf-8")


def _json_default(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    raise TypeError(f"unsupported JSON value: {type(value).__name__}")


def _path_key(path: Path) -> str:
    return str(path.resolve(strict=False)).casefold()


def _relative_source_path(path: Path, outputs_root: Path) -> str:
    try:
        return path.resolve().relative_to(outputs_root.resolve()).as_posix()
    except ValueError as exc:
        raise ContractError(f"source file is outside the outputs root: {path}") from exc


def _sha_tree(rows: list[tuple[str, str]]) -> str:
    digest = hashlib.sha256()
    for relative, sha in sorted(rows):
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def _load_source_snapshot(
    *, outputs_root: Path, preset_dir: Path, source_map: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Path], dict[str, str]]:
    input_lock = read_json(preset_dir / "V4_D2_INPUT_LOCK.json")
    if input_lock.get("stage_id") != "V4_D2_SUPPORT_GENERATION":
        raise ContractError("V4 D2 source input lock is bound to a different stage")
    manifest_info = input_lock["source_manifest"]
    manifest_path = outputs_root / Path(manifest_info["path"])
    if sha256_file(manifest_path) != manifest_info["sha256"]:
        raise ContractError("the frozen upstream source hash index does not match its pinned SHA-256")
    manifest = read_json(manifest_path)
    if len(manifest) != manifest_info["entry_count"]:
        raise ContractError("the frozen upstream source hash index entry count changed")
    manifest_hashes = {_path_key(Path(row["path"])): str(row["sha256"]).lower() for row in manifest}

    paths: dict[str, Path] = {}
    expected: dict[str, str] = {}
    input_rows = input_lock.get("inputs", [])
    for item in input_rows:
        logical_name = str(item["logical_name"])
        path = outputs_root / Path(item["path"])
        expected_sha = str(item["sha256"]).lower()
        manifest_sha = manifest_hashes.get(_path_key(path))
        if not path.is_file() or sha256_file(path) != expected_sha or manifest_sha != expected_sha:
            raise ContractError(f"pinned V4 D2 source input changed: {logical_name}")
        paths[logical_name] = path
        expected[_relative_source_path(path, outputs_root)] = expected_sha

    mesh_tree = input_lock["member_mesh_tree"]
    member_root = outputs_root / Path(mesh_tree["path"])
    prefix_path = member_root.resolve()
    member_expected: dict[str, str] = {}
    for row in manifest:
        row_path = Path(row["path"]).resolve(strict=False)
        try:
            relative = row_path.relative_to(prefix_path).as_posix()
        except ValueError:
            continue
        if relative.lower().endswith(".npz"):
            member_expected[relative] = str(row["sha256"]).lower()
    member_files = sorted(member_root.glob("*.npz"), key=lambda item: item.name)
    if len(member_files) != mesh_tree["file_count"] or len(member_files) != len(member_expected):
        raise ContractError("the pinned V3 member mesh file set changed")
    for path in member_files:
        relative = path.name
        expected_sha = member_expected.get(relative)
        if expected_sha is None or sha256_file(path) != expected_sha:
            raise ContractError(f"pinned V3 member mesh changed: {relative}")
        expected[_relative_source_path(path, outputs_root)] = expected_sha

    snapshot = {
        "frozen_source_manifest_sha256": manifest_info["sha256"],
        "input_file_count": len(expected),
        "input_tree_sha256": _sha_tree(list(expected.items())),
        "inputs": [{"path": path, "sha256": sha} for path, sha in sorted(expected.items())],
    }
    return snapshot, paths, expected


def _verify_legacy_source_code(outputs_root: Path, source_map: dict[str, Any]) -> list[dict[str, str]]:
    stage = next(
        (row for row in source_map.get("observed_lineage", []) if row.get("stage_id") == "V4_D2_SUPPORT_GENERATION"),
        None,
    )
    if stage is None:
        raise ContractError("V4 D2 source map row is missing")
    rows = []
    for relative, expected in sorted(LEGACY_SOURCE_CODE_SHA256.items()):
        path = outputs_root / Path(relative)
        actual = sha256_file(path)
        mapped = next((item for item in stage.get("source_code", []) if item.get("path") == relative), None)
        if actual != expected or mapped is None or str(mapped.get("sha256", "")).lower() != expected:
            raise ContractError(f"pinned V4 D2 source algorithm changed: {relative}")
        rows.append({"path": relative, "sha256": actual})
    return rows


def _section_pixels(tri: Any, zmin: Any, zmax: Any, z: float, origin: Any, pitch: float, shape: Any, np: Any) -> Any:
    selected = (zmin < z) & (zmax > z)
    triangles = tri[selected]
    if not len(triangles):
        return np.empty(0, np.int32)
    a = triangles
    b = np.roll(triangles, -1, axis=1)
    hit = (a[:, :, 2] <= z) != (b[:, :, 2] <= z)
    u = (z - a[:, :, 2]) / (b[:, :, 2] - a[:, :, 2] + 1e-30)
    points = a + (b - a) * u[:, :, None]
    segments = points[hit].reshape(-1, 2, 3)[:, :, :2]
    y0 = max(0, int(np.floor((segments[:, :, 1].min() - origin[1]) / pitch)))
    y1 = min(shape[1] - 1, int(np.ceil((segments[:, :, 1].max() - origin[1]) / pitch)))
    ys = origin[1] + (np.arange(y0, y1 + 1) + 0.5) * pitch
    a = segments[:, 0]
    b = segments[:, 1]
    hit = (a[:, 1, None] <= ys) != (b[:, 1, None] <= ys)
    xx = a[:, 0, None] + (ys - a[:, 1, None]) * (b[:, 0] - a[:, 0])[:, None] / ((b[:, 1] - a[:, 1])[:, None] + 1e-30)
    rows, columns = np.nonzero(hit)
    xx = xx[rows, columns]
    crossings = np.ceil((xx - origin[0]) / pitch - 0.5).astype(int)
    crossings = np.clip(crossings, 0, shape[0])
    counts = np.zeros((len(ys), shape[0] + 1), np.uint16)
    np.add.at(counts, (columns, crossings), 1)
    mask = (np.cumsum(counts[:, :-1], axis=1) % 2).astype(bool)
    row_ids, column_ids = np.nonzero(mask)
    return ((row_ids + y0) * shape[0] + column_ids).astype(np.int32)


def _rebuild_vertical_first_material(
    *,
    paths: dict[str, Path],
    v3_root: Path,
    output_dir: Path,
    np: Any,
) -> dict[str, Any]:
    structure = read_json(paths["upstream_structure"])
    surface = read_json(paths["upstream_section_surface"])["surface"]
    births = read_json(paths["upstream_object_births"])
    summary = read_json(paths["upstream_layer_summary"])
    surface_by_id = {item["id"]: item for item in surface}
    members_by_id = {item["id"]: item for item in structure["members"]}
    template_path = paths["flower_template_mesh"]
    with np.load(template_path) as template:
        flower_vertices = template["vertices"].copy()
        flower_faces = template["faces"].copy()

    lower = np.array(summary["bounds_mm"][0])
    upper = np.array(summary["bounds_mm"][1])
    bed = float(structure["bed_z_mm"])
    pitch = 0.3
    origin = lower[:2] - pitch * 2
    shape = np.ceil((upper[:2] - origin + pitch * 2) / pitch).astype(int)
    layer_count = int(summary["layers"])
    lowest = np.full(shape[::-1], 65535, np.uint16)
    member_dir = v3_root / "data/members"
    for index, birth in enumerate(births):
        object_id = birth["id"]
        if object_id in surface_by_id:
            item = surface_by_id[object_id]
            vertices = flower_vertices * float(item["scale"]) @ np.array(item["rotation"]).T + np.array(item["origin_mm"])
            faces = flower_faces
        elif object_id in members_by_id:
            path = member_dir / f"{object_id}.npz"
            with np.load(path) as mesh:
                vertices = mesh["vertices"].copy()
                faces = mesh["faces"].copy()
        else:
            raise ContractError(f"V3 birth record has no source geometry: {object_id}")
        triangles = vertices[faces]
        zmin = triangles[:, :, 2].min(1)
        zmax = triangles[:, :, 2].max(1)
        first = max(0, int(np.ceil((vertices[:, 2].min() - bed) / 0.2 - 0.5)))
        last = min(layer_count - 1, int(np.floor((vertices[:, 2].max() - bed) / 0.2 - 0.5)))
        for layer in range(first, last + 1):
            pixels = _section_pixels(triangles, zmin, zmax, bed + (layer + 0.5) * 0.2, origin, pitch, shape, np)
            if len(pixels):
                np.minimum.at(lowest.ravel(), pixels, layer)
        if index and index % 1000 == 0:
            print(f"V4_D2_SOURCE_SECTION {index}/{len(births)}", flush=True)
    output_path = output_dir / "prep/vertical_first_material.npz"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output_path, lowest=lowest, origin=origin, pitch=pitch, shape=shape)
    return {
        "path": "prep/vertical_first_material.npz",
        "source_object_count": len(births),
        "shape": shape.tolist(),
        "layer_count": layer_count,
        "pitch_mm": pitch,
        "sha256": sha256_file(output_path),
    }


def _capsule(kernel: ManifoldKernel, a: Any, b: Any, radius: float) -> Any:
    return kernel.capsule(a, b, radius, sections=16, subdivisions=2)


def _build_d2(
    *,
    paths: dict[str, Path],
    v3_root: Path,
    grid_path: Path,
    output_dir: Path,
    kernel: ManifoldKernel,
    ndimage: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    np = kernel.np
    surface = read_json(paths["flower_surface"])["surface"]
    structure = read_json(paths["upstream_structure"])
    members = structure["members"]
    surface_by_id = {item["id"]: item for item in surface}
    member_by_id = {item["id"]: item for item in members}
    with np.load(paths["flower_template_mesh"]) as template:
        template_vertices = template["vertices"].copy()
        template_faces = template["faces"].copy()
    events = read_json(paths["upstream_true_birth_records"])
    bed = float(structure["bed_z_mm"])
    all_items = surface + members
    boxes = np.array([item["bbox_mm"] for item in all_items])
    item_ids = [item["id"] for item in all_items]
    memo: dict[str, tuple[Any, Any]] = {}
    manifold_memo: dict[str, Any] = {}

    with np.load(grid_path) as grid:
        lowest = grid["lowest"].copy()
        origin = grid["origin"].copy()
        pitch = float(grid["pitch"])
        shape = grid["shape"].copy()
    wide = ndimage.minimum_filter(lowest, size=9, mode="constant", cval=0)

    def geometry(object_id: str) -> tuple[Any, Any]:
        if object_id not in memo:
            if object_id in surface_by_id:
                item = surface_by_id[object_id]
                vertices = template_vertices @ np.array(item["orientation_matrix"]).T * item["physical_scale"] + item["position_mm"]
                faces = template_faces
            elif object_id in member_by_id:
                with np.load(v3_root / "data/members" / f"{object_id}.npz") as mesh:
                    vertices = mesh["vertices"].copy()
                    faces = mesh["faces"].copy()
            else:
                raise ContractError(f"V4 D2 target has no source geometry: {object_id}")
            memo[object_id] = (vertices, faces)
        return memo[object_id]

    def object_manifold(object_id: str) -> Any:
        if object_id not in manifold_memo:
            manifold_memo[object_id] = kernel.man(*geometry(object_id))
        return manifold_memo[object_id]

    def clear_column(point: Any, layer: int) -> bool:
        xy = np.floor((point[:2] - origin) / pitch).astype(int)
        return bool(0 <= xy[0] < shape[0] and 0 <= xy[1] < shape[1] and wide[xy[1], xy[0]] >= layer - 3)

    def tool_ray(point: Any, target: str) -> tuple[Any | None, int | None]:
        for angle_index in range(24):
            angle = angle_index * math.tau / 24
            direction = np.array([math.cos(angle), math.sin(angle), 0])
            samples = point + np.linspace(1.5, 260, 130)[:, None] * direction
            near = np.where((boxes[:, 0, 2] - 1 <= point[2]) & (boxes[:, 1, 2] + 1 >= point[2]))[0]
            blocked = False
            for index in near:
                if item_ids[index] == target:
                    continue
                if np.any(np.all((samples >= boxes[index, 0] - 1) & (samples <= boxes[index, 1] + 1), axis=1)):
                    blocked = True
                    break
            if not blocked:
                return direction, angle_index
        return None, None

    candidates: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    selection_trace: list[dict[str, Any]] = []
    seen: set[str] = set()
    for event_index, event in enumerate(events):
        if event["z_mm"] - bed > 35:
            continue
        for target_index, target in enumerate(event["ids"]):
            if target in seen:
                continue
            seen.add(target)
            vertices, faces = geometry(target)
            low = vertices[vertices[:, 2].argmin()].astype(float)
            height = float(low[2] - bed)
            if not 1.5 < height <= 35:
                continue
            layer = int((low[2] - bed) / 0.2)
            if not clear_column(low, layer):
                continue
            prior_distances = [float(np.linalg.norm(low[:2] - np.array(item["contact_mm"])[:2])) for item in candidates]
            min_prior_distance = min(prior_distances) if prior_distances else None
            if min_prior_distance is not None and min_prior_distance < 3.2:
                continue
            direction, angle_index = tool_ray(low, target)
            if direction is None:
                rejected.append({"id": target, "kind": "D2", "reason": "No conservative 2mm horizontal tool corridor"})
                continue

            foot = np.r_[low[:2], bed + 0.8]
            shoulder = low - [0, 0, 1.1]
            tip = low + [0, 0, 0.15]
            shaft = _capsule(kernel, foot, shoulder, 0.8)
            neck = _capsule(kernel, shoulder, tip, 0.3)
            mesh = shaft + neck
            for brace_index in range(3):
                angle = brace_index * math.tau / 3
                base = foot + [2.0 * math.cos(angle), 2.0 * math.sin(angle), 0]
                top = foot + [0, 0, min(3.0, height - 1.2)]
                mesh = mesh + _capsule(kernel, base, top, 0.8)

            mesh_vertices = mesh.to_mesh().vert_properties[:, :3]
            mesh_bbox = np.array([mesh_vertices.min(0), mesh_vertices.max(0)])
            near = np.where(np.all(boxes[:, 1] >= mesh_bbox[0], axis=1) & np.all(boxes[:, 0] <= mesh_bbox[1], axis=1))[0]
            contacts: list[dict[str, Any]] = []
            bulk_interference: list[str] = []
            for index in near:
                other = object_manifold(item_ids[index])
                overlap_volume = float((mesh ^ other).volume())
                if overlap_volume > 1e-6:
                    neck_volume = float((neck ^ other).volume())
                    contacts.append({"id": item_ids[index], "volume_mm3": overlap_volume, "neck_volume_mm3": neck_volume})
                    if overlap_volume - neck_volume > 1e-4:
                        bulk_interference.append(item_ids[index])
            if bulk_interference or not any(item["id"] == target for item in contacts):
                rejected.append({
                    "id": target,
                    "kind": "D2",
                    "reason": "Bulk BODY interference or no exact target contact",
                    "bulk_interference": bulk_interference,
                })
                continue

            support_id = f"D2_{len(candidates):03d}"
            mesh_path = output_dir / "meshes" / f"{support_id}.npz"
            mesh_info = kernel.store(mesh_path, mesh)
            candidate = {
                "id": support_id,
                "kind": "D2",
                "target": target,
                "anchor": "BED",
                "contact_mm": low.tolist(),
                "points_mm": [foot.tolist(), shoulder.tolist(), tip.tolist()],
                "shaft_diameter_mm": 1.6,
                "neck_diameter_mm": 0.6,
                "neck_length_mm": 1.25,
                "cut_mm": (low - [0, 0, 0.4]).tolist(),
                "tool_approach": direction.tolist(),
                "withdrawal_direction": [0, 0, -1],
                "height_mm": height,
                "bbox_mm": mesh_info["bbox_mm"],
                "volume_mm3": float(mesh.volume()),
                "exact_contacts": contacts,
                "removal": "Cut short neck from recorded exterior horizontal direction; withdraw shaft down through its clear bed approach after lifting released assembly; remove bases from plate",
                "stability": "Three early short 1.6mm braces; shaft max35mm; actual toolpath chronology unverified",
            }
            candidates.append(candidate)
            selection_trace.append({
                "id": support_id,
                "target": target,
                "event_index": event_index,
                "target_index_in_event": target_index,
                "reason": "first eligible unique target birth satisfying the legacy event-height, target-height, bed-visibility, contact-spacing, horizontal tool-corridor, and exact-neck-contact checks",
                "checks": {
                    "first_unique_target_event": True,
                    "event_height_mm": float(event["z_mm"] - bed),
                    "event_height_limit_mm": 35.0,
                    "target_height_mm": height,
                    "target_height_bounds_mm": [1.5, 35.0],
                    "bed_visibility_filter_size": 9,
                    "minimum_prior_contact_distance_mm": min_prior_distance,
                    "contact_spacing_limit_mm": 3.2,
                    "tool_approach_index_of_24": angle_index,
                    "exact_target_contact": True,
                    "bulk_interference_ids": [],
                },
            })
            if len(candidates) % 20 == 0:
                print(f"V4_D2_GENERATED {len(candidates)}", flush=True)

    return candidates, rejected, selection_trace


def generate_v4_d2(
    *,
    case: dict[str, Any],
    recipe: dict[str, Any],
    source_map: dict[str, Any],
    roots: dict[str, Any],
    output_dir: Path,
    preset_dir: Path,
) -> dict[str, Any]:
    """Regenerate only V4 D2 from pinned source geometry; never opens its checkpoints."""
    if case.get("case_id") != "MINI_A_AUTHORED_SUPPORT_LEGACY_V1":
        raise ContractError("V4 D2 generation is bound to the fixed MINI_A case")
    if recipe.get("stage_order", [None])[0] != "V4_D2_SUPPORT_GENERATION":
        raise ContractError("V4 D2 must be the first stage in the fixed MINI_A recipe")
    output_roots = roots.get("roots", {})
    outputs_root = Path(output_roots.get("outputs", "")).expanduser().resolve(strict=False)
    output_resolved = output_dir.resolve(strict=False)
    if output_resolved == outputs_root or outputs_root in output_resolved.parents:
        raise ContractError("V4 D2 output must be outside the frozen source outputs root")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ContractError(f"V4 D2 stage output must be a new empty directory: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    runtime_root = Path(output_roots.get("geometry_runtime", "")).expanduser().resolve(strict=False)
    v3_root = outputs_root / "R4_V2_INTERNAL_PROPOSAL_V3"

    source_code = _verify_legacy_source_code(outputs_root, source_map)
    before, paths, _expected_hashes = _load_source_snapshot(
        outputs_root=outputs_root, preset_dir=preset_dir, source_map=source_map
    )
    kernel = ManifoldKernel.from_runtime_root(runtime_root)
    ndimage = importlib.import_module("scipy.ndimage")
    prep = _rebuild_vertical_first_material(paths=paths, v3_root=v3_root, output_dir=output_dir, np=kernel.np)
    candidates, rejected, selection_trace = _build_d2(
        paths=paths,
        v3_root=v3_root,
        grid_path=output_dir / prep["path"],
        output_dir=output_dir,
        kernel=kernel,
        ndimage=ndimage,
    )
    _write_json(output_dir / "candidates.json", {"stage_id": "V4_D2_SUPPORT_GENERATION", "D2": candidates, "rejected": rejected})
    _write_json(output_dir / "SELECTION_TRACE.json", selection_trace)
    mesh_identities = {
        candidate["id"]: kernel.mesh_array_identity(output_dir / "meshes" / f"{candidate['id']}.npz")
        for candidate in candidates
    }
    _write_json(output_dir / "MESH_IDENTITIES.json", mesh_identities)
    after, _paths_after, _expected_after = _load_source_snapshot(
        outputs_root=outputs_root, preset_dir=preset_dir, source_map=source_map
    )
    unchanged = before["input_tree_sha256"] == after["input_tree_sha256"] and before["inputs"] == after["inputs"]
    if not unchanged:
        raise ContractError("a pinned original input changed during V4 D2 generation")
    report = {
        "schema_version": "authored-support-v1",
        "stage_id": "V4_D2_SUPPORT_GENERATION",
        "status": "GENERATED_PENDING_CHECKPOINT_COMPARISON",
        "candidate_count": len(candidates),
        "rejected_d2_count": len(rejected),
        "source_geometry_mask": prep,
        "source_code": source_code,
        "source_inputs_before": before,
        "source_inputs_after": after,
        "original_inputs_unchanged": unchanged,
        "checkpoint_read_during_generation": False,
        "v7_or_later_stage_executed": False,
        "minil_applied": False,
        "slice_count": 0,
        "send_count": 0,
        "print_count": 0,
    }
    _write_json(output_dir / "V4_D2_STAGE.json", report)
    return report


def checkpoint_snapshot(checkpoint_root: Path, preset_dir: Path) -> dict[str, str]:
    """Hash checkpoint files for before/after immutability checks; never used by generation."""
    lock = read_json(preset_dir / "V4_D2_CHECKPOINT_LOCK.json")
    root = checkpoint_root.resolve(strict=False)
    if not root.is_dir():
        raise ContractError(f"V4 D2 comparison checkpoint directory is missing: {root}")
    paths = {
        "additions.json": root / "data/additions.json",
        "removal_sequence.json": root / "data/removal_sequence.json",
        "vertical_first_material.npz": root / "data/vertical_first_material.npz",
    }
    for item in lock["d2_meshes"]:
        paths[f"D2/{item['id']}.npz"] = root / "data/D2" / f"{item['id']}.npz"
    return {name: sha256_file(path) for name, path in sorted(paths.items())}


def compare_v4_d2_checkpoint(
    *,
    output_dir: Path,
    checkpoint_root: Path,
    preset_dir: Path,
    kernel: ManifoldKernel,
) -> dict[str, Any]:
    """Compare generated outputs to saved V4 records only after generation has completed."""
    np = kernel.np
    lock = read_json(preset_dir / "V4_D2_CHECKPOINT_LOCK.json")
    checkpoint_root = checkpoint_root.resolve(strict=False)
    expected_records_path = checkpoint_root / "data/additions.json"
    expected_mask_path = checkpoint_root / "data/vertical_first_material.npz"
    removal_path = checkpoint_root / "data/removal_sequence.json"
    actual_doc = read_json(output_dir / "candidates.json")
    actual_trace = read_json(output_dir / "SELECTION_TRACE.json")
    identities = read_json(output_dir / "MESH_IDENTITIES.json")
    expected_doc = read_json(expected_records_path)
    expected_d2 = expected_doc["D2"]
    expected_rejected = [row for row in expected_doc["rejected"] if row.get("kind") == "D2"]
    actual_d2 = actual_doc["D2"]
    actual_rejected = actual_doc["rejected"]
    checkpoint_sha_match = sha256_file(expected_records_path) == lock["additions_sha256"]
    checkpoint_sha_match = checkpoint_sha_match and sha256_file(expected_mask_path) == lock["vertical_first_material_sha256"]
    checkpoint_sha_match = checkpoint_sha_match and sha256_file(removal_path) == lock["removal_sequence_sha256"]

    saved_mesh_shas = {item["id"]: item["sha256"] for item in lock["d2_meshes"]}
    mesh_file_hashes_match = True
    mesh_array_matches: dict[str, bool] = {}
    for item in lock["d2_meshes"]:
        support_id = item["id"]
        expected_mesh_path = checkpoint_root / "data/D2" / f"{support_id}.npz"
        actual_mesh_path = output_dir / "meshes" / f"{support_id}.npz"
        if sha256_file(expected_mesh_path) != saved_mesh_shas[support_id]:
            mesh_file_hashes_match = False
            mesh_array_matches[support_id] = False
            continue
        expected_identity = kernel.mesh_array_identity(expected_mesh_path)
        actual_identity = identities.get(support_id)
        mesh_array_matches[support_id] = actual_identity == expected_identity

    with np.load(output_dir / "prep/vertical_first_material.npz") as actual_mask, np.load(expected_mask_path) as expected_mask:
        mask_keys = ("lowest", "origin", "pitch", "shape")
        source_mask_matches = all(
            actual_mask[key].dtype == expected_mask[key].dtype
            and actual_mask[key].shape == expected_mask[key].shape
            and np.array_equal(actual_mask[key], expected_mask[key])
            for key in mask_keys
        )

    removal = read_json(removal_path)
    candidate_ids = [item["id"] for item in actual_d2]
    recorded_sequence_ids = [item["id"] for item in removal["sequence"]]
    blocked_ids = list(removal.get("blocked_ids", []))
    removal_checkpoint_consistent = (
        len(recorded_sequence_ids) == lock["removal_sequence_count"] == 150
        and len(set(recorded_sequence_ids)) == len(recorded_sequence_ids)
        and len(blocked_ids) == 1
        and set(recorded_sequence_ids).isdisjoint(blocked_ids)
        and set(recorded_sequence_ids) | set(blocked_ids) == set(candidate_ids)
    )
    d2_rejected_sha = hashlib.sha256(
        json.dumps(expected_rejected, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    trace_by_id = {item["id"]: item for item in actual_trace}
    selection_reason_matches = (
        [item["id"] for item in actual_trace] == candidate_ids
        and all(item["id"] in trace_by_id and trace_by_id[item["id"]]["target"] == item["target"] for item in actual_d2)
        and actual_d2 == expected_d2
    )
    checks = {
        "checkpoint_hashes_match_pinned_lock": checkpoint_sha_match,
        "candidate_count_151": len(actual_d2) == lock["d2_candidate_count"] == 151,
        "candidate_ids_and_order_match": candidate_ids == [item["id"] for item in expected_d2],
        "candidate_selection_records_match": selection_reason_matches,
        "rejected_ids_and_reasons_match": actual_rejected == expected_rejected and d2_rejected_sha == lock["d2_rejected_records_sha256"],
        "rebuilt_vertical_mask_arrays_match": bool(source_mask_matches),
        "all_151_mesh_arrays_match_exactly": len(mesh_array_matches) == 151 and all(mesh_array_matches.values()),
        "saved_mesh_archive_hashes_match_lock": mesh_file_hashes_match,
        "saved_150_sequence_plus_one_blocked_id_matches": removal_checkpoint_consistent,
    }
    status = "MINIA_AUTHORED_SUPPORT_V4_D2_REPLAY_READY_FOR_REVIEW" if all(checks.values()) else "MINIA_AUTHORED_SUPPORT_V4_D2_HOLD"
    return {
        "stage_id": "V4_D2_SUPPORT_GENERATION",
        "status": status,
        "scope": "V4 D2 generation and checkpoint comparison only; does not establish full MINI_A replay readiness",
        "checks": checks,
        "candidate_count": len(actual_d2),
        "candidate_ids_match": candidate_ids == [item["id"] for item in expected_d2],
        "selection_reason_comparison": {
            "status": "PASS" if selection_reason_matches else "HOLD",
            "basis": "exact candidate order and full target/contact/height/approach/stability/removal records; the saved D2 checkpoint has no explicit selection_reason field",
            "trace_count": len(actual_trace),
            "saved_explicit_reason_field_present": False,
        },
        "rejected_d2_count": len(actual_rejected),
        "rejected_reason_sha256": d2_rejected_sha,
        "rebuilt_mask_arrays_match": bool(source_mask_matches),
        "mesh_arrays": {
            "comparison": "exact dtype, shape, and contiguous vertex/face array SHA-256; archive ZIP byte equality is not used",
            "matching_count": sum(mesh_array_matches.values()),
            "candidate_count": len(mesh_array_matches),
            "mismatching_ids": [item for item, matches in mesh_array_matches.items() if not matches],
        },
        "saved_removal_record_read_only": {
            "sequence_count": len(recorded_sequence_ids),
            "blocked_ids": blocked_ids,
            "consistent_with_151_ids": removal_checkpoint_consistent,
            "removal_stage_executed": False,
        },
    }

