"""Pure-Python policy and data operations for SKIN_R4 path roundtrip v0.

The module intentionally treats Blender as an adapter.  Everything here works
on a small, versioned extraction JSON so the important decisions can be tested
without opening or writing a .blend file.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Iterable


CHANGE_CLASSES = (
    "UNCHANGED",
    "POINT_MOVED",
    "PATH_SUBDIVIDED",
    "PATH_REROUTED",
    "EDGE_ADDED",
    "EDGE_DELETED",
    "JUNCTION_CHANGED",
    "LOOSE_VERTEX",
    "AMBIGUOUS_MAPPING",
    "UNSUPPORTED_INPUT",
)

STABLE_VERTEX_ATTRIBUTES = (
    "source_vertex_index",
    "source_vertex_id",
    "original_vertex_index",
    "source_id",
    "stable_id",
)


class RoundtripError(RuntimeError):
    """A fail-closed input, mapping, resolution, or verification error."""


class PathResolutionError(RoundtripError):
    pass


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RoundtripError(f"cannot read JSON {path}: {exc}") from exc


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _normalise_windows(value: str) -> str:
    return value.replace("/", "\\").rstrip("\\").casefold()


def _is_windows_absolute(value: str) -> bool:
    return bool(re.match(r"^[A-Za-z]:[\\/]", value) or value.startswith("\\\\"))


def _root_mappings(roots: Any) -> list[dict[str, str]]:
    if isinstance(roots, dict):
        mappings = roots.get("mappings", roots.get("roots", []))
    else:
        mappings = roots
    if isinstance(mappings, dict):
        mappings = [{"prefix": key, "root": value} for key, value in mappings.items()]
    if not isinstance(mappings, list):
        raise PathResolutionError("roots.json must contain a mappings list")
    result = []
    for item in mappings:
        if not isinstance(item, dict) or not item.get("prefix") or not item.get("root"):
            raise PathResolutionError("each roots.json mapping needs prefix and root")
        result.append({"prefix": str(item["prefix"]), "root": str(item["root"])})
    return sorted(result, key=lambda item: len(_normalise_windows(item["prefix"])), reverse=True)


def resolve_path(raw: str, roots: Any, base_dir: Path) -> Path:
    """Resolve an explicit path through a declared old-prefix mapping.

    Absolute Windows paths intentionally fail closed when they are not mapped.
    This prevents an old Drive prefix, a date fallback, or a similarly named
    copy from becoming an authority by accident.
    """

    raw = str(raw)
    if not _is_windows_absolute(raw):
        return (base_dir / raw).resolve()
    raw_key = _normalise_windows(raw)
    for mapping in _root_mappings(roots):
        prefix_key = _normalise_windows(mapping["prefix"])
        if raw_key == prefix_key or raw_key.startswith(prefix_key + "\\"):
            suffix = raw[len(mapping["prefix"]):].lstrip("\\/")
            root = Path(mapping["root"])
            if not root.is_absolute():
                root = base_dir / root
            root_resolved = root.resolve()
            resolved = (root_resolved / suffix).resolve()
            if resolved != root_resolved and root_resolved not in resolved.parents:
                raise PathResolutionError(f"mapped path escapes declared root: {raw}")
            return resolved
    raise PathResolutionError(f"absolute path is not declared in roots.json: {raw}")


def input_descriptors(manifest: dict[str, Any], edit_override: str | None = None) -> list[dict[str, Any]]:
    raw_inputs = manifest.get("inputs", manifest.get("input_files", []))
    if isinstance(raw_inputs, dict):
        raw_inputs = [dict(value, name=name) if isinstance(value, dict) else {"name": name, "path": value} for name, value in raw_inputs.items()]
    if not isinstance(raw_inputs, list):
        raise RoundtripError("manifest inputs must be a list or object")
    result = []
    for item in raw_inputs:
        if not isinstance(item, dict) or not item.get("path"):
            raise RoundtripError("each manifest input needs an explicit path")
        result.append(dict(item))
    if edit_override:
        edit_name = "edit_blend"
        existing = next((item for item in result if item.get("name") == edit_name), None)
        if existing is None:
            result.append({"name": edit_name, "path": edit_override, "role": "AUTHOR_EDIT"})
        else:
            existing["path"] = edit_override
    if not result:
        raise RoundtripError("manifest has no inputs")
    return result


def build_input_lock(manifest: dict[str, Any], roots: Any, manifest_dir: Path, edit_override: str | None = None) -> dict[str, Any]:
    entries = []
    errors = []
    for item in input_descriptors(manifest, edit_override):
        raw_path = str(item["path"])
        try:
            resolved = resolve_path(raw_path, roots, manifest_dir)
            exists = resolved.is_file()
            actual_hash = sha256_file(resolved) if exists else None
        except (OSError, PathResolutionError) as exc:
            resolved = None
            exists = False
            actual_hash = None
            errors.append(f"{item.get('name', raw_path)}: {exc}")
        expected = item.get("sha256", item.get("expected_sha256"))
        hash_ok = bool(exists and (expected is None or str(expected).lower() == actual_hash))
        if not exists:
            errors.append(f"{item.get('name', raw_path)}: input file is missing")
        elif not hash_ok:
            errors.append(f"{item.get('name', raw_path)}: sha256 mismatch")
        entries.append(
            {
                "name": item.get("name", raw_path),
                "role": item.get("role", "UNSPECIFIED"),
                "authority": item.get("authority", "UNSPECIFIED"),
                "declared_path": raw_path,
                "resolved_path": str(resolved) if resolved else None,
                "expected_sha256": expected,
                "actual_sha256": actual_hash,
                "exists": exists,
                "hash_ok": hash_ok,
            }
        )
    payload = {
        "schema_version": "1.0",
        "candidate_id": manifest.get("candidate_id"),
        "baseline_id": manifest.get("baseline_id"),
        "source_revision": manifest.get("source_revision"),
        "frame": manifest.get("frame", {"name": "A1_MASTER_MM", "unit": "mm"}),
        "status": "PASS" if not errors else "BLOCKED",
        "errors": errors,
        "inputs": entries,
    }
    payload["lock_sha256"] = stable_hash(payload)
    return payload


def lock_entry(lock: dict[str, Any], name: str) -> dict[str, Any]:
    for item in lock.get("inputs", []):
        if item.get("name") == name:
            return item
    raise RoundtripError(f"INPUT_LOCK has no named input: {name}")


def load_locked_input(lock: dict[str, Any], name: str) -> Path:
    item = lock_entry(lock, name)
    if lock.get("status") != "PASS" or not item.get("exists") or not item.get("hash_ok"):
        raise RoundtripError(f"input is not locked and verified: {name}")
    path = Path(str(item["resolved_path"]))
    if not path.is_file() or sha256_file(path) != item.get("actual_sha256"):
        raise RoundtripError(f"input changed after lock: {name}")
    return path


def _attribute(item: dict[str, Any], name: str, default: Any = None) -> Any:
    attrs = item.get("attributes", {})
    if isinstance(attrs, dict) and name in attrs:
        return attrs[name]
    return item.get(name, default)


def _point(value: Any) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise RoundtripError(f"point must have three coordinates: {value!r}")
    return [float(value[0]), float(value[1]), float(value[2])]


def _dist(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _member_record(member: dict[str, Any], branch_index: int | None = None) -> dict[str, Any]:
    item = copy.deepcopy(member)
    if "id" not in item and "branch_id" in item:
        item["id"] = item["branch_id"]
    if branch_index is not None:
        item.setdefault("branch_index", branch_index)
    if "points_mm" in item:
        item["points_mm"] = [_point(point) for point in item["points_mm"]]
    return item


def _object_from_members(name: str, members: list[dict[str, Any]], source: dict[str, Any] | None = None) -> dict[str, Any]:
    vertices: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    for branch_index, raw_member in enumerate(members, 1):
        member = _member_record(raw_member, branch_index)
        member_id = str(member.get("id", f"member:{branch_index}"))
        points = member.get("points_mm", [])
        first = len(vertices)
        source_indices = member.get("source_vertex_indices")
        for point_index, point in enumerate(points):
            source_index = None
            if isinstance(source_indices, list) and point_index < len(source_indices):
                source_index = source_indices[point_index]
            attrs: dict[str, Any] = {
                "source_branch_id": member_id,
                "source_branch_index": member.get("branch_index", branch_index),
            }
            if source_index is not None:
                attrs["source_vertex_index"] = int(source_index) + 1
            else:
                attrs["source_vertex_id"] = f"{member_id}:{point_index}"
            vertices.append({"id": f"v:{len(vertices)}", "co": point, "attributes": attrs})
        for point_index in range(max(0, len(points) - 1)):
            attrs = {
                "source_branch_id": member_id,
                "source_branch_index": member.get("branch_index", branch_index),
            }
            source_edges = member.get("source_edge_indices")
            if isinstance(source_edges, list) and point_index < len(source_edges):
                attrs["source_edge_index"] = int(source_edges[point_index]) + 1
            edges.append(
                {
                    "id": f"e:{len(edges)}",
                    "vertices": [first + point_index, first + point_index + 1],
                    "attributes": attrs,
                }
            )
    result = {"name": name, "type": "MESH", "faces": [], "vertices": vertices, "edges": edges, "members": [_member_record(item) for item in members]}
    if source and isinstance(source.get("frame"), dict):
        result["frame"] = copy.deepcopy(source["frame"])
    return result


def normalize_extract(document: Any, object_name: str | None = None) -> dict[str, Any]:
    """Convert PATH_BASELINE/structure/extract JSON into one canonical object."""

    if not isinstance(document, dict):
        raise RoundtripError("geometry document must be a JSON object")
    if "branches" in document and isinstance(document["branches"], list):
        members = []
        for branch in document["branches"]:
            source_record = branch.get("source_record") if isinstance(branch, dict) else None
            members.append(_member_record(source_record or branch, branch.get("index") if isinstance(branch, dict) else None))
        result = _object_from_members(object_name or "INTERNAL_PATHS_EDIT__A1_100PCT", members, document)
        return {"schema_version": "1.0", "frame": {"name": "A1_MASTER_MM", "unit": "mm"}, "objects": [result]}
    if "members" in document and isinstance(document["members"], list) and "objects" not in document:
        result = _object_from_members(object_name or "STRUCTURE_MEMBERS", document["members"], document)
        return {"schema_version": "1.0", "frame": {"name": "A1_MASTER_MM", "unit": "mm"}, "objects": [result]}

    raw_objects = document.get("objects")
    if isinstance(raw_objects, dict):
        raw_objects = [dict(value, name=name) if isinstance(value, dict) else {"name": name, "value": value} for name, value in raw_objects.items()]
    if raw_objects is None and "vertices" in document and "edges" in document:
        raw_objects = [document]
    if not isinstance(raw_objects, list) or not raw_objects:
        raise RoundtripError("extract JSON has no objects")
    candidates = [item for item in raw_objects if isinstance(item, dict) and (object_name is None or item.get("name") == object_name)]
    if object_name is not None and len(candidates) != 1:
        raise RoundtripError(f"explicit object selection did not resolve uniquely: {object_name}")
    if object_name is None and len(candidates) != 1:
        raise RoundtripError("extract JSON requires an explicit unique object selection")
    raw = candidates[0]
    obj = copy.deepcopy(raw)
    obj.setdefault("name", object_name or "OBJECT")
    obj.setdefault("type", "MESH")
    obj.setdefault("faces", obj.get("polygons", []))
    obj.setdefault("vertices", [])
    obj.setdefault("edges", [])
    for index, vertex in enumerate(obj["vertices"]):
        vertex.setdefault("id", f"v:{index}")
        vertex["co"] = _point(vertex.get("co", vertex.get("coordinate")))
        vertex.setdefault("attributes", {})
    for index, edge in enumerate(obj["edges"]):
        edge.setdefault("id", f"e:{index}")
        edge["vertices"] = [int(edge["vertices"][0]), int(edge["vertices"][1])]
        edge.setdefault("attributes", {})
    if "members" in obj:
        obj["members"] = [_member_record(member) for member in obj["members"]]
    return {"schema_version": document.get("schema_version", "1.0"), "frame": copy.deepcopy(document.get("frame", {"name": "A1_MASTER_MM", "unit": "mm"})), "objects": [obj]}


def load_normalized_json(path: Path, object_name: str | None = None) -> dict[str, Any]:
    return normalize_extract(read_json(path), object_name)


def selected_object(extract: dict[str, Any], object_name: str | None = None) -> dict[str, Any]:
    objects = extract.get("objects", [])
    candidates = [obj for obj in objects if object_name is None or obj.get("name") == object_name]
    if len(candidates) != 1:
        raise RoundtripError("canonical extract object selection is not unique")
    return candidates[0]


def _vertex_key(vertex: dict[str, Any]) -> str | None:
    for name in STABLE_VERTEX_ATTRIBUTES:
        value = _attribute(vertex, name)
        if value is not None and value != "":
            return f"{name}:{value}"
    raw_id = vertex.get("id")
    if raw_id and not str(raw_id).startswith("v:"):
        return f"id:{raw_id}"
    return None


def _vertex_keys(obj: dict[str, Any]) -> dict[int, str]:
    return {index: key for index, vertex in enumerate(obj.get("vertices", [])) if (key := _vertex_key(vertex)) is not None}


def _edge_branch_id(edge: dict[str, Any], branch_by_index: dict[str, str] | None = None) -> str | None:
    for name in ("source_branch_id", "branch_id", "member_id"):
        value = _attribute(edge, name)
        if value not in (None, ""):
            return str(value)
    index = _attribute(edge, "source_branch_index")
    if index is not None and branch_by_index:
        return branch_by_index.get(str(index))
    return None


def _member_table(obj: dict[str, Any], fallback: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    explicit = obj.get("members")
    if isinstance(explicit, list):
        return {str(item.get("id")): _member_record(item) for item in explicit if item.get("id") is not None}
    fallback_members = _member_table(fallback, None) if fallback else {}
    fallback_by_index = {str(item.get("branch_index")): key for key, item in fallback_members.items() if item.get("branch_index") is not None}
    vertices = obj.get("vertices", [])
    groups: dict[str, dict[str, Any]] = {}
    for edge in obj.get("edges", []):
        branch_id = _edge_branch_id(edge, fallback_by_index)
        if branch_id is None:
            continue
        group = groups.setdefault(branch_id, {"id": branch_id, "points_mm": [], "edge_ids": [], "vertex_ids": []})
        group["edge_ids"].append(edge.get("id"))
        for vertex_index in edge.get("vertices", []):
            if vertex_index not in group["vertex_ids"]:
                group["vertex_ids"].append(vertex_index)
    for branch_id, group in groups.items():
        group["points_mm"] = [_point(vertices[index].get("co")) for index in group["vertex_ids"]]
        if branch_id in fallback_members:
            enriched = copy.deepcopy(fallback_members[branch_id])
            enriched["points_mm"] = group["points_mm"]
            enriched["edge_ids"] = group["edge_ids"]
            enriched["vertex_ids"] = group["vertex_ids"]
            group = enriched
        groups[branch_id] = group
    return groups


def decorate_with_baseline_ids(obj: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    """Add recorded branch IDs to an edit extraction using explicit attributes."""

    result = copy.deepcopy(obj)
    baseline_members = _member_table(baseline)
    by_index = {str(member.get("branch_index")): branch_id for branch_id, member in baseline_members.items() if member.get("branch_index") is not None}
    for edge in result.get("edges", []):
        if _edge_branch_id(edge, by_index) is None:
            index = _attribute(edge, "source_branch_index")
            if index is not None and str(index) in by_index:
                edge.setdefault("attributes", {})["source_branch_id"] = by_index[str(index)]
    return result


def _map_vertices(base_obj: dict[str, Any], edit_obj: dict[str, Any], tolerance: float) -> dict[str, Any]:
    base_keys = _vertex_keys(base_obj)
    edit_keys = _vertex_keys(edit_obj)
    base_by_key: dict[str, list[int]] = {}
    edit_by_key: dict[str, list[int]] = {}
    for index, key in base_keys.items():
        base_by_key.setdefault(key, []).append(index)
    for index, key in edit_keys.items():
        edit_by_key.setdefault(key, []).append(index)
    pairs: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []
    used_base: set[int] = set()
    used_edit: set[int] = set()
    for key in sorted(set(base_by_key) | set(edit_by_key)):
        left = base_by_key.get(key, [])
        right = edit_by_key.get(key, [])
        if len(left) > 1 or len(right) > 1:
            ambiguous.append({"key": key, "baseline_indices": left, "edit_indices": right, "reason": "stable key is not one-to-one"})
            continue
        if left and right:
            pairs.append({"baseline_index": left[0], "edit_index": right[0], "key": key, "method": "STABLE_ATTRIBUTE"})
            used_base.add(left[0])
            used_edit.add(right[0])
    remaining_base = [i for i in range(len(base_obj.get("vertices", []))) if i not in used_base]
    remaining_edit = [i for i in range(len(edit_obj.get("vertices", []))) if i not in used_edit]
    for edit_index in remaining_edit:
        candidates = [
            base_index
            for base_index in remaining_base
            if _dist(_point(base_obj["vertices"][base_index]["co"]), _point(edit_obj["vertices"][edit_index]["co"])) <= tolerance
        ]
        if len(candidates) == 1:
            base_index = candidates[0]
            pairs.append({"baseline_index": base_index, "edit_index": edit_index, "key": None, "method": "UNIQUE_COORDINATE"})
            remaining_base.remove(base_index)
            used_base.add(base_index)
            used_edit.add(edit_index)
        elif len(candidates) > 1:
            ambiguous.append({"edit_index": edit_index, "baseline_indices": candidates, "reason": "coordinate match is not unique"})
    return {
        "pairs": pairs,
        "ambiguous": ambiguous,
        "unmatched_baseline": [i for i in range(len(base_obj.get("vertices", []))) if i not in used_base],
        "unmatched_edit": [i for i in range(len(edit_obj.get("vertices", []))) if i not in used_edit],
    }


def _mapped_vertex_token(index: int, obj: dict[str, Any], reverse: dict[int, str] | None = None) -> str:
    if reverse and index in reverse:
        return reverse[index]
    return _vertex_key(obj["vertices"][index]) or f"index:{index}"


def _edge_signatures(obj: dict[str, Any], branch_by_index: dict[str, str] | None = None, reverse_edit: dict[int, str] | None = None) -> dict[str, set[tuple[str, str]]]:
    result: dict[str, set[tuple[str, str]]] = {}
    for edge in obj.get("edges", []):
        branch_id = _edge_branch_id(edge, branch_by_index)
        if branch_id is None:
            continue
        endpoints = edge.get("vertices", [])
        if len(endpoints) != 2:
            continue
        a = _mapped_vertex_token(int(endpoints[0]), obj, reverse_edit)
        b = _mapped_vertex_token(int(endpoints[1]), obj, reverse_edit)
        result.setdefault(branch_id, set()).add(tuple(sorted((a, b))))
    return result


def _degree_by_key(obj: dict[str, Any], key_for_index: dict[int, str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for edge in obj.get("edges", []):
        endpoints = edge.get("vertices", [])
        if len(endpoints) != 2:
            continue
        for index in endpoints:
            key = key_for_index.get(int(index))
            if key is not None:
                result[key] = result.get(key, 0) + 1
    return result


def _operation(op_class: str, scope: str, reason: str, **details: Any) -> dict[str, Any]:
    item = {"class": op_class, "scope": scope, "reason": reason, "provenance": "DERIVED"}
    item.update(details)
    return item


def _unsupported_reasons(base_obj: dict[str, Any], edit_obj: dict[str, Any], baseline_extract: dict[str, Any], edit_extract: dict[str, Any]) -> list[str]:
    reasons = []
    for label, obj in (("baseline", base_obj), ("edit", edit_obj)):
        if str(obj.get("type", "MESH")).upper() != "MESH":
            reasons.append(f"{label} object is not MESH")
        if obj.get("faces") or obj.get("polygons"):
            reasons.append(f"{label} object has faces")
        if not isinstance(obj.get("vertices"), list) or not isinstance(obj.get("edges"), list):
            reasons.append(f"{label} object is not a line mesh extract")
    for label, extract in (("baseline", baseline_extract), ("edit", edit_extract)):
        frame = extract.get("frame", {})
        if frame and frame.get("unit") not in (None, "mm", "MILLIMETERS"):
            reasons.append(f"{label} frame unit is not millimetres")
        transform = frame.get("transform") if isinstance(frame, dict) else None
        if isinstance(transform, dict) and transform.get("supported") is False:
            reasons.append(f"{label} transform is marked unsupported")
    return reasons


def analyze_diff(baseline_extract: dict[str, Any], edit_extract: dict[str, Any], policy: dict[str, Any] | None = None, object_name: str | None = None) -> dict[str, Any]:
    policy = policy or {}
    tolerance = float(policy.get("point_tolerance_mm", 1e-4))
    base_obj = selected_object(baseline_extract, object_name)
    edit_obj = selected_object(edit_extract, object_name or base_obj.get("name"))
    edit_obj = decorate_with_baseline_ids(edit_obj, base_obj)
    unsupported = _unsupported_reasons(base_obj, edit_obj, baseline_extract, edit_extract)
    base_members = _member_table(base_obj)
    edit_members = _member_table(edit_obj, base_obj)
    branch_by_index = {str(member.get("branch_index")): branch_id for branch_id, member in base_members.items() if member.get("branch_index") is not None}
    mapping = _map_vertices(base_obj, edit_obj, tolerance)
    reverse_edit: dict[int, str] = {}
    base_token_for_index = _vertex_keys(base_obj)
    for pair in mapping["pairs"]:
        token = base_token_for_index.get(pair["baseline_index"]) or f"index:{pair['baseline_index']}"
        reverse_edit[pair["edit_index"]] = token
    base_edges = _edge_signatures(base_obj, branch_by_index)
    edit_edges = _edge_signatures(edit_obj, branch_by_index, reverse_edit)
    operations: list[dict[str, Any]] = []
    if unsupported:
        operations.append(_operation("UNSUPPORTED_INPUT", "__object__", "; ".join(unsupported), reasons=unsupported))
    if mapping["ambiguous"]:
        operations.append(_operation("AMBIGUOUS_MAPPING", "__object__", "one-to-one stable mapping could not be proven", cases=mapping["ambiguous"]))

    branch_ids = sorted(set(base_members) | set(edit_members) | set(base_edges) | set(edit_edges))
    for branch_id in branch_ids:
        in_base = branch_id in base_members or branch_id in base_edges
        in_edit = branch_id in edit_members or branch_id in edit_edges
        if in_base and not in_edit:
            operations.append(_operation("EDGE_DELETED", branch_id, "recorded branch is absent from edited line mesh"))
            continue
        if in_edit and not in_base:
            operations.append(_operation("EDGE_ADDED", branch_id, "edited line mesh contains a branch without a baseline identity"))
            continue
        base_member = base_members.get(branch_id, {})
        edit_member = edit_members.get(branch_id, {})
        baseline_points = base_member.get("points_mm", [])
        edit_points = edit_member.get("points_mm", [])
        moved_distances = []
        if baseline_points and edit_points and len(baseline_points) == len(edit_points):
            moved_distances = [_dist(_point(a), _point(b)) for a, b in zip(baseline_points, edit_points)]
        moved_indices = [index for index, distance in enumerate(moved_distances) if distance > tolerance]
        base_signature = base_edges.get(branch_id, set())
        edit_signature = edit_edges.get(branch_id, set())
        if len(edit_signature) > len(base_signature) and base_signature:
            operations.append(_operation("PATH_SUBDIVIDED", branch_id, "edited branch retains identity while adding line segments", baseline_edges=len(base_signature), edited_edges=len(edit_signature)))
        elif base_signature != edit_signature and base_signature and edit_signature:
            operations.append(_operation("PATH_REROUTED", branch_id, "edited branch connectivity is different from baseline"))
        elif moved_indices:
            op_class = "POINT_MOVED" if len(moved_indices) <= 1 else "PATH_REROUTED"
            operations.append(_operation(op_class, branch_id, "recorded branch coordinates changed", moved_point_count=len(moved_indices), max_deviation_mm=max(moved_distances)))
        if base_member and edit_member:
            for field in ("target_id", "parent_id"):
                if base_member.get(field) != edit_member.get(field) and field in edit_member:
                    operations.append(_operation("JUNCTION_CHANGED", branch_id, f"recorded {field} changed", field=field, baseline=base_member.get(field), edited=edit_member.get(field)))

    # A topology edit without a source branch attribute is a new/deleted edge,
    # never a guessed branch. The extraction edge id is stable within this
    # explicit extraction and is the only scope accepted by the Blender
    # adapter for such a local edge.
    base_unassigned = {str(edge.get("id")) for edge in base_obj.get("edges", []) if _edge_branch_id(edge, branch_by_index) is None}
    edit_unassigned = {str(edge.get("id")) for edge in edit_obj.get("edges", []) if _edge_branch_id(edge, branch_by_index) is None}
    for edge_id in sorted(edit_unassigned - base_unassigned):
        operations.append(_operation("EDGE_ADDED", f"edge:{edge_id}", "edited edge has no recorded branch identity"))
    for edge_id in sorted(base_unassigned - edit_unassigned):
        operations.append(_operation("EDGE_DELETED", f"edge:{edge_id}", "baseline edge with no recorded branch identity is absent from edit"))

    base_key_for_index = _vertex_keys(base_obj)
    edit_key_for_index = reverse_edit
    base_degrees = _degree_by_key(base_obj, base_key_for_index)
    edit_degrees = _degree_by_key(edit_obj, edit_key_for_index)
    for key in sorted(set(base_degrees) & set(edit_degrees)):
        if base_degrees[key] != edit_degrees[key]:
            operations.append(_operation("JUNCTION_CHANGED", key, "shared endpoint degree changed", baseline_degree=base_degrees[key], edited_degree=edit_degrees[key]))
    for index in mapping["unmatched_edit"]:
        degree = sum(int(index) in edge.get("vertices", []) for edge in edit_obj.get("edges", []))
        if degree <= 1:
            operations.append(_operation("LOOSE_VERTEX", str(edit_obj["vertices"][index].get("id", f"v:{index}")), "edited vertex has no proven connected continuation"))
    known_classes = {item["class"] for item in operations}
    if not operations:
        operations.append(_operation("UNCHANGED", "__object__", "stable IDs, topology, and coordinates are unchanged"))
    else:
        # UNCHANGED is a summary class only; changed runs do not claim it.
        operations = [item for item in operations if item["class"] != "UNCHANGED"]
    for index, item in enumerate(operations, 1):
        item["operation_id"] = f"delta-{index:04d}"
    counts = {name: sum(item["class"] == name for item in operations) for name in CHANGE_CLASSES}
    status = "UNSUPPORTED" if unsupported else "AMBIGUOUS" if mapping["ambiguous"] else "PASS"
    return {
        "schema_version": "1.0",
        "status": status,
        "object_name": base_obj.get("name"),
        "policy": {"point_tolerance_mm": tolerance},
        "mapping": {
            "status": "AMBIGUOUS" if mapping["ambiguous"] else "PASS",
            "pairs": mapping["pairs"],
            "ambiguous": mapping["ambiguous"],
            "unmatched_baseline": mapping["unmatched_baseline"],
            "unmatched_edit": mapping["unmatched_edit"],
            "provenance": "DERIVED from explicit attributes and unique coordinates only",
        },
        "operations": operations,
        "counts": counts,
        "affected_scopes": sorted({item["scope"] for item in operations if item["class"] != "UNCHANGED"}),
        "baseline_metrics": {"vertices": len(base_obj.get("vertices", [])), "edges": len(base_obj.get("edges", [])), "faces": len(base_obj.get("faces", [])), "members": len(base_members)},
        "edit_metrics": {"vertices": len(edit_obj.get("vertices", [])), "edges": len(edit_obj.get("edges", [])), "faces": len(edit_obj.get("faces", [])), "members": len(edit_members)},
    }


def member_table_for_extract(extract: dict[str, Any], object_name: str | None = None) -> dict[str, dict[str, Any]]:
    return _member_table(selected_object(extract, object_name), None)


def compute_impact(delta: dict[str, Any], baseline_extract: dict[str, Any], edit_extract: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    baseline = member_table_for_extract(baseline_extract, delta.get("object_name"))
    edited = member_table_for_extract(edit_extract, delta.get("object_name"))
    support = manifest.get("support_ledger", manifest.get("support", {}))
    anchors = support.get("anchors", []) if isinstance(support, dict) else []
    anchor_by_member: dict[str, list[str]] = {}
    for anchor in anchors:
        if isinstance(anchor, dict):
            member_id = anchor.get("member_id", anchor.get("branch_id"))
            if member_id is not None:
                anchor_by_member.setdefault(str(member_id), []).append(str(anchor.get("id", "UNNAMED_ANCHOR")))
    items: list[dict[str, Any]] = []
    for operation in delta.get("operations", []):
        op_class = operation.get("class")
        scope = str(operation.get("scope"))
        reasons: list[str] = []
        support_ids: list[str] = []
        if op_class in {"AMBIGUOUS_MAPPING", "UNSUPPORTED_INPUT", "LOOSE_VERTEX"}:
            reasons.append("UNKNOWN_SCOPE")
        if scope in anchor_by_member:
            reasons.append("ANCHOR_CHANGED")
            support_ids.extend(anchor_by_member[scope])
        if op_class in {"POINT_MOVED", "PATH_SUBDIVIDED", "PATH_REROUTED", "EDGE_ADDED", "EDGE_DELETED", "JUNCTION_CHANGED"}:
            reasons.append("SPATIAL_RECHECK")
        if scope in baseline and scope in edited:
            for field in ("target_id", "parent_id"):
                if baseline[scope].get(field) != edited[scope].get(field):
                    reasons.append("TARGET_CHANGED")
        if op_class == "EDGE_DELETED" or (scope in baseline and scope not in edited):
            reasons.append("TARGET_DELETED")
        if not reasons:
            reasons.append("UNKNOWN_SCOPE")
        items.append({"scope": scope, "operation_id": operation.get("operation_id"), "reasons": sorted(set(reasons)), "support_ids": sorted(set(support_ids)), "provenance": "DERIVED"})
    if not items:
        items.append({"scope": "__none__", "operation_id": None, "reasons": [], "support_ids": [], "provenance": "DERIVED"})
    status = "NOT_REVALIDATED" if delta.get("status") == "PASS" else "BLOCKED"
    return {
        "schema_version": "1.0",
        "status": status,
        "support_validity": "NOT_REVALIDATED",
        "printability": "NOT_EVALUATED",
        "author_acceptance": "PENDING",
        "items": items,
        "summary": {reason: sum(reason in item["reasons"] for item in items) for reason in ("ANCHOR_CHANGED", "TARGET_CHANGED", "TARGET_DELETED", "SPATIAL_RECHECK", "CHRONOLOGY_STALE", "EVIDENCE_STALE", "UNKNOWN_SCOPE")},
        "note": "This report identifies affected Support evidence; it does not modify or validate Support, printability, or physical strength.",
    }


def _member_digest(member: dict[str, Any]) -> str:
    return stable_hash(member)


def rebuild_changed_extract(baseline_extract: dict[str, Any], edit_extract: dict[str, Any], delta: dict[str, Any], selected_operation_ids: Iterable[str]) -> dict[str, Any]:
    selected_ids = set(selected_operation_ids)
    operations = [item for item in delta.get("operations", []) if item.get("operation_id") in selected_ids]
    if delta.get("status") != "PASS":
        raise RoundtripError("build-review is fail-closed for ambiguous or unsupported mapping")
    if not operations and not (delta.get("counts", {}).get("UNCHANGED", 0) == 1):
        raise RoundtripError("resolution selects no delta operation")
    scopes = {str(item.get("scope")) for item in operations}
    result = copy.deepcopy(baseline_extract)
    base_obj = selected_object(result, delta.get("object_name"))
    edit_obj = selected_object(edit_extract, delta.get("object_name"))
    edit_obj = decorate_with_baseline_ids(edit_obj, base_obj)
    base_members = _member_table(base_obj)
    edit_members = _member_table(edit_obj, base_obj)
    changed_members = []
    preserved_members = []
    for member_id, member in base_members.items():
        if member_id in scopes:
            if member_id not in edit_members:
                continue
            changed_members.append(member_id)
        else:
            preserved_members.append(member_id)
    merged_members = []
    for member_id in preserved_members:
        merged_members.append(copy.deepcopy(base_members[member_id]))
    for member_id in changed_members:
        merged_members.append(copy.deepcopy(edit_members[member_id]))
    if "members" in base_obj:
        base_obj["members"] = merged_members
    # Raw line data remains a forensic baseline snapshot.  The explicit
    # material plan tells the Blender adapter which object is replaced; this
    # avoids silently rebuilding unrelated branches in a JSON-only review.
    result["roundtrip_review"] = {
        "changed_scopes": sorted(scopes),
        "changed_members": sorted(changed_members),
        "preserved_members": sorted(preserved_members),
        "provenance": "DERIVED plan; source and baseline inputs remain untouched",
    }
    return result


def verify_json_rebuild(baseline_extract: dict[str, Any], edit_extract: dict[str, Any], rebuilt: dict[str, Any], delta: dict[str, Any]) -> dict[str, Any]:
    base = member_table_for_extract(baseline_extract, delta.get("object_name"))
    edit = member_table_for_extract(edit_extract, delta.get("object_name"))
    rebuilt_table = member_table_for_extract(rebuilt, delta.get("object_name"))
    changed = set(rebuilt.get("roundtrip_review", {}).get("changed_members", []))
    failures = []
    for member_id, member in base.items():
        if member_id in changed:
            if member_id not in edit or member_id not in rebuilt_table or _member_digest(edit[member_id]) != _member_digest(rebuilt_table[member_id]):
                failures.append(f"changed member not materialized: {member_id}")
        elif member_id not in rebuilt_table or _member_digest(member) != _member_digest(rebuilt_table[member_id]):
            failures.append(f"unmodified member changed: {member_id}")
    return {"status": "PASS" if not failures else "FAIL", "failures": failures, "changed_members": sorted(changed), "provenance": "DERIVED verification"}


def validate_resolution(resolution: dict[str, Any], delta: dict[str, Any], input_lock: dict[str, Any]) -> list[str]:
    errors = []
    if resolution.get("schema_version") != "1.0":
        errors.append("resolution schema_version must be 1.0")
    if resolution.get("delta_sha256") != stable_hash(delta):
        errors.append("resolution delta_sha256 is stale")
    if resolution.get("input_lock_sha256") != input_lock.get("lock_sha256"):
        errors.append("resolution input_lock_sha256 is stale")
    known = {item.get("operation_id") for item in delta.get("operations", [])}
    selected = resolution.get("selected_operation_ids", [])
    if not isinstance(selected, list) or any(item not in known for item in selected):
        errors.append("resolution selects an unknown operation")
    if delta.get("status") != "PASS":
        errors.append("delta is not PASS")
    for item in delta.get("operations", []):
        if item.get("class") in {"AMBIGUOUS_MAPPING", "UNSUPPORTED_INPUT"} and item.get("operation_id") in selected:
            errors.append("resolution cannot select ambiguous or unsupported operation")
    return errors


def audit_historical_intent(
    baseline_extract: dict[str, Any],
    author_intent: dict[str, Any],
    common_structure_changes: list[dict[str, Any]],
    tolerance_mm: float = 1e-4,
) -> dict[str, Any]:
    """Check the supplied historical A1 intent without opening or changing Blender.

    This is an evidence check, not a generator. It verifies that the recorded
    eight subdivision IDs and nine connector IDs exist as author intent, that
    the subdivided path endpoints retain the recorded original endpoints, and
    that the explicitly ignored loose vertex remains an ignored record.
    """

    members = _member_table(selected_object(baseline_extract))
    subdivisions = author_intent.get("subdivided_core_paths", [])
    connectors = author_intent.get("added_connectors", [])
    failures: list[str] = []
    endpoint_deviations: dict[str, float] = {}
    for item in subdivisions:
        member_id = str(item.get("id"))
        member = members.get(member_id)
        points = item.get("points_mm", [])
        if member is None:
            failures.append(f"missing recorded subdivision member: {member_id}")
            continue
        if len(points) < 3:
            failures.append(f"subdivision intent has fewer than three points: {member_id}")
            continue
        original = member.get("points_mm", [])
        if not original:
            failures.append(f"baseline member has no points: {member_id}")
            continue
        deviation = max(_dist(_point(original[0]), _point(points[0])), _dist(_point(original[-1]), _point(points[-1])))
        endpoint_deviations[member_id] = deviation
        if deviation > tolerance_mm:
            failures.append(f"recorded original endpoint moved beyond tolerance: {member_id}")
    subdivision_ids = [str(item.get("id")) for item in subdivisions]
    connector_ids = [str(item.get("id")) for item in connectors]
    if len(subdivisions) != 8 or len(set(subdivision_ids)) != len(subdivision_ids):
        failures.append("historical intent does not contain eight unique subdivided core paths")
    if len(connectors) != 9 or len(set(connector_ids)) != len(connector_ids):
        failures.append("historical intent does not contain nine unique added connectors")
    common_ids = [str(item.get("id")) for item in common_structure_changes]
    if set(common_ids) != set(subdivision_ids + connector_ids) or len(common_ids) != 17:
        failures.append("common_structure_changes does not equal the recorded 8+9 intent IDs")
    loose = author_intent.get("ignored_loose_vertex")
    if not isinstance(loose, dict) or loose.get("index") is None or not loose.get("reason"):
        failures.append("ignored loose vertex record is incomplete")
    return {
        "schema_version": "1.0",
        "status": "PASS" if not failures else "FAIL",
        "subdivided_core_paths": len(subdivisions),
        "added_connectors": len(connectors),
        "common_changes": len(common_structure_changes),
        "baseline_metrics": {"members": len(members), "vertices": len(selected_object(baseline_extract).get("vertices", [])), "edges": len(selected_object(baseline_extract).get("edges", []))},
        "endpoint_deviation_max_mm": max(endpoint_deviations.values(), default=0.0),
        "ignored_loose_vertex": loose,
        "failures": failures,
        "provenance": "RECORDED AUTHOR_INTENT/common_structure_changes plus DERIVED endpoint check",
    }
