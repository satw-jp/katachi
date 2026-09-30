from __future__ import annotations

import copy
import hashlib
import json
import math
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from .core import (
    FLOWER_COUNT,
    H,
    HOST_SHA256,
    ReplayFailure,
    SOURCE_STRUCTURE_SHA256,
    canonical_json_bytes,
    digest_json,
    require,
)

try:
    import manifold3d as md
    import trimesh
    from scipy import ndimage as ndi
    from scipy.spatial import cKDTree
except Exception as exc:  # pragma: no cover - environment-specific diagnostic
    raise RuntimeError("The R4 local vendor packages are required (numpy, scipy, trimesh, manifold3d). Set ASTRA_RESEARCH_VENDOR.") from exc


POSITIVE_VOLUME_MM3 = 1.0e-8
HULL_REJECTION_MM3 = 1.0e-9
MAIN_DIAMETER_MM = 2.2
MAIN_RADIUS_MM = MAIN_DIAMETER_MM / 2
CORE_SAMPLE_SPACING_MM = 3.0 * H
CORE_DEPTH_MM = 14.0 * H
CORE_SPACING_MM = 30.0 * H
CORE_MAX_EDGE_MM = 58.0 * H
TWIG_GROUP_RADIUS_MM = 11.0 * H
TWIG_INWARD_MM = [7.0 * H, 11.0 * H, 15.0 * H]
TWIG_DOWN_MM = [0.0, 4.0 * H, 8.0 * H]
NORMAL_ANGLE_THRESHOLD_DEG = 30.0
NORMAL_RUN_MAX_MM = 4.0 * H
NORMAL_RUN_FRACTION = 0.6
PARENT_COLLAR_MM = 2.0 * H
TAPER_LENGTH_MM = 3.0 * H
BYPASS_PORT_DEPTH_MM = 18.0 * H
BYPASS_PATH_DEPTH_MM = 14.0 * H
BYPASS_MATERIAL_DEPTH_MM = 11.0 * H
BYPASS_MIN_LENGTH_MM = 8.0 * H
BYPASS_MAX_LENGTH_MM = 26.0 * H
BYPASS_MIN_RISE_MM = 6.0 * H
BYPASS_CROWD_SPACING_MM = 8.0 * H
BYPASS_OVERLAP_A1_MM3 = 0.1
BYPASS_OVERLAP_MM3 = BYPASS_OVERLAP_A1_MM3 * H**3
BYPASS_UPWARD_SLOPE_MIN = 0.7
BYPASS_TARGETS_PER_LOWER = 2
BYPASS_ADDITIONS_PER_UPPER = 1
CHRONOLOGY_LAYER_MM = 0.2
CHRONOLOGY_XY_MM = 0.3


def _manifold(vertices: np.ndarray, faces: np.ndarray) -> Any:
    try:
        mesh = md.Mesh(np.asarray(vertices, dtype=np.float32), np.asarray(faces, dtype=np.uint32))
        solid = md.Manifold(mesh)
    except Exception as exc:
        raise ReplayFailure("CONTACT_CALCULATION_FAILED", f"mesh conversion: {exc}") from exc
    require(solid.status() == md.Error.NoError, "CONTACT_CALCULATION_FAILED", f"Manifold status {solid.status()}")
    require(math.isfinite(float(solid.volume())) and float(solid.volume()) > 0.0, "CONTACT_CALCULATION_FAILED", "non-positive source solid")
    return solid


def _to_arrays(solid: Any) -> tuple[np.ndarray, np.ndarray]:
    mesh = solid.to_mesh()
    vertices = np.asarray(mesh.vert_properties, dtype=np.float32).reshape((-1, 3))
    faces = np.asarray(mesh.tri_verts, dtype=np.uint32).reshape((-1, 3))
    require(len(vertices) > 0 and len(faces) > 0, "CONTACT_CALCULATION_FAILED", "empty generated member")
    return vertices, faces


def _frustum(a: np.ndarray, b: np.ndarray, ra: float, rb: float, sides: int = 16) -> tuple[np.ndarray, np.ndarray]:
    delta = np.asarray(b, dtype=np.float64) - np.asarray(a, dtype=np.float64)
    length = float(np.linalg.norm(delta))
    require(length > 1e-9 and ra > 0 and rb > 0, "INVALID_MEMBER_GEOMETRY", "degenerate frustum")
    z = delta / length
    axis = np.array([0.0, 0.0, 1.0]) if abs(z[2]) < 0.9 else np.array([0.0, 1.0, 0.0])
    x = np.cross(z, axis)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    theta = np.arange(sides, dtype=np.float64) * (2.0 * np.pi / sides)
    radial = np.cos(theta)[:, None] * x + np.sin(theta)[:, None] * y
    ring_a = np.asarray(a, dtype=np.float64)[None, :] + ra * radial
    ring_b = np.asarray(b, dtype=np.float64)[None, :] + rb * radial
    vertices = np.vstack((ring_a, ring_b, np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)))
    bottom = sides * 2
    top = bottom + 1
    faces: list[list[int]] = []
    for i in range(sides):
        nxt = (i + 1) % sides
        faces.extend(([i, nxt, sides + nxt], [i, sides + nxt, sides + i]))
        faces.append([bottom, nxt, i])
        faces.append([top, sides + i, sides + nxt])
    return vertices.astype(np.float32), np.asarray(faces, dtype=np.uint32)


def _sphere(center: np.ndarray, radius: float) -> tuple[np.ndarray, np.ndarray]:
    mesh = trimesh.creation.icosphere(subdivisions=1, radius=float(radius))
    mesh.apply_translation(np.asarray(center, dtype=np.float64))
    return np.asarray(mesh.vertices, dtype=np.float32), np.asarray(mesh.faces, dtype=np.uint32)


def _mesh_component(vertices: np.ndarray, faces: np.ndarray) -> Any:
    return _manifold(vertices, faces)


def member_solid(member: dict[str, Any]) -> Any:
    points = np.asarray(member["points_mm"], dtype=np.float64)
    require(points.ndim == 2 and points.shape[1] == 3 and len(points) >= 2 and np.isfinite(points).all(), "INVALID_MEMBER_GEOMETRY", str(member.get("id")))
    main_radius = float(member.get("main_diameter_mm", MAIN_DIAMETER_MM)) / 2.0
    terminal_radius = float(member.get("terminal_diameter_mm", member.get("main_diameter_mm", MAIN_DIAMETER_MM))) / 2.0
    taper_length = float(member.get("taper_length_mm", 0.0))
    if member.get("role") != "FLOWER_BACK_ATTACHMENT":
        terminal_radius = main_radius
        taper_length = 0.0
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    total = float(lengths.sum())
    require(total > 1e-8, "INVALID_MEMBER_GEOMETRY", f"zero centerline {member.get('id')}")
    taper_start = max(0.0, total - min(taper_length, total))
    parts = []
    joints: list[tuple[float, np.ndarray]] = []
    cumulative = 0.0

    def radius_at(s: float) -> float:
        if taper_length <= 0 or s <= taper_start:
            return main_radius
        t = min(1.0, max(0.0, (s - taper_start) / max(total - taper_start, 1e-12)))
        return main_radius + (terminal_radius - main_radius) * t

    for index, (a, b) in enumerate(zip(points[:-1], points[1:])):
        length = float(lengths[index])
        if length <= 1e-10:
            cumulative += length
            continue
        cuts = [0.0, length]
        if cumulative < taper_start < cumulative + length:
            cuts.insert(1, taper_start - cumulative)
        for left, right in zip(cuts[:-1], cuts[1:]):
            u0, u1 = left / length, right / length
            p0 = a + (b - a) * u0
            p1 = a + (b - a) * u1
            s0, s1 = cumulative + left, cumulative + right
            v, f = _frustum(p0, p1, radius_at(s0), radius_at(s1))
            parts.append(_mesh_component(v, f))
            joints.append((s0, p0))
            joints.append((s1, p1))
        cumulative += length
    dedup: dict[tuple[int, int, int], tuple[float, np.ndarray]] = {}
    for s, point in joints:
        key = tuple(np.rint(np.asarray(point) * 1e7).astype(np.int64).tolist())
        dedup[key] = (s, point)
    for s, point in dedup.values():
        v, f = _sphere(point, radius_at(s))
        parts.append(_mesh_component(v, f))
    require(bool(parts), "INVALID_MEMBER_GEOMETRY", f"empty member {member.get('id')}")
    solid = md.Manifold.batch_boolean(parts, md.OpType.Add)
    require(solid.status() == md.Error.NoError and float(solid.volume()) > 0.0, "INVALID_MEMBER_GEOMETRY", f"invalid union {member.get('id')}")
    return solid


def canonical_mesh_digest(vertices: np.ndarray, faces: np.ndarray) -> str:
    v = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces, dtype=np.int64)
    require(v.ndim == 2 and v.shape[1] == 3 and f.ndim == 2 and f.shape[1] == 3, "INVALID_MEMBER_GEOMETRY", "mesh digest shape")
    q = np.rint(v * 1e7).astype("<i8")
    order = np.lexsort((q[:, 2], q[:, 1], q[:, 0]))
    inverse = np.empty(len(order), dtype=np.int64)
    inverse[order] = np.arange(len(order), dtype=np.int64)
    remapped = np.sort(inverse[f], axis=1)
    face_order = np.lexsort((remapped[:, 2], remapped[:, 1], remapped[:, 0]))
    h = hashlib.sha256()
    h.update(q[order].tobytes(order="C"))
    h.update(np.asarray(remapped[face_order], dtype="<i8", order="C").tobytes(order="C"))
    return h.hexdigest()


class HostRules:
    def __init__(self, field_path: Path, corridor_path: Path):
        with np.load(field_path, allow_pickle=False) as data:
            self.field = np.asarray(data["field"], dtype=np.float32)
            self.origin = np.asarray(data["origin"], dtype=np.float64)
            self.pitch = float(data["pitch"])
        corridor_data = json.loads(corridor_path.read_text(encoding="utf-8"))
        self.corridors = corridor_data["corridors"]

    def depth(self, mini_points: np.ndarray) -> np.ndarray:
        q = np.atleast_2d(np.asarray(mini_points, dtype=np.float64)) / H
        coords = ((q - self.origin) / self.pitch).T
        return np.asarray(ndi.map_coordinates(self.field, coords, order=1, mode="constant", cval=-100.0), dtype=np.float64) * H

    def clearance(self, mini_points: np.ndarray, tube_radius: float = MAIN_RADIUS_MM) -> np.ndarray:
        q = np.atleast_2d(np.asarray(mini_points, dtype=np.float64)) / H
        result = np.full(len(q), 1.0e9, dtype=np.float64)
        for c in self.corridors:
            axes = [i for i in range(3) if i != int(c["axis"])]
            center = np.asarray(c["center_mm"], dtype=np.float64)
            r = float(c["radius_mm"])
            clearance_a1 = np.linalg.norm(q[:, axes] - center[axes], axis=1) - r - tube_radius / H
            result = np.minimum(result, clearance_a1 * H)
        return result

    @staticmethod
    def sample_polyline(points: np.ndarray, step: float = 0.6 * H) -> np.ndarray:
        p = np.asarray(points, dtype=np.float64)
        chunks = []
        for a, b in zip(p[:-1], p[1:]):
            length = float(np.linalg.norm(b - a))
            count = max(2, int(math.ceil(length / step)) + 1)
            chunks.append(np.linspace(a, b, count, endpoint=True))
        return np.vstack(chunks) if chunks else p.copy()

    def valid_path(self, points: np.ndarray, *, terminal: bool = False, minimum_clearance: float | None = None) -> bool:
        q = self.sample_polyline(np.asarray(points, dtype=np.float64))
        depth = self.depth(q)
        if terminal:
            if float(depth.min()) < -0.15 * H:
                return False
            interior = depth >= 7.0 * H
            if np.any(interior):
                limit = 0.1 * H if minimum_clearance is None else minimum_clearance
                if float(self.clearance(q[interior]).min()) < limit:
                    return False
            return True
        limit = 0.0 if minimum_clearance is None else minimum_clearance
        return float(depth.min()) >= 1.5 * H and float(self.clearance(q).min()) >= limit

    def screen_material(self, vertices: np.ndarray, faces: np.ndarray, minimum_depth: float, check_corridor: bool = True) -> tuple[float, float]:
        v = np.asarray(vertices, dtype=np.float64)
        f = np.asarray(faces, dtype=np.int64)
        samples = np.vstack((v, v[f].mean(axis=1)))
        depths = self.depth(samples)
        minimum = float(depths.min())
        clearance = float(self.clearance(samples).min()) if check_corridor else math.inf
        return minimum - minimum_depth, clearance


def _load_mesh_npz(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with np.load(path, allow_pickle=False) as data:
        return np.asarray(data["vertices"], dtype=np.float64), np.asarray(data["faces"], dtype=np.int64)


def _flower_bbox(placements: dict[str, np.ndarray], index: int) -> tuple[np.ndarray, np.ndarray]:
    return placements["bbox_min_mm"][index], placements["bbox_max_mm"][index]


def _boxes_overlap(a: tuple[np.ndarray, np.ndarray], b: tuple[np.ndarray, np.ndarray]) -> bool:
    return bool(np.all(a[1] >= b[0]) and np.all(b[1] >= a[0]))


class FlowerGeometry:
    def __init__(self, vertices: np.ndarray, faces: np.ndarray, placements: dict[str, np.ndarray], flower_ids: list[str]):
        self.vertices = np.asarray(vertices, dtype=np.float64)
        self.faces = np.asarray(faces, dtype=np.int64)
        self.placements = placements
        self.ids = flower_ids
        self.index = {flower_id: i for i, flower_id in enumerate(flower_ids)}
        self.unit = _manifold(self.vertices, self.faces)
        self.hull = trimesh.convex.convex_hull(self.vertices)
        self.hull_solid = _manifold(np.asarray(self.hull.vertices), np.asarray(self.hull.faces))
        self.points = np.asarray(placements["position_mm"], dtype=np.float64)
        self.scales = np.asarray(placements["physical_scale"], dtype=np.float64)
        self.normals = np.asarray(placements["normal"], dtype=np.float64)
        self.anchors = np.asarray(placements["anchor_world_mm"], dtype=np.float64)
        self.boxes = [_flower_bbox(placements, i) for i in range(len(self.ids))]
        self.tree = cKDTree(self.points)

    @lru_cache(maxsize=160)
    def shape(self, index: int, hull: bool = False) -> Any:
        rotation = np.asarray(self.placements["rotation_matrix"][index], dtype=np.float64)
        scale = float(self.scales[index])
        matrix = np.column_stack((rotation * scale, self.points[index]))
        return (self.hull_solid if hull else self.unit).transform(matrix)

    def overlap(self, solid: Any, index: int) -> float:
        return max(0.0, float((solid ^ self.shape(index, False)).volume()))

    def broad_candidates(self, lower: np.ndarray, upper: np.ndarray) -> list[int]:
        center = (lower + upper) * 0.5
        radius = float(np.linalg.norm(upper - lower) * 0.5)
        found = self.tree.query_ball_point(center, radius + float(np.linalg.norm(np.ptp(self.vertices, axis=0))))
        return [i for i in sorted(found) if _boxes_overlap((lower, upper), self.boxes[i])]

    def natural_contacts(self) -> dict[str, Any]:
        sphere_radii = np.linalg.norm(self.vertices, axis=1).max() * self.scales
        candidates: list[tuple[int, int]] = []
        for i, point in enumerate(self.points):
            for j in sorted(self.tree.query_ball_point(point, float(sphere_radii[i] + sphere_radii.max()))):
                if j <= i:
                    continue
                distance = float(np.linalg.norm(self.points[i] - self.points[j]))
                if distance > float(sphere_radii[i] + sphere_radii[j]):
                    continue
                if not _boxes_overlap(self.boxes[i], self.boxes[j]):
                    continue
                candidates.append((i, j))
        parent = list(range(len(self.ids)))

        def root(i: int) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        pairs: list[dict[str, Any]] = []
        hull_rejected = 0
        exact = 0
        for i, j in candidates:
            if float((self.shape(i, True) ^ self.shape(j, True)).volume()) <= HULL_REJECTION_MM3:
                hull_rejected += 1
                continue
            exact += 1
            volume = max(0.0, float((self.shape(i, False) ^ self.shape(j, False)).volume()))
            if volume > POSITIVE_VOLUME_MM3:
                pairs.append({"a": self.ids[i], "b": self.ids[j], "intersection_volume_mm3": volume})
                parent[root(i)] = root(j)
        groups: dict[int, list[str]] = {}
        for i, flower_id in enumerate(self.ids):
            groups.setdefault(root(i), []).append(flower_id)
        index_by_id = self.index
        components = []
        for group in groups.values():
            ordered = sorted(group, key=lambda flower_id: (index_by_id[flower_id], flower_id))
            representative = sorted(ordered, key=lambda flower_id: (-float(self.scales[index_by_id[flower_id]]), flower_id))[0]
            components.append({"component_id": "NC-" + ordered[0], "flower_ids": ordered, "representative_flower_id": representative})
        components.sort(key=lambda c: self.index[c["flower_ids"][0]])
        pair_keys = sorted((x["a"], x["b"]) for x in pairs)
        hist: dict[str, int] = {}
        for component in components:
            size_key = str(len(component["flower_ids"]))
            hist[size_key] = hist.get(size_key, 0) + 1
        result = {
            "schema": "skin_mini_target_natural_contacts_v0",
            "method": "R4 V2 broad phase: center sphere + conservative AABB + transformed convex-hull rejection; final positives use exact transformed watertight D6 Manifold intersections",
            "positive_volume_threshold_mm3": POSITIVE_VOLUME_MM3,
            "hull_rejection_threshold_mm3": HULL_REJECTION_MM3,
            "candidate_pair_count": len(candidates),
            "hull_rejected_pair_count": hull_rejected,
            "actual_d6_intersection_count": exact,
            "touching_pair_count": len(pairs),
            "component_count": len(components),
            "singleton_count": sum(len(c["flower_ids"]) == 1 for c in components),
            "component_size_histogram": dict(sorted(hist.items(), key=lambda kv: int(kv[0]))),
            "components": components,
            "touching_pairs": pairs,
            "graph_sha256": digest_json(pair_keys),
            "representative_rule": "maximum accepted physical_scale; exact ties break by ascending accepted instance_id",
            "flower_to_flower_structural_bars": 0,
        }
        return result


def _make_core_record(source: dict[str, Any]) -> dict[str, Any]:
    points = np.asarray(source["points_mm"], dtype=np.float64)
    return {
        "id": source["id"],
        "role": source["kind"],
        "kind": source["kind"],
        "parent_id": source.get("parent_id"),
        "target_id": source.get("target_id"),
        "source_member_id": source["id"],
        "source_parent_id": source.get("parent_id"),
        "source_target_id": source.get("target_id"),
        "source_centerline_sha256": digest_json(points.tolist()),
        "points_mm": (points * H).tolist(),
        "main_diameter_mm": MAIN_DIAMETER_MM,
        "terminal_diameter_mm": MAIN_DIAMETER_MM,
        "taper_length_mm": 0.0,
        "rule_version": "r4-a-short-join-g-core-subset-h-scale-v0",
        "transform_H": H,
    }


def _point_at_fraction(points: np.ndarray, fraction: float) -> np.ndarray:
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    total = float(lengths.sum())
    target = fraction * total
    cumulative = 0.0
    for index, length in enumerate(lengths):
        if cumulative + length >= target and length > 1e-10:
            return points[index] + (points[index + 1] - points[index]) * ((target - cumulative) / length)
        cumulative += float(length)
    return points[-1].copy()


def _core_samples(members: list[dict[str, Any]]) -> tuple[np.ndarray, list[str]]:
    points: list[np.ndarray] = []
    owner: list[str] = []
    for member in members:
        line = np.asarray(member["points_mm"], dtype=np.float64)
        length = float(np.linalg.norm(np.diff(line, axis=0), axis=1).sum())
        count = max(4, int(length / CORE_SAMPLE_SPACING_MM))
        for t in np.linspace(0.02, 0.98, count):
            points.append(_point_at_fraction(line, float(t)))
            owner.append(member["id"])
    return np.asarray(points, dtype=np.float64), owner


def _corridor_clearance_at(rules: HostRules, point: np.ndarray, radius: float = MAIN_RADIUS_MM) -> float:
    return float(rules.clearance(np.asarray(point, dtype=np.float64)[None, :], radius)[0])


def _same_component_map(natural: dict[str, Any]) -> tuple[dict[str, str], dict[str, list[str]]]:
    by_flower: dict[str, str] = {}
    component_flowers: dict[str, list[str]] = {}
    for component in natural["components"]:
        cid = component["component_id"]
        component_flowers[cid] = component["flower_ids"]
        for flower_id in component["flower_ids"]:
            by_flower[flower_id] = cid
    return by_flower, component_flowers


def _stable_neighbor_order(tree: Any, positions: np.ndarray, index: int, ids: list[str], count: int) -> list[int]:
    distances, indices = tree.query(positions[index], k=min(count, len(positions)))
    indices = np.atleast_1d(indices).astype(int)
    return sorted(indices.tolist(), key=lambda j: (float(np.linalg.norm(positions[j] - positions[index])), ids[j]))


def _new_member_id(prefix: str, index: int) -> str:
    return f"R36{prefix}{index:06d}"


def _centerline_member(
    mid: str,
    role: str,
    points: np.ndarray,
    parent_id: str | None,
    target_id: str | None,
    *,
    component_id: str | None = None,
    representative: str | None = None,
    physical_scale: float | None = None,
    reason: str,
) -> dict[str, Any]:
    line = np.asarray(points, dtype=np.float64)
    return {
        "id": mid,
        "role": role,
        "kind": role,
        "parent_id": parent_id,
        "target_id": target_id,
        "target_component_id": component_id,
        "representative_flower_id": representative,
        "physical_scale": physical_scale,
        "points_mm": line.tolist(),
        "main_diameter_mm": MAIN_DIAMETER_MM,
        "terminal_diameter_mm": MAIN_DIAMETER_MM if physical_scale is None else min(MAIN_DIAMETER_MM, MAIN_DIAMETER_MM * float(physical_scale)),
        "taper_length_mm": TAPER_LENGTH_MM if physical_scale is not None else 0.0,
        "rule_version": "r4-v3-component-greedy-sharing-v0" if role in {"SHARED_TWIG", "FLOWER_BACK_ATTACHMENT"} else "r4-a-short-join-g-new-graph-v0",
        "reason": reason,
    }


def _materialize(member: dict[str, Any]) -> tuple[Any, np.ndarray, np.ndarray, str]:
    solid = member_solid(member)
    vertices, faces = _to_arrays(solid)
    member["bbox_mm"] = [vertices.min(axis=0).astype(float).tolist(), vertices.max(axis=0).astype(float).tolist()]
    member["mesh_volume_mm3"] = float(solid.volume())
    member["mesh_geometry_sha256"] = canonical_mesh_digest(vertices, faces)
    member["geometry_semantic_sha256"] = digest_json({
        "id": member["id"],
        "role": member["role"],
        "parent_id": member.get("parent_id"),
        "target_id": member.get("target_id"),
        "points_mm": member["points_mm"],
        "main_diameter_mm": member["main_diameter_mm"],
        "terminal_diameter_mm": member["terminal_diameter_mm"],
        "taper_length_mm": member["taper_length_mm"],
        "rule_version": member["rule_version"],
    })
    return solid, vertices, faces, member["mesh_geometry_sha256"]


def _mesh_archive(members: list[dict[str, Any]], arrays: dict[str, tuple[np.ndarray, np.ndarray]]) -> dict[str, np.ndarray]:
    all_v: list[np.ndarray] = []
    all_f: list[np.ndarray] = []
    v_offsets = [0]
    f_offsets = [0]
    ids: list[str] = []
    for member in members:
        v, f = arrays[member["id"]]
        all_v.append(np.asarray(v, dtype=np.float32))
        all_f.append(np.asarray(f, dtype=np.uint32) + np.uint32(v_offsets[-1]))
        v_offsets.append(v_offsets[-1] + len(v))
        f_offsets.append(f_offsets[-1] + len(f))
        ids.append(member["id"])
        member["mesh_vertex_range"] = [v_offsets[-2], v_offsets[-1]]
        member["mesh_face_range"] = [f_offsets[-2], f_offsets[-1]]
    return {
        "vertices": np.vstack(all_v) if all_v else np.empty((0, 3), np.float32),
        "faces": np.vstack(all_f) if all_f else np.empty((0, 3), np.uint32),
        "vertex_offsets": np.asarray(v_offsets, dtype=np.int64),
        "face_offsets": np.asarray(f_offsets, dtype=np.int64),
        "member_ids": np.asarray(ids, dtype="U40"),
    }


def _record_contact(a: str, b: str, overlap: float, purpose: str, threshold: float = POSITIVE_VOLUME_MM3) -> dict[str, Any]:
    return {"a": a, "b": b, "intersection_volume_mm3": float(overlap), "threshold_mm3": float(threshold), "positive_material_overlap": bool(overlap > threshold), "purpose": purpose}


def bind_assembly_bed_plane(
    host_vertices: np.ndarray,
    host_faces: np.ndarray,
    host_source_sha256: str,
    source_members: list[dict[str, Any]],
    *,
    uniform_scale: float = H,
    translation_z_mm: float = 0.0,
) -> dict[str, Any]:
    """Bind the plate plane to the locked Host datum in the Issue #36 assembly frame."""
    vertices = np.asarray(host_vertices, dtype=np.float64)
    faces = np.asarray(host_faces, dtype=np.int64)
    require(host_source_sha256 == HOST_SHA256, "BED_AUTHORITY_MISMATCH", "Issue #36 Host identity")
    require(vertices.ndim == 2 and vertices.shape[1] == 3 and len(vertices) > 0 and np.isfinite(vertices).all(), "BED_AUTHORITY_MISMATCH", "Host vertices")
    require(faces.ndim == 2 and faces.shape[1] == 3 and len(faces) > 0 and np.all(faces >= 0) and np.all(faces < len(vertices)), "BED_AUTHORITY_MISMATCH", "Host faces")
    require(uniform_scale == H and translation_z_mm == 0.0, "BED_AUTHORITY_MISMATCH", "Issue #36 Host transform")
    source_z = float(vertices[:, 2].min())
    datum_ids = np.flatnonzero(np.isclose(vertices[:, 2], source_z, rtol=0.0, atol=1e-10))
    require(abs(source_z) <= 1e-10 and len(datum_ids) == 1, "BED_AUTHORITY_MISMATCH", "locked Host minimum-Z datum is not unique at Z0")
    datum_faces = np.flatnonzero(np.any(faces == int(datum_ids[0]), axis=1))
    require(len(datum_faces) > 0, "BED_AUTHORITY_MISMATCH", "Host minimum-Z datum is not part of its mesh")
    roots = sorted((m for m in source_members if m.get("kind") == "ROOT_ADDITION"), key=lambda m: m.get("id", ""))
    require(len(roots) == 2 and [m.get("id") for m in roots] == ["R0000", "R0001"] and all(m.get("parent_id") == "BED" for m in roots), "BED_AUTHORITY_MISMATCH", "Issue #36 retained ROOT_ADDITION to BED source relation")
    return {
        "authority": "Issue #36 locked Host minimum-Z datum; retained R4 ROOT_ADDITION members are parented to BED",
        "source_host_path": "inputs/target/host.npz",
        "source_host_sha256": host_source_sha256,
        "source_host_min_z_mm": source_z,
        "source_host_min_z_vertex_index": int(datum_ids[0]),
        "source_host_min_z_incident_face_count": int(len(datum_faces)),
        "source_root_addition_ids": [m["id"] for m in roots],
        "source_root_parent_ids": [m["parent_id"] for m in roots],
        "source_structure_sha256": SOURCE_STRUCTURE_SHA256,
        "uniform_scale": float(uniform_scale),
        "translation_z_mm": float(translation_z_mm),
        "bed_z_mm": float(source_z * uniform_scale + translation_z_mm),
        "binding": "Issue #36 Host datum transformed by H with zero Z translation; BED is the horizontal world-Z plane through that datum",
    }


def _build_core(ctx: dict[str, Any], rules: HostRules) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any], dict[str, Any]]:
    source_members = ctx["source_members"]
    with np.load(ctx["host_path"], allow_pickle=False) as data:
        bed_authority = bind_assembly_bed_plane(
            data["vertices"],
            data["faces"],
            ctx["files"]["inputs/target/host.npz"]["sha256"],
            source_members,
            uniform_scale=float(ctx["print_assembly"]["uniform_scale"]),
            translation_z_mm=float(ctx["print_assembly"]["translation_z_mm"]),
        )
    bed_z_mm = float(bed_authority["bed_z_mm"])
    core_records = [_make_core_record(m) for m in ctx["core_members"]]
    core_records.sort(key=lambda m: m["id"])
    solids: dict[str, Any] = {}
    mesh_arrays: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    contact_rows: list[dict[str, Any]] = []
    for member in core_records:
        solid, vertices, faces, _ = _materialize(member)
        solids[member["id"]] = solid
        mesh_arrays[member["id"]] = (vertices, faces)
    core_by_id = {m["id"]: m for m in core_records}
    max_scale_error = 0.0
    centerline_failures = []
    for source in ctx["core_members"]:
        record = core_by_id[source["id"]]
        expected_points = np.asarray(source["points_mm"], dtype=np.float64) * H
        actual_points = np.asarray(record["points_mm"], dtype=np.float64)
        error = float(np.max(np.abs(expected_points - actual_points)))
        max_scale_error = max(max_scale_error, error)
        if error > 1e-10:
            centerline_failures.append(source["id"])
        if source["kind"] == "ROOT_ADDITION":
            zmin, zmax = record["bbox_mm"][0][2], record["bbox_mm"][1][2]
            require(zmin <= bed_z_mm + 1e-4 and zmax >= bed_z_mm - 1e-4, "CORE_BED_CONTACT_FAILURE", source["id"])
            contact_rows.append({"a": source["id"], "b": f"BED_Z{bed_z_mm:g}", "intersection_volume_mm3": None, "positive_material_overlap": True, "purpose": "actual generated root mesh crosses the mini bed plane"})
            continue
        line = np.asarray(record["points_mm"], dtype=np.float64)
        if not rules.valid_path(line, terminal=False):
            centerline_failures.append(source["id"] + ":host_or_corridor")

    for record in core_records:
        source = next(m for m in ctx["core_members"] if m["id"] == record["id"])
        if source["kind"] == "SHARED_CORE":
            parent = record["parent_id"]
            volume = float((solids[record["id"]] ^ solids[parent]).volume())
            contact_rows.append(_record_contact(record["id"], parent, volume, "retained SHARED_CORE parent"))
            require(volume > POSITIVE_VOLUME_MM3, "CORE_CONTACT_FAILURE", f"{record['id']}->{parent}")
        elif source["kind"] == "INTERNAL_SPATIAL_LINK":
            for endpoint in (source.get("parent_id"), source.get("target_id")):
                if endpoint in solids:
                    volume = float((solids[record["id"]] ^ solids[endpoint]).volume())
                    contact_rows.append(_record_contact(record["id"], endpoint, volume, "retained spatial-link endpoint"))
                    require(volume > POSITIVE_VOLUME_MM3, "CORE_CONTACT_FAILURE", f"{record['id']}->{endpoint}")
    # The Author's shared junction is a named source relation; prove it with actual material overlaps.
    author_junction_links = [m for m in ctx["core_members"] if m["kind"] == "INTERNAL_SPATIAL_LINK" and "AUTHOR_JUNCTION_8612" in (m.get("parent_id"), m.get("target_id"))]
    for i, first in enumerate(author_junction_links):
        for second in author_junction_links[i + 1:]:
            overlap = float((solids[first["id"]] ^ solids[second["id"]]).volume())
            if overlap > POSITIVE_VOLUME_MM3:
                contact_rows.append(_record_contact(first["id"], second["id"], overlap, "shared Author junction actual contact"))
    require(not centerline_failures, "CORE_CONTAINMENT_FAILURE", ",".join(centerline_failures[:12]))

    core_hash = digest_json([
        {k: record[k] for k in ("id", "role", "parent_id", "target_id", "points_mm", "main_diameter_mm", "terminal_diameter_mm")}
        for record in core_records
    ])
    lock = {
        "schema": "skin_mini_target_host_core_lock_v0",
        "source_structure_sha256": ctx["files"]["inputs/r4/structure.json"]["sha256"],
        "source_members": 4240,
        "retained_member_count": len(core_records),
        "retained_role_counts": {role: sum(m["role"] == role for m in core_records) for role in ("SHARED_CORE", "ROOT_ADDITION", "INTERNAL_SPATIAL_LINK")},
        "retained_ids": [m["id"] for m in core_records],
        "excluded_historical_flower_endpoints": ctx["excluded_old_endpoints"],
        "uniform_scale": H,
        "diameter_mm": MAIN_DIAMETER_MM,
        "max_centerline_scale_error_mm": max_scale_error,
        "all_root_meshes_cross_bed_z0": True,
        "bed_plane_authority": bed_authority,
        "host_corridor_failures": centerline_failures,
        "core_centerline_sha256": core_hash,
        "source_relations_contact_audit": contact_rows,
        "geometry_only_static_topology": "retained centerlines, source member IDs, declared core parent and exact retained spatial-link endpoints",
    }
    return core_records, solids, mesh_arrays, lock


def _twig_and_attachment_generation(
    ctx: dict[str, Any],
    natural: dict[str, Any],
    core_records: list[dict[str, Any]],
    core_solids: dict[str, Any],
    core_meshes: dict[str, tuple[np.ndarray, np.ndarray]],
    flowers: FlowerGeometry,
    rules: HostRules,
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, tuple[np.ndarray, np.ndarray]], list[dict[str, Any]], dict[str, Any]]:
    by_flower, component_flowers = _same_component_map(natural)
    component_records = natural["components"]
    reps = [c["representative_flower_id"] for c in component_records]
    rep_index = [flowers.index[x] for x in reps]
    orig = flowers.points[rep_index]
    normals = flowers.normals[rep_index]
    scales = flowers.scales[rep_index]
    ids = reps
    tree = cKDTree(orig)
    core_points, core_owner = _core_samples(core_records)
    core_tree = cKDTree(core_points)
    remaining = set(range(len(reps)))
    twig_records: list[dict[str, Any]] = []
    attachment_records: list[dict[str, Any]] = []
    solids: dict[str, Any] = dict(core_solids)
    mesh_arrays: dict[str, tuple[np.ndarray, np.ndarray]] = dict(core_meshes)
    route_notes: list[dict[str, Any]] = []
    twig_number = 0
    attachment_number = 0
    for seed in sorted(range(len(reps)), key=lambda i: (float(orig[i, 2]), reps[i])):
        if seed not in remaining:
            continue
        neighbor_order = _stable_neighbor_order(tree, orig, seed, ids, 24)
        group = [seed]
        for i in neighbor_order:
            if i == seed or i not in remaining:
                continue
            if np.linalg.norm(orig[i] - orig[seed]) >= TWIG_GROUP_RADIUS_MM:
                continue
            if float(normals[i] @ normals[seed]) <= 0.7:
                continue
            group.append(i)
            if len(group) == 8:
                break
        for i in group:
            remaining.remove(i)
        group_anchor_ids = [reps[i] for i in group]
        anchors = flowers.anchors[[flowers.index[x] for x in group_anchor_ids]]
        group_scales = scales[group]
        group_normals = normals[group]
        mean_anchor = np.average(anchors, axis=0, weights=group_scales)
        mean_normal = group_normals.mean(axis=0)
        mean_normal /= max(float(np.linalg.norm(mean_normal)), 1e-12)
        options = []
        neighbor_samples = _stable_neighbor_order(core_tree, core_points, 0, core_owner, 1) if False else None
        for inward_index, inward in enumerate(TWIG_INWARD_MM):
            for down_index, down in enumerate(TWIG_DOWN_MM):
                joint = mean_anchor - mean_normal * inward - np.array([0.0, 0.0, down])
                if float(rules.depth(joint)[0]) < 7.0 * H or _corridor_clearance_at(rules, joint) < 0.0:
                    continue
                if not all(rules.valid_path(np.vstack((joint, anchors[k])), terminal=True) for k in range(len(group))):
                    continue
                _, nearest = core_tree.query(joint, k=min(12, len(core_points)))
                for sample_index in sorted(np.atleast_1d(nearest).astype(int).tolist(), key=lambda j: (float(np.linalg.norm(joint-core_points[j])), core_owner[j], j)):
                    parent_point = core_points[sample_index]
                    length = float(np.linalg.norm(joint - parent_point))
                    if length < 0.1 or not rules.valid_path(np.vstack((parent_point, joint)), terminal=False):
                        continue
                    cost = length + sum(float(np.linalg.norm(joint - anchors[k])) for k in range(len(group)))
                    cost += 2.0 * max(0.0, float(parent_point[2] - joint[2]))
                    cost += sum(max(0.0, float(joint[2] - anchors[k, 2])) for k in range(len(group)))
                    options.append((cost, inward_index, down_index, sample_index, joint))
        twig_for_group: str | None = None
        joint_for_group: np.ndarray | None = None
        if options:
            _, _, _, sample_index, joint_for_group = min(options, key=lambda x: (x[0], x[1], x[2], core_owner[x[3]], x[3]))
            twig_number += 1
            twig_for_group = _new_member_id("T", twig_number)
            twig = _centerline_member(
                twig_for_group,
                "SHARED_TWIG",
                np.vstack((core_points[sample_index], joint_for_group)),
                core_owner[sample_index],
                f"R36J{twig_number:06d}",
                component_id="|".join(by_flower[fid] for fid in group_anchor_ids),
                reason="R4 V3 spatial grouping; mini-scaled 7/11/15 mm inward and 0/4/8 mm downward candidate grid",
            )
            solid, vertices, faces, _ = _materialize(twig)
            solids[twig_for_group] = solid
            mesh_arrays[twig_for_group] = (vertices, faces)
            twig_records.append(twig)
            route_notes.append({"group_representatives": group_anchor_ids, "twig_id": twig_for_group, "parent_core_id": core_owner[sample_index], "joint_mm": joint_for_group.tolist(), "route": "shared twig"})
        else:
            route_notes.append({"group_representatives": group_anchor_ids, "twig_id": None, "route": "direct core fallback", "reason": "no inherited twig candidate passed Host/corridor screen"})

        for local_index, component_index in enumerate(group):
            representative = reps[component_index]
            flower_index = flowers.index[representative]
            anchor = flowers.anchors[flower_index].copy()
            parent_id = twig_for_group
            parent_point = joint_for_group.copy() if joint_for_group is not None else None
            if parent_id is None:
                candidate_indices = np.argsort(np.linalg.norm(core_points - anchor[None, :], axis=1), kind="stable")
                valid_indices = [int(j) for j in candidate_indices if rules.valid_path(np.vstack((core_points[j], anchor)), terminal=True)]
                require(bool(valid_indices), "NO_VALID_ATTACHMENT_ROUTE", representative)
                sample_index = min(valid_indices, key=lambda j: (float(np.linalg.norm(core_points[j] - anchor)), core_owner[j], j))
                parent_id = core_owner[sample_index]
                parent_point = core_points[sample_index].copy()
            attachment_number += 1
            aid = _new_member_id("A", attachment_number)
            member = _centerline_member(
                aid,
                "FLOWER_BACK_ATTACHMENT",
                np.vstack((parent_point, anchor)),
                parent_id,
                representative,
                component_id=by_flower[representative],
                representative=representative,
                physical_scale=float(flowers.scales[flower_index]),
                reason="one direct attachment per new natural-contact component; accepted TARGET anchor_world_mm is the fixed centerline terminal",
            )
            member["anchor_binding_mm"] = anchor.tolist()
            member["attachment_component_flower_ids"] = component_flowers[by_flower[representative]]
            member["source_endpoint_formula_used"] = False
            solid, vertices, faces, _ = _materialize(member)
            parent_solid = solids[parent_id]
            parent_volume = float((solid ^ parent_solid).volume())
            flower_volume = flowers.overlap(solid, flower_index)
            require(parent_volume > POSITIVE_VOLUME_MM3, "ATTACHMENT_CONTACT_FAILURE", f"{aid}->{parent_id} overlap={parent_volume}")
            require(flower_volume > POSITIVE_VOLUME_MM3, "ATTACHMENT_CONTACT_FAILURE", f"{aid}->{representative} overlap={flower_volume}")
            member["base_parent_overlap_mm3"] = parent_volume
            member["base_representative_flower_overlap_mm3"] = flower_volume
            solids[aid] = solid
            mesh_arrays[aid] = (vertices, faces)
            attachment_records.append(member)
    require(len(attachment_records) == len(component_records), "ATTACHMENT_COUNT_MISMATCH", f"{len(attachment_records)} for {len(component_records)} components")
    return twig_records, solids, mesh_arrays, attachment_records, {"component_routes": route_notes, "by_flower_component": by_flower, "component_flowers": component_flowers}


def _apply_a_short_normal(
    attachments: list[dict[str, Any]],
    solids: dict[str, Any],
    mesh_arrays: dict[str, tuple[np.ndarray, np.ndarray]],
    flowers: FlowerGeometry,
    rules: HostRules,
    by_flower_component: dict[str, str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    deferred: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    angle_count = 0
    changed = 0
    for member in attachments:
        original_points = np.asarray(member["points_mm"], dtype=np.float64)
        a, e = original_points[-2], original_points[-1]
        vector = e - a
        length = float(np.linalg.norm(vector))
        flower_index = flowers.index[member["representative_flower_id"]]
        normal = flowers.normals[flower_index]
        cosine = float(np.clip(np.dot(vector / max(length, 1e-12), normal), -1.0, 1.0))
        angle = math.degrees(math.acos(cosine))
        member["a_short_angle_before_deg"] = angle
        if angle <= NORMAL_ANGLE_THRESHOLD_DEG:
            results.append({"id": member["id"], "status": "NOT_ELIGIBLE", "angle_before_deg": angle})
            continue
        angle_count += 1
        run = min(NORMAL_RUN_MAX_MM, length * NORMAL_RUN_FRACTION)
        collar = min(PARENT_COLLAR_MM, length * 0.15)
        knee = e - normal * run
        direction = vector / max(length, 1e-12)
        proposed = np.vstack((original_points[:-1], a + direction * collar, knee, e))
        proposed = np.asarray([p for i, p in enumerate(proposed) if i == 0 or np.linalg.norm(p - proposed[i - 1]) > 1e-8], dtype=np.float64)
        reason = None
        if not rules.valid_path(proposed, terminal=True):
            reason = "Host or protected corridor screen"
        if reason is None:
            trial = copy.deepcopy(member)
            trial["points_mm"] = proposed.tolist()
            trial["taper_length_mm"] = min(TAPER_LENGTH_MM, float(np.linalg.norm(np.diff(proposed, axis=0), axis=1)[-1]))
            try:
                solid, vertices, faces, _ = _materialize(trial)
                parent = member["parent_id"]
                parent_overlap = float((solid ^ solids[parent]).volume())
                flower_overlap = flowers.overlap(solid, flower_index)
                if parent_overlap <= POSITIVE_VOLUME_MM3 or flower_overlap <= POSITIVE_VOLUME_MM3:
                    reason = "parent or representative flower contact would be lost"
                else:
                    lo, hi = vertices.min(axis=0), vertices.max(axis=0)
                    other = flowers.broad_candidates(lo, hi)
                    cross_component = []
                    for index in other:
                        flower_id = flowers.ids[index]
                        if flower_id == member["representative_flower_id"] or by_flower_component[flower_id] == member["target_component_id"]:
                            continue
                        volume = flowers.overlap(solid, index)
                        if volume > POSITIVE_VOLUME_MM3:
                            cross_component.append({"flower_id": flower_id, "intersection_volume_mm3": volume})
                    if cross_component:
                        reason = "new contact with another natural-contact component"
                    else:
                        member["points_mm"] = trial["points_mm"]
                        member["taper_length_mm"] = trial["taper_length_mm"]
                        member["terminal_diameter_mm"] = trial["terminal_diameter_mm"]
                        for geometry_key in ("bbox_mm", "mesh_volume_mm3", "mesh_geometry_sha256", "geometry_semantic_sha256"):
                            member[geometry_key] = trial[geometry_key]
                        member["a_short_normal_run_mm"] = run
                        member["a_short_parent_collar_mm"] = collar
                        member["a_short_angle_after_deg"] = math.degrees(math.acos(float(np.clip(np.dot((e - knee) / max(np.linalg.norm(e-knee), 1e-12), normal), -1.0, 1.0))))
                        member["a_short_deferred"] = False
                        member["parent_overlap_mm3"] = parent_overlap
                        member["representative_flower_overlap_mm3"] = flower_overlap
                        solids[member["id"]] = solid
                        mesh_arrays[member["id"]] = (vertices, faces)
                        changed += 1
            except ReplayFailure as exc:
                reason = f"geometry/contact calculation: {exc.code}"
        if reason is not None:
            member["a_short_deferred"] = True
            deferred.append({"id": member["id"], "representative_flower_id": member["representative_flower_id"], "reason": reason, "base_geometry_retained": True, "angle_before_deg": angle})
            results.append({"id": member["id"], "status": "DEFERRED_BASE_RETAINED", "angle_before_deg": angle, "reason": reason})
        else:
            results.append({"id": member["id"], "status": "APPLIED", "angle_before_deg": angle, "angle_after_deg": member["a_short_angle_after_deg"], "normal_run_mm": run, "parent_collar_mm": collar})
    return results, deferred


def _core_parent_roots(members: list[dict[str, Any]]) -> dict[str, str]:
    by_id = {m["id"]: m for m in members}
    roots: dict[str, str] = {}
    for member in members:
        if member["role"] == "ROOT_ADDITION":
            roots[member["id"]] = member["id"]
            continue
        seen = set()
        current = member["id"]
        while current in by_id and current not in seen:
            seen.add(current)
            parent = by_id[current].get("parent_id")
            if parent in by_id and by_id[parent]["role"] == "ROOT_ADDITION":
                roots[member["id"]] = parent
                break
            current = parent
        if member["role"] == "SHARED_CORE":
            require(member["id"] in roots, "CORE_TOPOLOGY_MISMATCH", f"core ancestry {member['id']}")
    return roots


def _lineage_parent_id(member: dict[str, Any]) -> str | None:
    parent = member.get("parent_id")
    return parent if isinstance(parent, str) else None


def _generate_bypasses(
    records: list[dict[str, Any]],
    solids: dict[str, Any],
    mesh_arrays: dict[str, tuple[np.ndarray, np.ndarray]],
    flowers: FlowerGeometry,
    rules: HostRules,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    eligible_roles = {"ROOT_ADDITION", "SHARED_CORE", "SHARED_TWIG", "FLOWER_BACK_ATTACHMENT"}
    ports: list[np.ndarray] = []
    owners: list[str] = []
    port_parent: list[str | None] = []
    for member in sorted(records, key=lambda m: m["id"]):
        if member["role"] not in eligible_roles:
            continue
        line = np.asarray(member["points_mm"], dtype=np.float64)
        for fraction in (0.2, 0.4, 0.6, 0.8):
            point = _point_at_fraction(line, fraction)
            if float(rules.depth(point)[0]) < BYPASS_PORT_DEPTH_MM:
                continue
            if _corridor_clearance_at(rules, point, MAIN_RADIUS_MM) < 0.5 * H:
                continue
            ports.append(point)
            owners.append(member["id"])
            port_parent.append(_lineage_parent_id(member))
    if len(ports) < 2:
        return [], [], {"candidate_port_count": len(ports), "accepted_count": 0}
    port_array = np.asarray(ports, dtype=np.float64)
    tree = cKDTree(port_array)
    by_id = {m["id"]: m for m in records}
    pairs = set()
    candidates = []
    for j, upper in enumerate(port_array):
        for i in tree.query_ball_point(upper, BYPASS_MAX_LENGTH_MM):
            if i == j:
                continue
            lower = port_array[i]
            delta = upper - lower
            rise = float(delta[2])
            horizontal = float(np.linalg.norm(delta[:2]))
            length = float(np.linalg.norm(delta))
            if rise <= 0 or rise < BYPASS_MIN_RISE_MM or length < BYPASS_MIN_LENGTH_MM or length > BYPASS_MAX_LENGTH_MM:
                continue
            if rise < horizontal * BYPASS_UPWARD_SLOPE_MIN:
                continue
            aid, bid = owners[i], owners[j]
            if aid == bid or port_parent[i] == port_parent[j] or aid == port_parent[j] or bid == port_parent[i]:
                continue
            proposed_path = np.vstack((lower, upper))
            path_samples = rules.sample_polyline(proposed_path)
            if float(rules.depth(path_samples).min()) < BYPASS_PATH_DEPTH_MM:
                continue
            if not rules.valid_path(proposed_path, terminal=False, minimum_clearance=0.0):
                continue
            key = (aid, bid, tuple(np.rint(lower * 1e6).astype(int)), tuple(np.rint(upper * 1e6).astype(int)))
            if key in pairs:
                continue
            pairs.add(key)
            cost = length - 0.1 * horizontal - 0.025 * max(0.0, float(upper[2] - 100.0 * H))
            candidates.append((cost, aid, bid, i, j, lower.copy(), upper.copy(), length, rise))
    candidates.sort(key=lambda x: (x[0], x[1], x[2], x[3], x[4]))
    added: list[dict[str, Any]] = []
    contacts: list[dict[str, Any]] = []
    used_upper: set[str] = set()
    used_lower: dict[str, int] = {}
    midpoints: list[np.ndarray] = []
    rejected_counts: dict[str, int] = {}

    def reject(reason: str) -> None:
        rejected_counts[reason] = rejected_counts.get(reason, 0) + 1

    for _, lower_id, upper_id, i, j, lower, upper, length, rise in candidates:
        if upper_id in used_upper or used_lower.get(lower_id, 0) >= BYPASS_TARGETS_PER_LOWER:
            reject("lineage_budget")
            continue
        midpoint = (lower + upper) * 0.5
        if midpoints and min(float(np.linalg.norm(midpoint - p)) for p in midpoints) < BYPASS_CROWD_SPACING_MM:
            reject("crowd_spacing")
            continue
        existing_join = float((solids[lower_id] ^ solids[upper_id]).volume())
        if existing_join > BYPASS_OVERLAP_MM3:
            reject("already_materially_joined")
            continue
        bid = _new_member_id("B", len(added) + 1)
        trial = _centerline_member(bid, "ASCENDING_BYPASS", np.vstack((lower, upper)), lower_id, upper_id, reason="R4 A_SHORT_JOIN_G ascending material bypass on current mini graph")
        try:
            solid, vertices, faces, _ = _materialize(trial)
        except ReplayFailure:
            reject("member_mesh_failure")
            continue
        depth_margin, corridor_clearance = rules.screen_material(vertices, faces, BYPASS_MATERIAL_DEPTH_MM, check_corridor=True)
        if depth_margin < 0.0 or corridor_clearance < 0.0:
            reject("host_or_corridor_material_screen")
            continue
        lo, hi = vertices.min(axis=0), vertices.max(axis=0)
        flower_hits = []
        for flower_index in flowers.broad_candidates(lo, hi):
            volume = flowers.overlap(solid, flower_index)
            if volume > POSITIVE_VOLUME_MM3:
                flower_hits.append({"flower_id": flowers.ids[flower_index], "intersection_volume_mm3": volume})
                if len(flower_hits) >= 1:
                    break
        if flower_hits:
            reject("new_flower_contact")
            continue
        lower_overlap = float((solid ^ solids[lower_id]).volume())
        upper_overlap = float((solid ^ solids[upper_id]).volume())
        if lower_overlap < BYPASS_OVERLAP_MM3 or upper_overlap < BYPASS_OVERLAP_MM3:
            reject("endpoint_overlap_below_derived_threshold")
            continue
        trial["rise_mm"] = rise
        trial["length_mm"] = length
        trial["angle_above_horizontal_deg"] = math.degrees(math.atan2(rise, float(np.linalg.norm((upper - lower)[:2]))))
        trial["lower_anchor_id"] = lower_id
        trial["upper_target_id"] = upper_id
        trial["mini_endpoint_overlap_threshold_mm3"] = BYPASS_OVERLAP_MM3
        trial["parent_overlap_mm3"] = lower_overlap
        trial["target_overlap_mm3"] = upper_overlap
        trial["material_depth_margin_mm"] = depth_margin
        trial["corridor_clearance_mm"] = corridor_clearance
        added.append(trial)
        solids[bid] = solid
        mesh_arrays[bid] = (vertices, faces)
        contacts.append(_record_contact(bid, lower_id, lower_overlap, "ascending bypass lower endpoint", BYPASS_OVERLAP_MM3))
        contacts.append(_record_contact(bid, upper_id, upper_overlap, "ascending bypass upper endpoint", BYPASS_OVERLAP_MM3))
        used_upper.add(upper_id)
        used_lower[lower_id] = used_lower.get(lower_id, 0) + 1
        midpoints.append(midpoint)
    summary = {
        "candidate_port_count": len(ports),
        "candidate_pair_count": len(candidates),
        "accepted_count": len(added),
        "rejected_counts": dict(sorted(rejected_counts.items())),
        "source_endpoint_overlap_mm3": BYPASS_OVERLAP_A1_MM3,
        "source_scale": 1.0,
        "mini_scale_derivation": "0.1 mm3 * (11/15)^3",
        "mini_endpoint_overlap_threshold_mm3": BYPASS_OVERLAP_MM3,
        "max_additions_per_lower_member": BYPASS_TARGETS_PER_LOWER,
        "max_additions_per_upper_member": BYPASS_ADDITIONS_PER_UPPER,
        "max_total_count": None,
    }
    return added, contacts, summary


def _build_static_graph(
    all_members: list[dict[str, Any]],
    natural: dict[str, Any],
    contact_rows: list[dict[str, Any]],
    flower_ids: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    nodes = set(flower_ids) | {m["id"] for m in all_members}
    roots = {m["id"] for m in all_members if m["role"] == "ROOT_ADDITION"}
    adjacency: dict[str, set[str]] = {node: set() for node in nodes}

    def join(a: str, b: str) -> None:
        if a in adjacency and b in adjacency:
            adjacency[a].add(b)
            adjacency[b].add(a)

    for pair in natural["touching_pairs"]:
        join(pair["a"], pair["b"])
    # Material-contact rows are the sole authority for non-natural structural graph edges.
    for row in contact_rows:
        if row.get("positive_material_overlap") and isinstance(row.get("a"), str) and isinstance(row.get("b"), str):
            join(row["a"], row["b"])

    paths = []
    failures = []
    for flower_id in flower_ids:
        queue = [flower_id]
        parent_map = {flower_id: None}
        found = None
        for node in queue:
            if node in roots:
                found = node
                break
            for neighbor in sorted(adjacency[node]):
                if neighbor not in parent_map:
                    parent_map[neighbor] = node
                    queue.append(neighbor)
        if found is None:
            failures.append(flower_id)
            continue
        path = []
        current: str | None = found
        while current is not None:
            path.append(current)
            current = parent_map[current]
        path.reverse()
        paths.append({"flower_id": flower_id, "path_to_root_addition": path, "root_addition_id": found})
    report = {
        "schema": "skin_mini_target_static_connectivity_v0",
        "flower_count": len(flower_ids),
        "root_addition_ids": sorted(roots),
        "connected_flower_count": len(paths),
        "disconnected_flower_ids": failures,
        "all_flowers_reach_root_addition": not failures and len(paths) == len(flower_ids),
        "claim": "static declared and positive-material-contact graph reachability only; not strength, print chronology, Support, fabrication, or Print GO",
    }
    require(not failures and len(paths) == len(flower_ids), "STATIC_CONNECTIVITY_FAILURE", ",".join(failures[:20]))
    return paths, report


def generate_structure(ctx: dict[str, Any], out: Path, on_stage: Any) -> dict[str, Any]:
    start = time.perf_counter()
    placements = ctx["placements"]
    d6_vertices, d6_faces = _load_mesh_npz(ctx["d6_path"])
    flowers = FlowerGeometry(d6_vertices, d6_faces, placements, ctx["flower_ids"])
    rules = HostRules(ctx["paths"]["inputs/r4/host_domain.npz"], ctx["paths"]["inputs/r4/protected_corridors.json"])

    stage = time.perf_counter()
    natural = flowers.natural_contacts()
    (out / "NATURAL_CONTACTS.json").write_text(json.dumps(natural, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    on_stage("natural_contact", time.perf_counter() - stage, {"component_count": natural["component_count"], "pairs": natural["touching_pair_count"]})

    stage = time.perf_counter()
    core, core_solids, core_meshes, core_lock = _build_core(ctx, rules)
    (out / "HOST_CORE_LOCK.json").write_text(json.dumps(core_lock, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    on_stage("host_core_transfer", time.perf_counter() - stage, {"retained": len(core)})

    stage = time.perf_counter()
    twigs, solids, mesh_arrays, attachments, route_summary = _twig_and_attachment_generation(ctx, natural, core, core_solids, core_meshes, flowers, rules)
    stage_c = twigs + attachments
    contact_rows = list(core_lock["source_relations_contact_audit"])
    for member in twigs:
        volume = float((solids[member["id"]] ^ solids[member["parent_id"]]).volume())
        contact_rows.append(_record_contact(member["id"], member["parent_id"], volume, "SHARED_TWIG parent"))
        require(volume > POSITIVE_VOLUME_MM3, "TWIG_CONTACT_FAILURE", member["id"])
    for member in attachments:
        contact_rows.append(_record_contact(member["id"], member["parent_id"], member["base_parent_overlap_mm3"], "FLOWER_BACK_ATTACHMENT parent"))
        contact_rows.append(_record_contact(member["id"], member["representative_flower_id"], member["base_representative_flower_overlap_mm3"], "FLOWER_BACK_ATTACHMENT accepted anchor"))
    on_stage("twig_attachment", time.perf_counter() - stage, {"twigs": len(twigs), "attachments": len(attachments)})

    stage = time.perf_counter()
    normal_results, deferred = _apply_a_short_normal(attachments, solids, mesh_arrays, flowers, rules, route_summary["by_flower_component"])
    # Refresh exact parent/representative contact volumes after the accepted normal revision.
    for member in attachments:
        parent_vol = float((solids[member["id"]] ^ solids[member["parent_id"]]).volume())
        flower_index = flowers.index[member["representative_flower_id"]]
        flower_vol = flowers.overlap(solids[member["id"]], flower_index)
        require(parent_vol > POSITIVE_VOLUME_MM3 and flower_vol > POSITIVE_VOLUME_MM3, "ATTACHMENT_CONTACT_FAILURE", member["id"])
        member["parent_overlap_mm3"] = parent_vol
        member["representative_flower_overlap_mm3"] = flower_vol
        contact_rows.append(_record_contact(member["id"], member["parent_id"], parent_vol, "A_SHORT_NORMAL final parent"))
        contact_rows.append(_record_contact(member["id"], member["representative_flower_id"], flower_vol, "A_SHORT_NORMAL accepted anchor final"))
    normal_summary = {
        "eligible_angle_over_30_count": sum(x["status"] != "NOT_ELIGIBLE" for x in normal_results),
        "applied_count": sum(x["status"] == "APPLIED" for x in normal_results),
        "deferred_count": len(deferred),
        "run_max_mm": NORMAL_RUN_MAX_MM,
        "run_fraction_max": NORMAL_RUN_FRACTION,
        "parent_collar_max_mm": PARENT_COLLAR_MM,
        "taper_length_mm": TAPER_LENGTH_MM,
        "results": normal_results,
    }
    on_stage("a_short_normal", time.perf_counter() - stage, {"eligible": normal_summary["eligible_angle_over_30_count"], "applied": normal_summary["applied_count"], "deferred": len(deferred)})

    stage = time.perf_counter()
    base_records = core + stage_c
    bypasses, bypass_contacts, bypass_summary = _generate_bypasses(base_records, solids, mesh_arrays, flowers, rules)
    for record in bypasses:
        contact_rows.extend([x for x in bypass_contacts if x["a"] == record["id"]])
    on_stage("ascending_bypass", time.perf_counter() - stage, {"added": len(bypasses), "ports": bypass_summary["candidate_port_count"]})

    all_members = core + twigs + attachments + bypasses
    all_ids = [member["id"] for member in all_members]
    require(len(all_ids) == len(set(all_ids)), "DUPLICATE_MEMBER_ID", "generated structure IDs")
    source_ids = {member["id"] for member in ctx["source_members"]}
    generated = [m for m in all_members if m["role"] in {"SHARED_TWIG", "FLOWER_BACK_ATTACHMENT", "ASCENDING_BYPASS"}]
    reused = sorted(source_ids & {m["id"] for m in generated})
    require(not reused and all(m["id"].startswith("R36") for m in generated), "OLD_FLOWER_DEPENDENT_ID_REUSED", str(reused[:10]))
    for member in all_members:
        vertices, faces = mesh_arrays[member["id"]]
        observed_mesh_hash = canonical_mesh_digest(vertices, faces)
        require(observed_mesh_hash == member.get("mesh_geometry_sha256"), "MEMBER_GEOMETRY_HASH_MISMATCH", member["id"])

    # Core parent edges and explicit internal links are independently audited as exact material overlaps.
    # Non-core generated connections were measured at creation and are repeated here from final solids.
    for member in all_members:
        role = member["role"]
        if role == "ROOT_ADDITION":
            continue
        if role == "INTERNAL_SPATIAL_LINK":
            for endpoint in (member.get("parent_id"), member.get("target_id")):
                if endpoint in solids:
                    overlap = float((solids[member["id"]] ^ solids[endpoint]).volume())
                    if overlap > POSITIVE_VOLUME_MM3 and not any(x["a"] == member["id"] and x["b"] == endpoint for x in contact_rows):
                        contact_rows.append(_record_contact(member["id"], endpoint, overlap, "retained spatial link"))
            continue
        if role == "SHARED_CORE":
            continue
        if role == "SHARED_TWIG":
            overlap = float((solids[member["id"]] ^ solids[member["parent_id"]]).volume())
            require(overlap > POSITIVE_VOLUME_MM3, "TWIG_CONTACT_FAILURE", member["id"])
            contact_rows.append(_record_contact(member["id"], member["parent_id"], overlap, "final SHARED_TWIG parent"))
        elif role == "FLOWER_BACK_ATTACHMENT":
            pvol = float((solids[member["id"]] ^ solids[member["parent_id"]]).volume())
            fidx = flowers.index[member["representative_flower_id"]]
            fvol = flowers.overlap(solids[member["id"]], fidx)
            require(pvol > POSITIVE_VOLUME_MM3 and fvol > POSITIVE_VOLUME_MM3, "ATTACHMENT_CONTACT_FAILURE", member["id"])
            contact_rows.append(_record_contact(member["id"], member["parent_id"], pvol, "final attachment parent"))
            contact_rows.append(_record_contact(member["id"], member["representative_flower_id"], fvol, "final accepted anchor"))

    ancestry_paths, connectivity = _build_static_graph(all_members, natural, contact_rows, ctx["flower_ids"])
    contact_audit = {
        "schema": "skin_mini_target_contact_audit_v0",
        "positive_volume_threshold_mm3": POSITIVE_VOLUME_MM3,
        "bypass_threshold_mm3": BYPASS_OVERLAP_MM3,
        "checked_relationships": contact_rows,
        "relationship_count": len(contact_rows),
        "failed_relationships": [x for x in contact_rows if x.get("positive_material_overlap") is False],
        "new_bypass_flower_contact_count": 0,
        "static_connectivity": connectivity,
        "scope_note": "exact positive material intersections for declared endpoints and actual transformed D6; static only",
    }
    (out / "CONTACT_AUDIT.json").write_text(json.dumps(contact_audit, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (out / "DEFERRED.json").write_text(json.dumps({"schema": "skin_mini_target_deferred_v0", "count": len(deferred), "members": deferred, "twig_route_notes": route_summary["component_routes"], "a_short_normal": normal_summary}, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (out / "FLOWER_ANCESTRY.json").write_text(json.dumps({"schema": "skin_mini_target_flower_ancestry_v0", "count": len(ancestry_paths), "flowers": ancestry_paths, "component_representatives": natural["components"]}, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    records_for_hash = sorted(all_members, key=lambda m: m["id"])
    centerline_hash = digest_json([{k: m.get(k) for k in ("id", "role", "parent_id", "target_id", "points_mm")} for m in records_for_hash])
    structure_hash = digest_json([{k: m.get(k) for k in ("id", "role", "parent_id", "target_id", "target_component_id", "representative_flower_id", "points_mm", "main_diameter_mm", "terminal_diameter_mm", "taper_length_mm", "rule_version", "geometry_semantic_sha256", "mesh_geometry_sha256")} for m in records_for_hash])
    mesh_archive_data = _mesh_archive(all_members, mesh_arrays)
    mesh_archive_path = out / "MEMBER_MESHES.npz"
    np.savez_compressed(mesh_archive_path, **mesh_archive_data)
    structure = {
        "schema": "skin_mini_target_internal_structure_v0",
        "issue": "satw-jp/katachi#36",
        "source_lineage": "R4 V2 → Author A_SHORT_NORMAL → R4 A_SHORT_JOIN_G; actual generator is this bounded replay code",
        "flower_count": len(ctx["flower_ids"]),
        "natural_component_count": natural["component_count"],
        "member_count": len(all_members),
        "role_counts": {role: sum(m["role"] == role for m in all_members) for role in ("ROOT_ADDITION", "SHARED_CORE", "INTERNAL_SPATIAL_LINK", "SHARED_TWIG", "FLOWER_BACK_ATTACHMENT", "ASCENDING_BYPASS")},
        "diameter_main_mm": MAIN_DIAMETER_MM,
        "members": all_members,
        "mesh_archive": {"path": "MEMBER_MESHES.npz", "vertex_count": int(len(mesh_archive_data["vertices"])), "triangle_count": int(len(mesh_archive_data["faces"]))},
        "centerline_semantic_sha256": centerline_hash,
        "structure_semantic_sha256": structure_hash,
    }
    (out / "STRUCTURE.json").write_text(json.dumps(structure, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    summary = {
        "natural_contact_graph_sha256": natural["graph_sha256"],
        "component_representatives": [c["representative_flower_id"] for c in natural["components"]],
        "member_ids_roles": [(m["id"], m["role"]) for m in records_for_hash],
        "centerline_semantic_sha256": centerline_hash,
        "structure_semantic_sha256": structure_hash,
        "flower_ancestry_sha256": sha_file(out / "FLOWER_ANCESTRY.json"),
        "chronology_input_geometry_sha256": structure_hash,
        "natural_contact_counts": {"components": natural["component_count"], "pairs": natural["touching_pair_count"], "singletons": natural["singleton_count"]},
        "role_counts": structure["role_counts"],
        "a_short_normal": {"eligible": normal_summary["eligible_angle_over_30_count"], "applied": normal_summary["applied_count"], "deferred": normal_summary["deferred_count"]},
        "bypass": bypass_summary,
        "static_connectivity": connectivity,
        "total_stage_runtime_seconds": time.perf_counter() - start,
    }
    on_stage("static_verification", time.perf_counter() - stage, {"connected_flowers": connectivity["connected_flower_count"], "members": len(all_members)})
    return {"structure": structure, "core_lock": core_lock, "natural_contacts": natural, "contact_audit": contact_audit, "deferred": deferred, "ancestry_paths": ancestry_paths, "semantic": summary, "mesh_archive_path": mesh_archive_path, "rules": rules, "member_mesh_arrays": mesh_arrays, "member_solids": solids}


def sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()
