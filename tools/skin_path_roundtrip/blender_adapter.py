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
        combined_output = "\n".join(part for part in (result.stdout, result.stderr) if part)
        if result.returncode or "Traceback (most recent call last)" in combined_output:
            raise BlenderInputError(
                "Blender worker failed with exit code "
                f"{result.returncode}: {combined_output[-4000:]}"
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
    if index >= len(attr.data):
        return None
    item = attr.data[index]
    if hasattr(item, "vector"):
        return [float(value) for value in item.vector]
    if hasattr(item, "color"):
        return [float(value) for value in item.color]
    if hasattr(item, "value"):
        value = item.value
        if isinstance(value, bytes):
            return value.decode("utf-8")
        if type(value).__name__ == "bpy_prop_array":
            return [float(component) for component in value]
        return value
    if hasattr(item, "string"):
        value = item.string
        return value.decode("utf-8") if isinstance(value, bytes) else value
    return None

attributes = {}
for attr in mesh.attributes:
    if attr.domain in {"POINT", "EDGE"} and attr.data_type in {"INT", "FLOAT", "FLOAT_VECTOR", "FLOAT_COLOR", "BYTE_COLOR", "STRING"}:
        attributes.setdefault(attr.domain, {})[attr.name] = [attr_value(attr, i) for i in range(len(attr.data))]

matrix = obj.matrix_world
linear = [[float(matrix[row][column]) for column in range(3)] for row in range(3)]
matrix_world = [[float(matrix[row][column]) for column in range(4)] for row in range(4)]
scale = [matrix.col[i].xyz.length for i in range(3)]
det = float(matrix.to_3x3().determinant())
orthogonality = [
    float(matrix.col[0].xyz.dot(matrix.col[1].xyz)),
    float(matrix.col[0].xyz.dot(matrix.col[2].xyz)),
    float(matrix.col[1].xyz.dot(matrix.col[2].xyz)),
]
if abs(det) <= 1e-12:
    raise RuntimeError("unsupported transform: world matrix is not invertible")

vertices = []
for i, vertex in enumerate(mesh.vertices):
    co = matrix @ vertex.co
    item = {"id": f"v:{i}", "co": [float(co.x), float(co.y), float(co.z)], "attributes": {}}
    for name, values in attributes.get("POINT", {}).items():
        item["attributes"][name] = values[i] if i < len(values) else None
    vertices.append(item)

edges = []
for i, edge in enumerate(mesh.edges):
    item = {"id": f"e:{i}", "vertices": [int(edge.vertices[0]), int(edge.vertices[1])], "attributes": {}}
    for name, values in attributes.get("EDGE", {}).items():
        item["attributes"][name] = values[i] if i < len(values) else None
    edges.append(item)

payload = {
    "schema_version": "1.0",
    "frame": {
        "name": "A1_MASTER_MM",
        "unit": "mm",
        "transform": {
            "space": "WORLD",
            "matrix_world": matrix_world,
            "linear": linear,
            "translation": [float(matrix.col[3].x), float(matrix.col[3].y), float(matrix.col[3].z)],
            "column_lengths": [float(value) for value in scale],
            "orthogonality": orthogonality,
            "determinant": det,
            "invertible": True,
        },
    },
    "object_selection": {"name": object_name, "type": "MESH", "faces": 0},
    "objects": [{"name": object_name, "type": "MESH", "faces": [], "vertices": vertices, "edges": edges}],
    "extractor": {"kind": "BLENDER_HEADLESS", "blender_file": str(bpy.data.filepath), "scale": scale[0], "object_name": object_name},
}
out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
'''


_BUILD_SCRIPT = r'''
import bpy, json, sys
from pathlib import Path
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
edit_path = Path(args[0])
object_name = args[1]
out_path = Path(args[2])
rebuilt_path = Path(args[3])
selected = set(json.loads(args[4]))
rebuilt = json.loads(rebuilt_path.read_text(encoding="utf-8"))
rebuilt_object = rebuilt["objects"][0]

target = bpy.data.objects.get(object_name)
if target is None or target.type != "MESH":
    raise RuntimeError("explicit baseline object is missing or not a mesh")
if target.mode != "OBJECT":
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.mode_set(mode="OBJECT")
if len(target.data.polygons) != 0:
    raise RuntimeError("baseline object has faces; v0 accepts face-less line mesh only")

# The policy layer has already assembled the selected edit in WORLD_MM.  Keep
# the baseline object's world matrix and explicitly convert the rebuilt world
# coordinates back to its local mesh space.  This remains correct for any
# invertible transform, including non-uniform scale or shear.
world_to_local = target.matrix_world.inverted()
vertices = [tuple(world_to_local @ Vector(vertex["co"])) for vertex in rebuilt_object.get("vertices", [])]
edges = [tuple(int(value) for value in edge["vertices"]) for edge in rebuilt_object.get("edges", [])]
if any(index < 0 or index >= len(vertices) for edge in edges for index in edge):
    raise RuntimeError("rebuilt edge references a missing vertex")

old_materials = [material for material in target.data.materials]
replacement = bpy.data.meshes.new(object_name + "__PATH_ROUNDTRIP_REVIEW")
replacement.from_pydata(vertices, edges, [])
replacement.update()
for material in old_materials:
    replacement.materials.append(material)

def attr_value(item, name, default=None):
    value = item.get("attributes", {}).get(name, default)
    return value

def add_attributes(domain, items, count):
    names = sorted({name for item in items for name in item.get("attributes", {})})
    for name in names:
        values = [attr_value(item, name) for item in items]
        non_null = next((value for value in values if value is not None), None)
        if non_null is None:
            continue
        if isinstance(non_null, bool) or isinstance(non_null, int):
            data_type = "INT"
        elif isinstance(non_null, float):
            data_type = "FLOAT"
        elif isinstance(non_null, str):
            data_type = "STRING"
        else:
            continue
        attribute = replacement.attributes.new(name, data_type, domain)
        for index, value in enumerate(values[:count]):
            if value is None:
                continue
            if data_type == "STRING":
                attribute.data[index].value = str(value).encode("utf-8")
            elif data_type == "INT":
                attribute.data[index].value = int(value)
            else:
                attribute.data[index].value = float(value)

add_attributes("POINT", rebuilt_object.get("vertices", []), len(vertices))
add_attributes("EDGE", rebuilt_object.get("edges", []), len(edges))
target.data = replacement
target["skin_path_roundtrip_changed_scopes"] = sorted(selected)
target["skin_path_roundtrip_source_edit"] = str(edit_path)
target["skin_path_roundtrip_transform_policy"] = "WORLD_MM payload converted to baseline local; baseline matrix_world preserved"
target["skin_path_roundtrip_rebuilt_object"] = object_name
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
payload = None
if all(checks.values()):
    mesh = obj.data
    matrix = obj.matrix_world
    linear = [[float(matrix[row][column]) for column in range(3)] for row in range(3)]
    matrix_world = [[float(matrix[row][column]) for column in range(4)] for row in range(4)]
    det = float(matrix.to_3x3().determinant())
    def attr_value(attr, index):
        if index >= len(attr.data):
            return None
        item = attr.data[index]
        if hasattr(item, "vector"):
            return [float(value) for value in item.vector]
        if hasattr(item, "color"):
            return [float(value) for value in item.color]
        if hasattr(item, "value"):
            value = item.value
            if isinstance(value, bytes):
                return value.decode("utf-8")
            if type(value).__name__ == "bpy_prop_array":
                return [float(component) for component in value]
            return value
        if hasattr(item, "string"):
            value = item.string
            return value.decode("utf-8") if isinstance(value, bytes) else value
        return None
    attributes = {"POINT": {}, "EDGE": {}}
    for attr in mesh.attributes:
        if attr.domain in attributes and attr.data_type in {"INT", "FLOAT", "FLOAT_VECTOR", "FLOAT_COLOR", "BYTE_COLOR", "STRING"}:
            name = attr.name
            if name.endswith(".001") and name[:-4] in {"source_branch_index", "source_branch_id", "source_edge_index"}:
                name = name[:-4]
            attributes[attr.domain][name] = [attr_value(attr, index) for index in range(len(attr.data))]
    vertices = []
    for index, vertex in enumerate(mesh.vertices):
        co = matrix @ vertex.co
        vertices.append({"id": f"v:{index}", "co": [float(co.x), float(co.y), float(co.z)], "attributes": {name: values[index] if index < len(values) else None for name, values in attributes["POINT"].items()}})
    edges = []
    for index, edge in enumerate(mesh.edges):
        edges.append({"id": f"e:{index}", "vertices": [int(edge.vertices[0]), int(edge.vertices[1])], "attributes": {name: values[index] if index < len(values) else None for name, values in attributes["EDGE"].items()}})
    payload = {
        "schema_version": "1.0",
        "frame": {"name": "A1_MASTER_MM", "unit": "mm", "transform": {"space": "WORLD", "matrix_world": matrix_world, "linear": linear, "determinant": det, "invertible": abs(det) > 1e-12}},
        "object_selection": {"name": object_name, "type": "MESH", "faces": 0},
        "objects": [{"name": object_name, "type": "MESH", "faces": [], "vertices": vertices, "edges": edges}],
    }
    checks["changed_scopes_recorded"] = isinstance(obj.get("skin_path_roundtrip_changed_scopes"), list)
    checks["transform_invertible"] = abs(det) > 1e-12
report_path.write_text(json.dumps({"status": "PASS" if all(checks.values()) else "FAIL", "checks": checks, "reopened": True, "extract": payload, "changed_scopes": obj.get("skin_path_roundtrip_changed_scopes") if obj is not None else None, "provenance": "DERIVED separate Blender reopen"}, indent=2), encoding="utf-8")
'''


def extract_blend(executable: str, blend: Path, object_name: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    _run_blender(executable, blend, _EXTRACT_SCRIPT, [str(output), object_name])
    if not output.is_file():
        raise BlenderInputError(f"Blender extraction did not create the expected output: {output}")


def build_review_blend(
    executable: str,
    baseline_blend: Path,
    edit_blend: Path,
    baseline_object_name: str,
    output: Path,
    selected_scopes: list[str],
    rebuilt_extract: dict[str, Any],
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    rebuilt_path = output.parent / "rebuilt_extract_for_blender.json"
    rebuilt_path.write_text(json.dumps(rebuilt_extract, indent=2, ensure_ascii=False), encoding="utf-8")
    _run_blender(
        executable,
        baseline_blend,
        _BUILD_SCRIPT,
        [str(edit_blend), baseline_object_name, str(output), str(rebuilt_path), json.dumps(selected_scopes)],
    )
    if not output.is_file():
        raise BlenderInputError(f"Blender build did not create the expected output: {output}")


def verify_review_blend(executable: str, blend: Path, object_name: str, report_path: Path) -> dict[str, Any]:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    _run_blender(executable, blend, _VERIFY_SCRIPT, [str(report_path), object_name])
    if not report_path.is_file():
        raise BlenderInputError(f"Blender verification did not create the expected report: {report_path}")
    return json.loads(report_path.read_text(encoding="utf-8"))
