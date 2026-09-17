"""Small headless-Blender boundary for the path roundtrip helper.

This module deliberately contains no diff or impact policy.  It only extracts
one explicitly named, face-less mesh in world millimetres and, when requested,
copies that mesh into a new review .blend.  Source files are opened read-only
and never saved in place.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any


class BlenderUnavailable(RuntimeError):
    pass


class BlenderInputError(RuntimeError):
    pass


def find_blender(explicit: str | None = None) -> str | None:
    """Return an explicit or PATH-installed Blender executable."""

    if explicit:
        candidate = Path(explicit)
        return str(candidate) if candidate.exists() else None
    for name in ("blender", "blender.exe"):
        for directory in os.environ.get("PATH", "").split(os.pathsep):
            if not directory:
                continue
            candidate = Path(directory) / name
            if candidate.exists():
                return str(candidate)
    return None


def _run_blender(executable: str, blend: Path, script: str, args: list[str]) -> None:
    with tempfile.TemporaryDirectory(prefix="skin-path-roundtrip-") as temp_dir:
        script_path = Path(temp_dir) / "worker.py"
        script_path.write_text(script, encoding="utf-8")
        command = [executable, "--background", str(blend), "--python", str(script_path), "--", *args]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode:
            raise BlenderInputError(
                "Blender worker failed with exit code "
                f"{result.returncode}: {result.stderr[-4000:]}"
            )


_EXTRACT_SCRIPT = r'''
import bpy, hashlib, json, sys
from pathlib import Path
from mathutils import Matrix

args = sys.argv[sys.argv.index("--") + 1:]
out = Path(args[0])
object_name = args[1]
objects = [o for o in bpy.data.objects if o.name == object_name]
if len(objects) != 1:
    raise RuntimeError("explicit object selection did not resolve uniquely: " + object_name)
obj = objects[0]
if obj.type != "MESH":
    raise RuntimeError("unsupported object type: " + obj.type)
mesh = obj.data
if len(mesh.polygons) != 0:
    raise RuntimeError("unsupported face-bearing mesh; v0 accepts face-less line mesh only")

def attr_value(attr, index):
    item = attr.data[index]
    if hasattr(item, "value"):
        return item.value
    if hasattr(item, "vector"):
        return list(item.vector)
    if hasattr(item, "color"):
        return list(item.color)
    if hasattr(item, "string"):
        return item.string
    return None

attributes = {}
for attr in mesh.attributes:
    if attr.domain in {"POINT", "EDGE"} and attr.data_type in {"INT", "FLOAT", "FLOAT_VECTOR", "FLOAT_COLOR", "BYTE_COLOR", "STRING"}:
        attributes.setdefault(attr.domain, {})[attr.name] = [attr_value(attr, i) for i in range(len(attr.data))]

matrix = obj.matrix_world
scale = [matrix.col[i].xyz.length for i in range(3)]
det = matrix.to_3x3().determinant()
uniform = max(scale) - min(scale) <= 1e-6
if not uniform or det <= 0:
    raise RuntimeError("unsupported transform: non-uniform scale, shear, or reflection")

vertices = []
for i, vertex in enumerate(mesh.vertices):
    co = matrix @ vertex.co
    item = {"id": f"v:{i}", "co": [float(co.x), float(co.y), float(co.z)], "attributes": {}}
    for name, values in attributes.get("POINT", {}).items():
        item["attributes"][name] = values[i]
    vertices.append(item)

edges = []
for i, edge in enumerate(mesh.edges):
    item = {"id": f"e:{i}", "vertices": [int(edge.vertices[0]), int(edge.vertices[1])], "attributes": {}}
    for name, values in attributes.get("EDGE", {}).items():
        item["attributes"][name] = values[i]
    edges.append(item)

payload = {
    "schema_version": "1.0",
    "frame": {"name": "A1_MASTER_MM", "unit": "mm", "transform": "WORLD"},
    "object_selection": {"name": object_name, "type": "MESH", "faces": 0},
    "objects": [{"name": object_name, "type": "MESH", "faces": [], "vertices": vertices, "edges": edges}],
    "extractor": {"kind": "BLENDER_HEADLESS", "blender_file": str(bpy.data.filepath), "scale": scale[0]},
}
out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
'''


_BUILD_SCRIPT = r'''
import bpy, json, sys
from pathlib import Path

args = sys.argv[sys.argv.index("--") + 1:]
edit_path = Path(args[0])
object_name = args[1]
out_path = Path(args[2])
selected = set(json.loads(args[3]))
branch_map = {str(key): str(value) for key, value in json.loads(args[4]).items()}

target = bpy.data.objects.get(object_name)
if target is None or target.type != "MESH":
    raise RuntimeError("explicit baseline object is missing or not a mesh")
if len(target.data.polygons) != 0:
    raise RuntimeError("baseline object has faces; v0 accepts face-less line mesh only")

with bpy.data.libraries.load(str(edit_path), link=False) as (data_from, data_to):
    if object_name not in data_from.objects:
        raise RuntimeError("explicit edit object is missing: " + object_name)
    data_to.objects = [object_name]
edit_object = next((o for o in data_to.objects if o is not None), None)
if edit_object is None or edit_object.type != "MESH" or len(edit_object.data.polygons) != 0:
    raise RuntimeError("unsupported edit object")

# Rebuild the target line mesh from baseline material plus selected edit
# branches. Stable source_vertex_index attributes are the only correspondence
# used; Blender array order and .001 names never participate.
base_mesh = target.data
edit_mesh = edit_object.data
def attr(mesh, name, domain, index, default=None):
    item = mesh.attributes.get(name)
    if item is None or item.domain != domain or index >= len(item.data):
        return default
    return item.data[index].value
def branch_id(mesh, edge_index):
    raw = attr(mesh, "source_branch_index", "EDGE", edge_index, 0)
    return branch_map.get(str(raw)) if raw else None
def vertex_key(mesh, vertex_index):
    raw = attr(mesh, "source_vertex_index", "POINT", vertex_index, None)
    return str(raw) if raw is not None else None

def keyed_indices(mesh):
    result = {}
    for index in range(len(mesh.vertices)):
        key = vertex_key(mesh, index)
        if key is None:
            continue
        if key in result:
            raise RuntimeError("stable source_vertex_index is not one-to-one")
        result[key] = index
    return result
base_key_to_index = keyed_indices(base_mesh)
edit_key_to_index = keyed_indices(edit_mesh)
vertices = [tuple(v.co) for v in base_mesh.vertices]
vertex_source_values = [attr(base_mesh, "source_vertex_index", "POINT", i, 0) for i in range(len(base_mesh.vertices))]
key_to_new_index = dict(base_key_to_index)
def ensure_edit_vertex(edit_index):
    key = vertex_key(edit_mesh, edit_index)
    if key is not None and key in key_to_new_index:
        return key_to_new_index[key]
    new_index = len(vertices)
    vertices.append(tuple(edit_mesh.vertices[edit_index].co))
    vertex_source_values.append(attr(edit_mesh, "source_vertex_index", "POINT", edit_index, 0))
    if key is not None:
        key_to_new_index[key] = new_index
    return new_index

# Selected vertices retain the edited local coordinate; all other baseline
# vertices and all unselected baseline edges are preserved.
for key, edit_index in edit_key_to_index.items():
    if any(branch_map.get(str(attr(edit_mesh, "source_branch_index", "EDGE", edge_index, 0))) in selected for edge_index, edge in enumerate(edit_mesh.edges) if edit_index in edge.vertices):
        vertices[key_to_new_index[key]] = tuple(edit_mesh.vertices[edit_index].co)

edges = []
edge_branch_values = []
for edge_index, edge in enumerate(base_mesh.edges):
    branch = branch_id(base_mesh, edge_index)
    if branch in selected:
        continue
    edges.append((int(edge.vertices[0]), int(edge.vertices[1])))
    edge_branch_values.append(attr(base_mesh, "source_branch_index", "EDGE", edge_index, 0))
for edge_index, edge in enumerate(edit_mesh.edges):
    branch = branch_id(edit_mesh, edge_index)
    scope = "edge:e:" + str(edge_index)
    if branch not in selected and scope not in selected:
        continue
    a = ensure_edit_vertex(int(edge.vertices[0]))
    b = ensure_edit_vertex(int(edge.vertices[1]))
    edges.append((a, b))
    edge_branch_values.append(attr(edit_mesh, "source_branch_index", "EDGE", edge_index, 0))

old_materials = [material for material in base_mesh.materials]
replacement = bpy.data.meshes.new(object_name + "__PATH_ROUNDTRIP_REVIEW")
replacement.from_pydata(vertices, edges, [])
replacement.update()
for material in old_materials:
    replacement.materials.append(material)
if vertex_source_values:
    attribute = replacement.attributes.new("source_vertex_index", "INT", "POINT")
    for index, value in enumerate(vertex_source_values[:len(replacement.vertices)]):
        attribute.data[index].value = int(value or 0)
if edge_branch_values:
    attribute = replacement.attributes.new("source_branch_index", "INT", "EDGE")
    for index, value in enumerate(edge_branch_values[:len(replacement.edges)]):
        attribute.data[index].value = int(value or 0)
target.data = replacement
target["skin_path_roundtrip_changed_scopes"] = sorted(selected)
target["skin_path_roundtrip_source_edit"] = str(edit_path)
bpy.ops.wm.save_as_mainfile(filepath=str(out_path))
'''


_VERIFY_SCRIPT = r'''
import bpy, json, sys
from pathlib import Path

args = sys.argv[sys.argv.index("--") + 1:]
report_path = Path(args[0])
object_name = args[1]
obj = bpy.data.objects.get(object_name)
checks = {
    "object_present": obj is not None,
    "mesh": obj is not None and obj.type == "MESH",
    "face_less": obj is not None and obj.type == "MESH" and len(obj.data.polygons) == 0,
}
if obj is not None:
    checks["changed_scopes_recorded"] = isinstance(obj.get("skin_path_roundtrip_changed_scopes"), list)
report_path.write_text(json.dumps({"status": "PASS" if all(checks.values()) else "FAIL", "checks": checks, "reopened": True, "provenance": "DERIVED separate Blender reopen"}, indent=2), encoding="utf-8")
'''


def extract_blend(executable: str, blend: Path, object_name: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    _run_blender(executable, blend, _EXTRACT_SCRIPT, [str(output), object_name])


def build_review_blend(
    executable: str,
    baseline_blend: Path,
    edit_blend: Path,
    object_name: str,
    output: Path,
    selected_scopes: list[str],
    branch_map: dict[str, str] | None = None,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    _run_blender(
        executable,
        baseline_blend,
        _BUILD_SCRIPT,
        [str(edit_blend), object_name, str(output), json.dumps(selected_scopes), json.dumps(branch_map or {})],
    )


def verify_review_blend(executable: str, blend: Path, object_name: str, report_path: Path) -> dict[str, Any]:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    _run_blender(executable, blend, _VERIFY_SCRIPT, [str(report_path), object_name])
    return json.loads(report_path.read_text(encoding="utf-8"))
