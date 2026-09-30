#!/usr/bin/env python3
"""Bounded, deterministic replay for the mini A1 flower-size comparison."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
TOOL_DIR = Path(__file__).resolve().parent
SOURCE_FILES = {
    "data/host.npz": {"bytes": 2_493_369, "sha256": "c44ea6883c20d1dafcde094c108f06ac2380e0f4d946356279b21a1442eb62ae"},
    "data/D6_local.npz": {"bytes": 543_038, "sha256": "854ac6f30cbdfa674c284702240dc060bd68e16080dd4c22f5a1abd294ed2f2d"},
    "data/reference_size_distribution.json": {"bytes": 52_485, "sha256": "c335edbb71b764ea9a61cc618c9dcc0faf81ef7e203bb449fa863cdda6c8eacf"},
    "data/parameters.json": {"bytes": 902, "sha256": "5ce3309a9d79459eedcd136f2af591f8788626361fd60d24477dd4dd8236b555"},
    "reproduce/build.py": {"bytes": 7_251, "sha256": "9a1edb9c6b13ae8bfb5df64f98e17c015ba12d315fc5fe0695d02c9b750c9afa"},
    "MANIFEST.json": {"bytes": 11_799, "sha256": "25e4a788dd4bc55f934cf859e87390f486cd40bb3a7b9fe73b16256465979c92"},
}
HOST_SCALE = 0.7333333333333333
REFERENCE_COUNT = 418
REFERENCE_AREA = 13_407.34252034187
EXPECTED_A1_HOST_AREA_MM2 = 137_383.53414289543
EXPECTED_A1_HOST_DIMENSIONS = np.array([204.6268768310547, 220.0, 208.5234832763672], dtype=np.float64)
EXPECTED_D6_LOCAL_DIMENSIONS = np.array([10.8671593666, 10.0721645355, 3.1393972635], dtype=np.float64)
SEED = 913418
CANDIDATE_COUNT = 100_000
R63_MM = 5.433692796075556
FLOWER_BUDGET = 5_000
ANCHOR_FACE = 37_194
ANCHOR_BARY = np.array([0.99999616289, 0.00000378219, 0.000000054916], dtype=np.float64)
ANCHOR_LOCAL = np.array([0.0, 0.0, -1.4075314978567437], dtype=np.float64)
EXPECTED_RECIPE_IDS = {
    "mini_scaled_flower_control_v0": ("CONTROL", HOST_SCALE),
    "mini_a1_size_flower_target_v0": ("TARGET", 1.0),
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


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
            raise ValueError(f"unsupported digest array type: {name} / {value.dtype}")
        h.update(name.encode("utf-8") + b"\0")
        h.update(str(value.shape).encode("ascii") + b"\0")
        h.update(value.tobytes(order="C"))
    return h.hexdigest()


def validate_recipe(recipe: dict[str, Any]) -> tuple[str, float]:
    recipe_id = recipe.get("recipe_id")
    if recipe_id not in EXPECTED_RECIPE_IDS:
        raise ValueError(f"unknown recipe_id: {recipe_id!r}")
    condition, expected_g = EXPECTED_RECIPE_IDS[recipe_id]
    required = {
        "host_uniform_scale": HOST_SCALE,
        "flower_global_scale": expected_g,
        "seed": SEED,
        "candidate_count": CANDIDATE_COUNT,
        "template_radius63_mm": R63_MM,
        "reference_count": REFERENCE_COUNT,
        "reference_host_area_mm2": REFERENCE_AREA,
        "placement_method": "v2-descending-size-clearance-v0",
        "count_policy": "empirical_area_density_v0",
        "petal_count": 6,
        "structures": "NOT_GENERATED",
        "support": "NOT_GENERATED",
    }
    for key, expected in required.items():
        if recipe.get(key) != expected:
            raise ValueError(f"recipe field {key!r} must equal {expected!r}")
    if recipe.get("condition") != condition:
        raise ValueError("recipe condition does not match recipe_id")
    return condition, expected_g


def validate_source_root(source_root: Path) -> dict[str, dict[str, Any]]:
    observed: dict[str, dict[str, Any]] = {}
    for relative, lock in SOURCE_FILES.items():
        path = source_root / Path(relative)
        if not path.is_file():
            raise FileNotFoundError(f"required locked source is missing: {relative}")
        size = path.stat().st_size
        digest = sha256_file(path)
        observed[relative] = {"bytes": size, "sha256": digest}
        if size != lock["bytes"] or digest != lock["sha256"]:
            raise ValueError(f"locked source identity mismatch: {relative}")
    return observed


def ensure_new_output(path: Path) -> None:
    if path.exists():
        raise FileExistsError(f"output already exists; refusing to overwrite: {path}")


def count_for_area(host_area_mm2: float, flower_global_scale: float) -> int:
    if not math.isfinite(host_area_mm2) or host_area_mm2 <= 0:
        raise ValueError("Host area must be finite and positive")
    if not math.isfinite(flower_global_scale) or flower_global_scale <= 0:
        raise ValueError("flower global scale must be finite and positive")
    return int(round(host_area_mm2 * REFERENCE_COUNT / REFERENCE_AREA / (flower_global_scale**2)))


def enforce_budget(count: int) -> None:
    if count < 1:
        raise ValueError("computed flower count must be positive")
    if count > FLOWER_BUDGET:
        raise ValueError(f"OUT_OF_SCOPE_BUDGET: requested {count}; limit is {FLOWER_BUDGET}")


def balanced_size_assignment(scales: np.ndarray, count: int) -> tuple[np.ndarray, np.ndarray]:
    scales = np.asarray(scales, dtype=np.float64)
    if scales.ndim != 1 or len(scales) != REFERENCE_COUNT:
        raise ValueError("size distribution must contain exactly 418 values")
    if not np.isfinite(scales).all() or np.any(scales <= 0):
        raise ValueError("size distribution contains a non-finite or non-positive value")
    enforce_budget(count)
    full, remainder = divmod(count, len(scales))
    indices = np.tile(np.arange(len(scales), dtype=np.int32), full)
    if remainder:
        ordered = np.argsort(scales, kind="stable")
        extra = np.floor((np.arange(remainder) + 0.5) * len(scales) / remainder).astype(np.int32)
        indices = np.concatenate((indices, ordered[extra]))
    assigned = scales[indices]
    order = np.argsort(-assigned, kind="stable")
    return indices, order


def sample_candidates(
    host_vertices: np.ndarray, host_faces: np.ndarray, seed: int = SEED, candidate_count: int = CANDIDATE_COUNT
) -> dict[str, np.ndarray]:
    vertices = np.asarray(host_vertices, dtype=np.float64)
    faces = np.asarray(host_faces, dtype=np.int64)
    if vertices.ndim != 2 or vertices.shape[1] != 3 or not np.isfinite(vertices).all():
        raise ValueError("Host vertices must be a finite Nx3 array")
    if faces.ndim != 2 or faces.shape[1] != 3 or len(faces) == 0:
        raise ValueError("Host faces must be a non-empty Mx3 array")
    if np.any(faces < 0) or np.any(faces >= len(vertices)):
        raise ValueError("Host face index out of range")
    tri = vertices[faces]
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    twice_area = np.linalg.norm(cross, axis=1)
    if not np.isfinite(twice_area).all() or np.any(twice_area <= 0):
        raise ValueError("Host contains degenerate or non-finite triangles")
    areas = twice_area * 0.5
    normals = cross / twice_area[:, None]
    rng = np.random.default_rng(seed)
    triangle_index = rng.choice(len(faces), size=candidate_count, p=areas / areas.sum()).astype(np.int32)
    u = np.sqrt(rng.random(candidate_count))
    v = rng.random(candidate_count)
    bary = np.column_stack((1.0 - u, u * (1.0 - v), u * v))
    candidate_tri = tri[triangle_index]
    points = np.einsum("ni,nij->nj", bary, candidate_tri)
    return {
        "points": points,
        "triangle_index": triangle_index,
        "barycentric": bary,
        "normal": normals[triangle_index],
        "triangle_areas": areas,
        "rng_state": np.frombuffer(json.dumps(rng.bit_generator.state, sort_keys=True).encode("utf-8"), dtype=np.uint8),
    }


def choose_farthest(
    candidates: np.ndarray, ordered_scales: np.ndarray, radius63: float = R63_MM
) -> tuple[np.ndarray, np.ndarray]:
    candidates = np.asarray(candidates, dtype=np.float64)
    ordered_scales = np.asarray(ordered_scales, dtype=np.float64)
    if candidates.ndim != 2 or candidates.shape[1] != 3 or not np.isfinite(candidates).all():
        raise ValueError("candidate points must be a finite Nx3 array")
    if not np.isfinite(ordered_scales).all() or np.any(ordered_scales <= 0):
        raise ValueError("ordered scales contain a non-finite or non-positive value")
    if len(ordered_scales) > len(candidates):
        raise ValueError("candidate pool is smaller than the requested flower count")
    clear = np.full(len(candidates), np.inf, dtype=np.float64)
    chosen = np.empty(len(ordered_scales), dtype=np.int32)
    chosen_score = np.zeros(len(ordered_scales), dtype=np.float64)
    score_defined = np.zeros(len(ordered_scales), dtype=np.bool_)
    for row, scale in enumerate(ordered_scales):
        index = int(np.argmax(clear))  # NumPy's first-maximum rule is the stable tie policy.
        chosen[row] = index
        if row:
            chosen_score[row] = clear[index]
            score_defined[row] = True
        distance = np.linalg.norm(candidates - candidates[index], axis=1)
        np.minimum(clear, distance - radius63 * scale, out=clear)
        clear[index] = -1_000_000.0
    return chosen, np.column_stack((chosen_score, score_defined.astype(np.float64)))


def rotation_from_normal(normal: np.ndarray, twist: float) -> np.ndarray:
    n = np.asarray(normal, dtype=np.float64)
    n = n / np.linalg.norm(n)
    source = np.array([0.0, 0.0, 1.0])
    dot = float(np.clip(np.dot(source, n), -1.0, 1.0))
    if dot <= -0.999999:
        align = np.diag([1.0, -1.0, -1.0])  # explicit 180-degree antiparallel fallback
    else:
        cross = np.cross(source, n)
        k = np.array([[0.0, -cross[2], cross[1]], [cross[2], 0.0, -cross[0]], [-cross[1], cross[0], 0.0]])
        align = np.eye(3) + k + (k @ k) / (1.0 + dot)
    c, s = math.cos(twist), math.sin(twist)
    local_twist = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
    return align @ local_twist


def matrix_to_quaternion_wxyz(matrix: np.ndarray) -> np.ndarray:
    m = np.asarray(matrix, dtype=np.float64)
    trace = float(np.trace(m))
    if trace > 0.0:
        s = math.sqrt(trace + 1.0) * 2.0
        q = np.array([0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s])
    else:
        i = int(np.argmax(np.diag(m)))
        if i == 0:
            s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2.0
            q = np.array([(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s])
        elif i == 1:
            s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2.0
            q = np.array([(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s])
        else:
            s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2.0
            q = np.array([(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s])
    q /= np.linalg.norm(q)
    if q[0] < 0:
        q = -q
    return q


def quaternion_to_matrix_wxyz(q: np.ndarray) -> np.ndarray:
    w, x, y, z = np.asarray(q, dtype=np.float64)
    return np.array([
        [1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
        [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
        [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)],
    ])


def load_mesh(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with np.load(path, allow_pickle=False) as archive:
        if set(archive.files) != {"vertices", "faces"}:
            raise ValueError(f"unexpected mesh keys in {path.name}")
        vertices = np.asarray(archive["vertices"], dtype=np.float64)
        faces = np.asarray(archive["faces"], dtype=np.int64)
    if not np.isfinite(vertices).all() or faces.ndim != 2 or faces.shape[1] != 3:
        raise ValueError(f"invalid mesh arrays in {path.name}")
    if np.any(faces < 0) or np.any(faces >= len(vertices)):
        raise ValueError(f"mesh face index out of range in {path.name}")
    return vertices, faces


def generate_case(assets_root: Path, recipe: dict[str, Any], out_case: Path) -> dict[str, Any]:
    condition, flower_global_scale = validate_recipe(recipe)
    host_vertices_a1, host_faces = load_mesh(assets_root / "data/host.npz")
    flower_vertices, flower_faces = load_mesh(assets_root / "data/D6_local.npz")
    raw_host_tri = host_vertices_a1[host_faces]
    raw_areas = 0.5 * np.linalg.norm(np.cross(raw_host_tri[:, 1] - raw_host_tri[:, 0], raw_host_tri[:, 2] - raw_host_tri[:, 0]), axis=1)
    raw_host_area = float(raw_areas.sum())
    host_vertices_mini = host_vertices_a1 * HOST_SCALE
    mini_tri = host_vertices_mini[host_faces]
    mini_areas = 0.5 * np.linalg.norm(np.cross(mini_tri[:, 1] - mini_tri[:, 0], mini_tri[:, 2] - mini_tri[:, 0]), axis=1)
    host_area = float(mini_areas.sum())
    host_dimensions = host_vertices_a1.max(axis=0) - host_vertices_a1.min(axis=0)
    if not np.allclose(host_dimensions, EXPECTED_A1_HOST_DIMENSIONS, rtol=1e-5, atol=0.01):
        raise ValueError(f"Host dimensions do not match the locked A1 source: {host_dimensions.tolist()}")
    flower_dimensions = flower_vertices.max(axis=0) - flower_vertices.min(axis=0)
    if not np.allclose(flower_dimensions, EXPECTED_D6_LOCAL_DIMENSIONS, rtol=1e-5, atol=0.01):
        raise ValueError(f"D6 local dimensions do not match the locked template: {flower_dimensions.tolist()}")
    if not math.isclose(raw_host_area, EXPECTED_A1_HOST_AREA_MM2, rel_tol=1e-4, abs_tol=0.2):
        raise ValueError(f"Host area does not match locked A1 reference: {raw_host_area:.9f} mm2")
    if int(np.max(host_faces)) >= len(host_vertices_a1) or int(np.max(flower_faces)) >= len(flower_vertices):
        raise ValueError("mesh face index out of range")
    if ANCHOR_FACE >= len(flower_faces):
        raise ValueError("anchor face is outside the locked D6 template")
    anchor_from_face = ANCHOR_BARY @ flower_vertices[flower_faces[ANCHOR_FACE]]
    if not np.isfinite(anchor_from_face).all() or np.linalg.norm(anchor_from_face - ANCHOR_LOCAL) > 1e-5:
        raise ValueError("locked anchor face does not reconstruct the expected local anchor")
    dist_doc = json.loads((assets_root / "data/reference_size_distribution.json").read_text(encoding="utf-8"))
    if not isinstance(dist_doc, list) or len(dist_doc) != REFERENCE_COUNT:
        raise ValueError("locked size distribution must contain 418 entries")
    scales = np.asarray([item["D6_physical_scale"] for item in dist_doc], dtype=np.float64)
    source_motif_ids = np.asarray([item["source_motif_id"] for item in dist_doc], dtype=np.int32)
    if len(np.unique(source_motif_ids)) != REFERENCE_COUNT or not np.isfinite(scales).all() or np.any(scales <= 0):
        raise ValueError("locked size identities or values are invalid")

    count = count_for_area(host_area, flower_global_scale)
    enforce_budget(count)
    source_size_index, order = balanced_size_assignment(scales, count)
    assigned_scale = scales[source_size_index]
    assigned_motif_id = source_motif_ids[source_size_index]
    ordered_scale = assigned_scale[order]
    rng = np.random.default_rng(SEED)
    tri = host_vertices_mini[host_faces]
    tri_prob = mini_areas / host_area
    candidate_tri_index = rng.choice(len(host_faces), size=CANDIDATE_COUNT, p=tri_prob).astype(np.int32)
    u = np.sqrt(rng.random(CANDIDATE_COUNT))
    v = rng.random(CANDIDATE_COUNT)
    candidate_bary = np.column_stack((1.0 - u, u * (1.0 - v), u * v))
    candidate_points = np.einsum("ni,nij->nj", candidate_bary, tri[candidate_tri_index])
    face_normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    face_normals /= np.linalg.norm(face_normals, axis=1)[:, None]
    candidate_normals = face_normals[candidate_tri_index]
    candidate_pool_sha = canonical_array_digest({
        "points": candidate_points,
        "triangle_index": candidate_tri_index,
        "barycentric": candidate_bary,
        "normal": candidate_normals,
    })
    # q is retained as the empirical source size. Placement consumes the actual
    # radius scale q*g once; render/anchor scale is computed separately below.
    ordered_clearance_scale = ordered_scale * flower_global_scale
    chosen, score_pair = choose_farthest(candidate_points, ordered_clearance_scale)
    chosen_scale = ordered_scale
    chosen_source_index = source_size_index[order]
    chosen_motif_id = assigned_motif_id[order]
    chosen_tri = candidate_tri_index[chosen]
    chosen_bary = candidate_bary[chosen]
    positions = candidate_points[chosen]
    normals = candidate_normals[chosen]
    twists = rng.random(count) * (math.pi / 3.0)
    rotations = np.empty((count, 3, 3), dtype=np.float64)
    quaternions = np.empty((count, 4), dtype=np.float64)
    for row in range(count):
        rotations[row] = rotation_from_normal(normals[row], float(twists[row]))
        quaternions[row] = matrix_to_quaternion_wxyz(rotations[row])
    physical_scale = chosen_scale * flower_global_scale
    anchor_world = positions + np.einsum("nij,nj->ni", rotations, physical_scale[:, None] * anchor_from_face)
    local_min = flower_vertices.min(axis=0)
    local_max = flower_vertices.max(axis=0)
    local_center = (local_min + local_max) * 0.5
    local_half = (local_max - local_min) * 0.5
    box_center = positions + np.einsum("nij,nj->ni", rotations, physical_scale[:, None] * local_center)
    box_half = np.einsum("nij,nj->ni", np.abs(rotations), physical_scale[:, None] * local_half)
    box_min = box_center - box_half
    box_max = box_center + box_half
    candidate_reconstruction = np.einsum("ni,nij->nj", chosen_bary, host_vertices_mini[host_faces[chosen_tri]])
    reconstruction_error = np.linalg.norm(candidate_reconstruction - positions, axis=1)
    if not np.isfinite(positions).all() or float(reconstruction_error.max(initial=0.0)) > 1e-9:
        raise ValueError("selected surface position failed barycentric reconstruction")
    orthogonal_error = np.max(np.abs(np.einsum("nji,njk->nik", rotations, rotations) - np.eye(3)))
    determinant_min = float(np.linalg.det(rotations).min())
    if not np.isfinite(rotations).all() or orthogonal_error > 1e-9 or determinant_min <= 0:
        raise ValueError("generated rotations are not finite proper orthogonal matrices")

    instance_ids = np.asarray([f"{condition.lower()}-flower-{n + 1:05d}" for n in range(count)])
    selected_candidate_index = chosen.astype(np.int32)
    arrays: dict[str, np.ndarray] = {
        "candidate_index": selected_candidate_index,
        "source_size_index": chosen_source_index.astype(np.int32),
        "source_motif_id": chosen_motif_id.astype(np.int32),
        "q": chosen_scale,
        "flower_global_scale": np.full(count, flower_global_scale, dtype=np.float64),
        "physical_scale": physical_scale,
        "host_triangle_index": chosen_tri,
        "host_barycentric": chosen_bary,
        "position_mm": positions,
        "normal": normals,
        "quaternion_wxyz": quaternions,
        "rotation_matrix": rotations,
        "twist_rad": twists,
        "anchor_world_mm": anchor_world,
        "bbox_min_mm": box_min,
        "bbox_max_mm": box_max,
        "clearance_score_mm": score_pair[:, 0],
        "clearance_score_defined": score_pair[:, 1].astype(bool),
    }
    semantic_sha = canonical_array_digest(arrays)
    out_case.mkdir(parents=True, exist_ok=False)
    np.savez_compressed(out_case / "placements.npz", **arrays)
    instances: list[dict[str, Any]] = []
    for n in range(count):
        instances.append({
            "instance_id": str(instance_ids[n]),
            "source_size_index": int(chosen_source_index[n]),
            "source_motif_id": int(chosen_motif_id[n]),
            "q": float(chosen_scale[n]),
            "flower_global_scale": float(flower_global_scale),
            "physical_scale": float(physical_scale[n]),
            "candidate_index": int(chosen[n]),
            "host_triangle_index": int(chosen_tri[n]),
            "host_barycentric": chosen_bary[n].tolist(),
            "position_mm": positions[n].tolist(),
            "normal": normals[n].tolist(),
            "rotation_quaternion_wxyz": quaternions[n].tolist(),
            "anchor_world_mm": anchor_world[n].tolist(),
            "bbox_conservative_min_mm": box_min[n].tolist(),
            "bbox_conservative_max_mm": box_max[n].tolist(),
            "clearance_score_mm": float(score_pair[n, 0]) if score_pair[n, 1] else None,
        })
    surface = {
        "schema": "skin_surface_replay_v0",
        "condition": condition,
        "host_uniform_scale_applied_once": HOST_SCALE,
        "host_dimensions_a1_mm": (host_vertices_a1.max(axis=0) - host_vertices_a1.min(axis=0)).tolist(),
        "host_dimensions_mini_mm": (host_vertices_mini.max(axis=0) - host_vertices_mini.min(axis=0)).tolist(),
        "host_area_mini_mm2": host_area,
        "candidate_seed": SEED,
        "candidate_count": CANDIDATE_COUNT,
        "candidate_pool_sha256": candidate_pool_sha,
        "placement_method": "v2-descending-size-clearance-v0",
        "tie_policy": "stable descending size; first maximum candidate index",
        "count": count,
        "source_size_assignment": "complete 418-entry copies plus floor((k+0.5)*418/remainder) quantiles from stable ascending q order",
        "clearance_scale": "q*g; q remains the locked source value and g is applied once",
        "instances": instances,
        "semantic_geometry_sha256": semantic_sha,
        "structures": "NOT_GENERATED",
        "support": "NOT_GENERATED",
        "actual_sent_job": "UNBOUND",
        "fabrication": "NOT_TESTED",
        "author_accept": False,
        "print_go": False,
    }
    (out_case / "surface.json").write_text(json.dumps(surface, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    anchors = {
        "schema": "flower_back_anchors_v0",
        "source_local_anchor_mm": ANCHOR_LOCAL.tolist(),
        "source_template_face_index": ANCHOR_FACE,
        "source_template_barycentric": ANCHOR_BARY.tolist(),
        "status": "CANDIDATE_UNCONNECTED",
        "items": [
            {"instance_id": str(instance_ids[n]), "anchor_world_mm": anchor_world[n].tolist(), "connected_geometry": False}
            for n in range(count)
        ],
    }
    (out_case / "flower_back_anchors.json").write_text(json.dumps(anchors, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    finite_scores = score_pair[score_pair[:, 1] > 0, 0]
    metrics = {
        "condition": condition,
        "flower_count": count,
        "source_template_count": 1,
        "host_area_a1_mm2": raw_host_area,
        "host_area_mini_mm2": host_area,
        "area_density_reference_count": REFERENCE_COUNT,
        "area_density_reference_area_mm2": REFERENCE_AREA,
        "global_size_factor": flower_global_scale,
        "q_min_median_max": np.quantile(chosen_scale, [0.0, 0.5, 1.0]).tolist(),
        "physical_scale_min_median_max": np.quantile(physical_scale, [0.0, 0.5, 1.0]).tolist(),
        "minimum_recorded_clearance_score_mm": float(finite_scores.min()) if len(finite_scores) else None,
        "clearance_formula": "score(candidate)=min_j(distance(candidate,p_j)-r63*q_j*g)",
        "clearance_interpretation": "minimum over all previously placed flower centers; point-placement diagnostic only, not a mesh collision test",
        "geometry_semantic_sha256": semantic_sha,
        "candidate_pool_sha256": candidate_pool_sha,
        "max_surface_reconstruction_error_mm": float(reconstruction_error.max(initial=0.0)),
        "max_rotation_orthogonal_error": float(orthogonal_error),
        "min_rotation_determinant": determinant_min,
        "structures": "NOT_GENERATED",
        "support": "NOT_GENERATED",
    }
    (out_case / "metrics.json").write_text(json.dumps(metrics, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return {"condition": condition, "count": count, "semantic_sha256": semantic_sha, "candidate_pool_sha256": candidate_pool_sha, "metrics": metrics}


def code_hashes() -> dict[str, str]:
    names = ["replay.py", "blender_scene.py", "blender_verify.py", "REPLAY.cmd", "SOURCE_LOCK.json"]
    return {name: sha256_file(TOOL_DIR / name) for name in names}


def bundle_context(recipe_paths: list[Path]) -> tuple[Path | None, dict[str, str] | None]:
    parents = {p.resolve().parent.parent for p in recipe_paths}
    if len(parents) != 1:
        return None, None
    parent = next(iter(parents))
    manifest = parent / "code_snapshot" / "SHA256SUMS.json"
    if not manifest.is_file():
        return None, None
    return parent, json.loads(manifest.read_text(encoding="utf-8"))["files"]


def copy_tool_snapshot(out: Path) -> dict[str, str]:
    target = out / "code_snapshot"
    target.mkdir(parents=True, exist_ok=False)
    for name in ("replay.py", "blender_scene.py", "blender_verify.py", "REPLAY.cmd", "SOURCE_LOCK.json"):
        shutil.copyfile(TOOL_DIR / name, target / name)
    hashes = {name: sha256_file(target / name) for name in ("replay.py", "blender_scene.py", "blender_verify.py", "REPLAY.cmd", "SOURCE_LOCK.json")}
    (target / "SHA256SUMS.json").write_text(json.dumps({"files": hashes}, indent=2) + "\n", encoding="utf-8")
    return hashes


def copy_recipes(recipe_paths: list[Path], out: Path) -> list[dict[str, Any]]:
    target = out / "recipes"
    target.mkdir(parents=True, exist_ok=False)
    docs = []
    for recipe_path in recipe_paths:
        doc = json.loads(recipe_path.read_text(encoding="utf-8"))
        condition, _ = validate_recipe(doc)
        shutil.copyfile(recipe_path, target / f"{condition.lower()}_{recipe_path.name}")
        docs.append(doc)
    if [r["condition"] for r in docs] != ["CONTROL", "TARGET"]:
        raise ValueError("recipes must be supplied in CONTROL then TARGET order")
    if docs[0]["host_uniform_scale"] != docs[1]["host_uniform_scale"]:
        raise ValueError("conditions must share the same mini Host scale")
    return docs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recipe", action="append", required=True, help="recipe JSON (repeat twice: CONTROL then TARGET)")
    parser.add_argument("--assets-root", required=True, help="source package root or a saved bundle's assets directory")
    parser.add_argument("--out", required=True, help="new, non-existing output bundle directory")
    parser.add_argument("--blender", required=True, help="Blender executable path")
    args = parser.parse_args(argv)
    started = time.perf_counter()
    recipe_paths = [Path(p).resolve() for p in args.recipe]
    if len(recipe_paths) != 2:
        parser.error("exactly two --recipe arguments are required")
    recipes = [json.loads(p.read_text(encoding="utf-8")) for p in recipe_paths]
    for doc in recipes:
        validate_recipe(doc)
    if [doc["condition"] for doc in recipes] != ["CONTROL", "TARGET"]:
        parser.error("recipes must be supplied in CONTROL then TARGET order")
    source_root = Path(args.assets_root).resolve()
    expected = validate_source_root(source_root)
    out = Path(args.out).resolve()
    ensure_new_output(out)
    previous_bundle, expected_code_hashes = bundle_context(recipe_paths)
    live_code_hashes = code_hashes()
    if expected_code_hashes is not None and expected_code_hashes != live_code_hashes:
        raise ValueError("code snapshot changed since source bundle; code-unchanged replay refused")

    out.parent.mkdir(parents=True, exist_ok=True)
    out.mkdir(exist_ok=False)
    phase: dict[str, float] = {}
    t = time.perf_counter()
    copied_source = out / "assets"
    for relative in SOURCE_FILES:
        destination = copied_source / Path(relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_root / Path(relative), destination)
    (out / "SOURCE_LOCK.json").write_text(json.dumps({"files": expected, "copied_relative_root": "assets/"}, indent=2) + "\n", encoding="utf-8")
    bundle_recipes = copy_recipes(recipe_paths, out)
    hashes = copy_tool_snapshot(out)
    phase["lock_copy_code_recipe_seconds"] = time.perf_counter() - t
    env = {
        "python": sys.version,
        "numpy": np.__version__,
        "platform": sys.platform,
        "blender_executable": str(Path(args.blender).resolve()),
        "relative_asset_paths": True,
    }
    t = time.perf_counter()
    (out / "environment.json").write_text(json.dumps(env, indent=2) + "\n", encoding="utf-8")
    case_results = []
    for recipe in bundle_recipes:
        case_results.append(generate_case(out / "assets", recipe, out / "cases" / recipe["condition"].lower()))
    phase["two_case_generation_seconds"] = time.perf_counter() - t
    t = time.perf_counter()
    blender_script = TOOL_DIR / "blender_scene.py"
    cmd = [str(Path(args.blender).resolve()), "--background", "--factory-startup", "--python", str(blender_script), "--", "--package", str(out)]
    render = subprocess.run(cmd, text=True, capture_output=True, encoding="utf-8", errors="replace")
    (out / "blender_build.log").write_text((render.stdout or "") + "\n--- STDERR ---\n" + (render.stderr or ""), encoding="utf-8")
    if render.returncode:
        raise RuntimeError(f"Blender scene/render failed ({render.returncode}); see {out / 'blender_build.log'}")
    verify_script = TOOL_DIR / "blender_verify.py"
    check_cmd = [str(Path(args.blender).resolve()), "--background", "--factory-startup", "--python", str(verify_script), "--", "--package", str(out)]
    checked = subprocess.run(check_cmd, text=True, capture_output=True, encoding="utf-8", errors="replace")
    (out / "blender_reopen.log").write_text((checked.stdout or "") + "\n--- STDERR ---\n" + (checked.stderr or ""), encoding="utf-8")
    if checked.returncode:
        raise RuntimeError(f"saved Blender project reopen verification failed ({checked.returncode}); see {out / 'blender_reopen.log'}")
    phase["blender_build_render_reopen_seconds"] = time.perf_counter() - t
    phase["end_to_end_seconds"] = time.perf_counter() - started
    run_id = out.name
    result = {
        "schema": "skin_mini_a1_flower_size_replay_result_v0",
        "run_id": run_id,
        "issue": "satw-jp/katachi#33",
        "branch": "agent/skin-mini-a1-flower-replay-v0",
        "base": "3511ed28337c9e624161a3d47bf5b77332f73e96",
        "tested_implementation_head": "RECORDED_AFTER_COMMIT_IN_LOCAL_RUN_RESULT",
        "evidence_head": "RECORDED_AFTER_COMMIT_IN_LOCAL_RUN_RESULT",
        "source_bundle_root": "assets/",
        "source_locks": expected,
        "code_sha256": hashes,
        "source_bundle_for_rerun": str(previous_bundle) if previous_bundle else None,
        "code_unchanged_from_source_bundle": (expected_code_hashes == live_code_hashes) if expected_code_hashes is not None else None,
        "cases": case_results,
        "comparison": {
            "candidate_pool_same": case_results[0]["candidate_pool_sha256"] == case_results[1]["candidate_pool_sha256"],
            "geometry_fingerprints_differ": case_results[0]["semantic_sha256"] != case_results[1]["semantic_sha256"],
            "placement_clearance_scale": "q*g",
            "source_q_preserved": True,
            "control_flower_count": case_results[0]["count"],
            "target_flower_count": case_results[1]["count"],
            "target_to_control_global_scale_ratio": 1.0 / HOST_SCALE,
            "structures": "NOT_GENERATED",
            "support": "NOT_GENERATED",
            "actual_sent_job": "UNBOUND",
            "fabrication": "NOT_TESTED",
            "author_accept": False,
            "print_go": False,
        },
        "blender_reopen_check": json.loads((out / "blender_reopen_result.json").read_text(encoding="utf-8")),
        "timings_seconds": phase,
        "output_bytes": None,
        "output_file_count": None,
        "output_relative_paths": [],
        "manual_baseline_seconds": None,
        "measured_time_saved_seconds": None,
        "time_saving_note": "No manual baseline session was timed; this run records replay effort and prevents a fabricated savings claim.",
    }
    (out / "RESULT.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (out / "README.md").write_text(
        "# Skin mini A1 flower replay bundle\n\n"
        f"Run: `{run_id}`\n\n"
        "Portable inputs are under `assets/`; both recipes are under `recipes/`; generated point/anchor records are under `cases/`; the saved Blender scene and actual comparison renders are under `review/`. All paths in this bundle are relative.\n\n"
        "Replay from this bundle with the committed `tools/skin_surface_replay/replay.py`, using the two recipe files in CONTROL, TARGET order, `--assets-root <this-folder>/assets`, a new `--out`, and Blender 5.1 or compatible. The tool refuses to reuse an existing output and refuses replay if its current source code differs from the bundle's code snapshot.\n\n"
        "`review/comparison.png` and the paired front, oblique, closeup, grazing, Host-off surface, and flower-size renders show actual Blender geometry with condition labels. Matched camera settings are recorded in `review/camera_conditions.json`; source-size IDs and dimensions appear in `review/flower_size_samples.png` and its JSON sidecar. `REVIEW.blend` is saved and reopened by a separate Blender process; reopen checks are recorded in `blender_reopen_result.json`. Placement clearance scores use `q*g` and remain point-placement diagnostics, not collision results. Internal geometry and supports are not generated; sent job is UNBOUND; fabrication is NOT_TESTED; author_accept and print_go remain false.\n",
        encoding="utf-8",
    )
    result["output_relative_paths"] = [str(p.relative_to(out)).replace(os.sep, "/") for p in sorted(out.rglob("*")) if p.is_file()]
    result_path = out / "RESULT.json"
    for _ in range(4):
        result["output_file_count"] = len(result["output_relative_paths"])
        result["output_bytes"] = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
        result_path.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"REPLAY_ERROR: {exc}", file=sys.stderr)
        raise
