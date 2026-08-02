#!/usr/bin/env python3
"""Reconstruct a Hikari Blender study sidecar in Blender 4.x or newer.

Usage:
  blender file.blend --python tools/blender/import_hikari_study.py -- case.json
  blender --background --python tools/blender/import_hikari_study.py -- case.json --clear --save scene.blend

The importer preserves Hikari source coordinates and applies the sidecar's
explicit Y-up to Blender Z-up root transform. It never guesses a fabrication
axis and never silently rotates individual meshes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

try:
    import bmesh
    import bpy
    from mathutils import Matrix, Quaternion, Vector
except ImportError as exc:  # Makes an accidental normal-Python invocation clear.
    raise SystemExit("This script must be run by Blender 4.x (bpy is unavailable).") from exc


FORMAT = "hikari-blender-study"
FORMAT_VERSION = 2


def fail(message: str) -> "NoReturn":
    raise ValueError(f"Invalid Hikari Blender study: {message}")


def exact_object(value: Any, required: set[str], optional: set[str], path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{path} must be an object")
    missing = required - value.keys()
    extra = value.keys() - required - optional
    if missing:
        fail(f"{path}.{sorted(missing)[0]} is missing")
    if extra:
        fail(f"{path}.{sorted(extra)[0]} is not supported")
    return value


def finite(value: Any, path: str, *, positive: bool = False, nonnegative: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail(f"{path} must be finite")
    result = float(value)
    if positive and result <= 0:
        fail(f"{path} must be positive")
    if nonnegative and result < 0:
        fail(f"{path} must be non-negative")
    return result


def string(value: Any, path: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        fail(f"{path} must be a non-empty string")
    return value


def vec3(value: Any, path: str) -> tuple[float, float, float]:
    obj = exact_object(value, {"x", "y", "z"}, set(), path)
    return tuple(finite(obj[key], f"{path}.{key}") for key in ("x", "y", "z"))


def rgb(value: Any, path: str) -> tuple[float, float, float]:
    obj = exact_object(value, {"r", "g", "b"}, set(), path)
    return tuple(finite(obj[key], f"{path}.{key}", nonnegative=True) for key in ("r", "g", "b"))


def validate_pose(value: Any, path: str) -> None:
    obj = exact_object(value, {"position", "rotation", "uniformScale"}, set(), path)
    vec3(obj["position"], f"{path}.position")
    rotation = exact_object(obj["rotation"], {"x", "y", "z", "w"}, set(), f"{path}.rotation")
    q = [finite(rotation[k], f"{path}.rotation.{k}") for k in ("x", "y", "z", "w")]
    if math.sqrt(sum(v * v for v in q)) < 1e-12:
        fail(f"{path}.rotation must not be zero")
    finite(obj["uniformScale"], f"{path}.uniformScale", positive=True)


def validate_material(value: Any, path: str) -> None:
    obj = exact_object(value, {"id", "label", "ior", "absorptionPerMm", "roughness"}, set(), path)
    string(obj["id"], f"{path}.id")
    string(obj["label"], f"{path}.label")
    finite(obj["ior"], f"{path}.ior", positive=True)
    rgb(obj["absorptionPerMm"], f"{path}.absorptionPerMm")
    roughness = finite(obj["roughness"], f"{path}.roughness")
    if not 0 <= roughness <= 1:
        fail(f"{path}.roughness must be in 0..1")


def validate_medium(value: Any, path: str) -> None:
    obj = exact_object(value, {"id", "material", "shape", "pose"}, set(), path)
    string(obj["id"], f"{path}.id")
    validate_material(obj["material"], f"{path}.material")
    shape = exact_object(obj["shape"], {"kind", "balls", "smoothness"}, set(), f"{path}.shape")
    if shape["kind"] != "balls-smooth-union" or not isinstance(shape["balls"], list) or not shape["balls"]:
        fail(f"{path}.shape must be a non-empty balls-smooth-union")
    for index, ball_value in enumerate(shape["balls"]):
        ball = exact_object(ball_value, {"center", "radius"}, set(), f"{path}.shape.balls[{index}]")
        vec3(ball["center"], f"{path}.shape.balls[{index}].center")
        finite(ball["radius"], f"{path}.shape.balls[{index}].radius", positive=True)
    finite(shape["smoothness"], f"{path}.shape.smoothness")
    validate_pose(obj["pose"], f"{path}.pose")


def validate_sidecar(value: Any) -> dict[str, Any]:
    root = exact_object(value, {"format", "formatVersion", "case", "units", "coordinateSystem", "geometry", "optics", "camera", "environment", "unsupported", "approximations"}, set(), "sidecar")
    if root["format"] != FORMAT:
        fail("unsupported format")
    if root["formatVersion"] == 1:
        fail("formatVersion 1 was superseded before release; export a formatVersion 2 sidecar")
    if root["formatVersion"] != FORMAT_VERSION:
        fail(f"unsupported formatVersion {root['formatVersion']!r}")
    case = exact_object(root["case"], {"caseId", "appVersion", "commit", "createdAt"}, set(), "case")
    for key in case:
        string(case[key], f"case.{key}")
    units = exact_object(root["units"], {"length", "physicalScale"}, set(), "units")
    if units["length"] != "millimetres":
        fail("unit contract must be millimetres")
    scale = exact_object(units["physicalScale"], {"mmPerShapeUnit", "source"}, set(), "units.physicalScale")
    finite(scale["mmPerShapeUnit"], "units.physicalScale.mmPerShapeUnit", positive=True)
    if scale["source"] not in {"assumed", "derived-from-mesh", "author"}:
        fail("units.physicalScale.source is invalid")
    coordinates = exact_object(root["coordinateSystem"], {"source", "target", "sourceToTarget3x3", "policy"}, set(), "coordinateSystem")
    if coordinates["source"] != "hikari-right-handed-y-up" or coordinates["target"] != "blender-right-handed-z-up":
        fail("coordinateSystem source/target is unsupported")
    if coordinates["sourceToTarget3x3"] != [1, 0, 0, 0, 0, -1, 0, 1, 0]:
        fail("coordinateSystem.sourceToTarget3x3 must map (x,y,z) to (x,-z,y)")
    if coordinates["policy"] != "root-transform":
        fail("coordinateSystem.policy must be root-transform")

    geometry = exact_object(root["geometry"], {"host", "inclusions", "meshes"}, set(), "geometry")
    validate_medium(geometry["host"], "geometry.host")
    if not isinstance(geometry["inclusions"], list):
        fail("geometry.inclusions must be an array")
    for index, inclusion in enumerate(geometry["inclusions"]):
        validate_medium(inclusion, f"geometry.inclusions[{index}]")
    meshes = exact_object(geometry["meshes"], {"assets"}, {"resolution", "triangleCount", "watertight", "scaleMmPerUnit"}, "geometry.meshes")
    if not isinstance(meshes["assets"], list):
        fail("geometry.meshes.assets must be an array")
    for index, asset_value in enumerate(meshes["assets"]):
        asset = exact_object(asset_value, {"filename", "format", "role", "mediumId", "purpose", "space"}, {"sha256"}, f"geometry.meshes.assets[{index}]")
        string(asset["filename"], f"asset[{index}].filename")
        asset_path = Path(asset["filename"])
        if asset_path.is_absolute() or ".." in asset_path.parts:
            fail(f"asset[{index}].filename must stay relative to the sidecar")
        string(asset["mediumId"], f"asset[{index}].mediumId")
        if asset["format"] not in {"obj", "stl", "ply", "glb"} or asset["role"] not in {"host", "inclusion", "receiver"}:
            fail(f"asset[{index}] has an invalid format or role")
        if asset["purpose"] not in {"primary", "check"}:
            fail(f"asset[{index}].purpose is invalid")
        if asset["space"] not in {"medium-local", "hikari-world"}:
            fail(f"asset[{index}].space is invalid")
        if "sha256" in asset and (
            not isinstance(asset["sha256"], str)
            or len(asset["sha256"]) != 64
            or any(character not in "0123456789abcdefABCDEF" for character in asset["sha256"])
        ):
            fail(f"asset[{index}].sha256 is invalid")
    for field, positive in (("resolution", True), ("triangleCount", False)):
        if field in meshes:
            number = meshes[field]
            if isinstance(number, bool) or not isinstance(number, int) or number < (1 if positive else 0):
                fail(f"geometry.meshes.{field} must be a {'positive' if positive else 'non-negative'} integer")
    if "watertight" in meshes and not isinstance(meshes["watertight"], bool):
        fail("geometry.meshes.watertight must be boolean")
    if "scaleMmPerUnit" in meshes:
        finite(meshes["scaleMmPerUnit"], "geometry.meshes.scaleMmPerUnit", positive=True)

    optics = exact_object(root["optics"], {"hostMaterial", "inclusionMaterials", "light", "receiver", "boundaryEpsilonShapeUnits", "sunAngularDiameterDeg"}, set(), "optics")
    validate_material(optics["hostMaterial"], "optics.hostMaterial")
    if not isinstance(optics["inclusionMaterials"], list) or len(optics["inclusionMaterials"]) != len(geometry["inclusions"]):
        fail("optics.inclusionMaterials count must match inclusions")
    for index, material in enumerate(optics["inclusionMaterials"]):
        validate_material(material, f"optics.inclusionMaterials[{index}]")
    if geometry["host"]["material"] != optics["hostMaterial"]:
        fail("host material copies disagree")
    for index, inclusion in enumerate(geometry["inclusions"]):
        if inclusion["material"] != optics["inclusionMaterials"][index]:
            fail(f"inclusion material {index} copies disagree")
    light = exact_object(optics["light"], {"direction", "radiance"}, set(), "optics.light")
    direction = Vector(vec3(light["direction"], "optics.light.direction"))
    if direction.length < 1e-12:
        fail("optics.light.direction must be non-zero")
    rgb(light["radiance"], "optics.light.radiance")
    finite(optics["sunAngularDiameterDeg"], "optics.sunAngularDiameterDeg", positive=True)
    receiver = exact_object(optics["receiver"], {"id", "pose", "normal"}, set(), "optics.receiver")
    string(receiver["id"], "optics.receiver.id")
    validate_pose(receiver["pose"], "optics.receiver.pose")
    if Vector(vec3(receiver["normal"], "optics.receiver.normal")).length < 1e-12:
        fail("optics.receiver.normal must be non-zero")
    finite(optics["boundaryEpsilonShapeUnits"], "optics.boundaryEpsilonShapeUnits", positive=True)

    camera = exact_object(root["camera"], {"position", "target", "fov", "aspect"}, set(), "camera")
    for key in ("position", "target"):
        if not isinstance(camera[key], list) or len(camera[key]) != 3:
            fail(f"camera.{key} must be a three-item array")
        for index, item in enumerate(camera[key]):
            finite(item, f"camera.{key}[{index}]")
    fov = finite(camera["fov"], "camera.fov", positive=True)
    if fov >= 180:
        fail("camera.fov must be below 180 degrees")
    finite(camera["aspect"], "camera.aspect", positive=True)

    environment = exact_object(root["environment"], {"world", "exposure", "viewTransform", "renderer", "notes"}, set(), "environment")
    string(environment["world"], "environment.world")
    string(environment["viewTransform"], "environment.viewTransform")
    finite(environment["exposure"], "environment.exposure")
    if environment["renderer"] not in {"cycles", "eevee", "unspecified"}:
        fail("environment.renderer is invalid")
    for field in ("notes",):
        if not isinstance(environment[field], list) or any(not isinstance(v, str) or not v.strip() for v in environment[field]):
            fail(f"environment.{field} must be an array of non-empty strings")
    for field in ("unsupported", "approximations"):
        if not isinstance(root[field], list) or any(not isinstance(v, str) or not v.strip() for v in root[field]):
            fail(f"{field} must be an array of non-empty strings")
    return root


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sidecar", type=Path)
    parser.add_argument("--clear", action="store_true", help="delete existing scene objects before import")
    parser.add_argument("--save", type=Path, help="save the reconstructed .blend after import")
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def imported_objects(path: Path, file_format: str) -> list[Any]:
    before = set(bpy.data.objects)
    if file_format == "obj":
        bpy.ops.wm.obj_import(filepath=str(path), forward_axis="NEGATIVE_Z", up_axis="Y")
    elif file_format == "stl":
        bpy.ops.wm.stl_import(filepath=str(path), forward_axis="NEGATIVE_Z", up_axis="Y")
    elif file_format == "ply":
        bpy.ops.wm.ply_import(filepath=str(path), forward_axis="NEGATIVE_Z", up_axis="Y")
    elif file_format == "glb":
        bpy.ops.import_scene.gltf(filepath=str(path))
    return sorted(set(bpy.data.objects) - before, key=lambda obj: obj.name)


def make_material(spec: dict[str, Any], prefix: str) -> Any:
    name = f"Hikari {prefix} {spec['id']}"
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    absorption = nodes.new("ShaderNodeVolumeAbsorption")
    surface.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    surface.inputs["Roughness"].default_value = spec["roughness"]
    surface.inputs["IOR"].default_value = spec["ior"]
    transmission = surface.inputs.get("Transmission Weight") or surface.inputs.get("Transmission")
    if transmission is not None:
        transmission.default_value = 1.0
    coefficients = rgb(spec["absorptionPerMm"], f"material {spec['id']} absorption")
    density = max(coefficients)
    # Blender's volume node has one density and an RGB tint, not three explicit
    # Beer-Lambert coefficients.  This retains the dominant coefficient and a
    # deterministic relative tint; the exact source coefficients remain props.
    relative = tuple(math.exp(-c / density) if density > 0 else 1.0 for c in coefficients)
    absorption.inputs["Color"].default_value = (*relative, 1.0)
    absorption.inputs["Density"].default_value = density
    links.new(surface.outputs["BSDF"], output.inputs["Surface"])
    links.new(absorption.outputs["Volume"], output.inputs["Volume"])
    material["hikari_material_json"] = json.dumps(spec, sort_keys=True)
    material["hikari_absorption_mapping"] = "Volume Absorption density=max(RGB per mm), color=exp(-coefficient/density); approximation"
    return material


def pose_quaternion(pose: dict[str, Any]) -> Quaternion:
    q = pose["rotation"]
    result = Quaternion((q["w"], q["x"], q["y"], q["z"]))
    result.normalize()
    return result


def medium_pose_matrix(pose: dict[str, Any], mm_per_shape_unit: float) -> Matrix:
    position = Vector(vec3(pose["position"], "medium.pose.position")) * mm_per_shape_unit
    rotation = pose_quaternion(pose).to_matrix().to_4x4()
    uniform_scale = Matrix.Scale(float(pose["uniformScale"]), 4)
    return Matrix.Translation(position) @ rotation @ uniform_scale


def create_inclusion_empties(medium: dict[str, Any], mm_per_shape_unit: float, root: Any) -> list[Any]:
    """Create Ref-style Empty masks instead of a separate refractive body."""
    result = []
    shape = medium["shape"]
    for index, ball in enumerate(shape["balls"]):
        center = Vector(vec3(ball["center"], f"inclusion {medium['id']} ball {index} center")) * mm_per_shape_unit
        radius = float(ball["radius"]) * mm_per_shape_unit
        empty = bpy.data.objects.new("Empty", None)
        bpy.context.scene.collection.objects.link(empty)
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 1.0
        empty["hikari_role"] = "inclusion"
        empty["hikari_medium_id"] = medium["id"]
        empty["hikari_ball_index"] = index
        empty["hikari_representation"] = "Ref-style Volume Absorption mask"
        empty["hikari_shape_json"] = json.dumps(shape, sort_keys=True)
        local_matrix = (
            medium_pose_matrix(medium["pose"], mm_per_shape_unit)
            @ Matrix.Translation(center)
            @ Matrix.Scale(radius, 4)
        )
        empty.parent = root
        empty.matrix_parent_inverse = Matrix.Identity(4)
        empty.matrix_basis = local_matrix
        result.append(empty)
    return result


def apply_ref_inclusion_mask(material: Any, empties: list[Any]) -> None:
    """Use Empty object coordinates to remove host absorption like the Ref blend."""
    if not empties or material.node_tree is None:
        return
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    absorption = next((node for node in nodes if node.bl_idname == "ShaderNodeVolumeAbsorption"), None)
    if absorption is None:
        return

    host_density = float(absorption.inputs["Density"].default_value)
    mask_outputs = []
    for index, empty in enumerate(empties):
        coordinates = nodes.new("ShaderNodeTexCoord")
        coordinates.name = f"Inclusion Empty Coordinates {index + 1:02d}"
        coordinates.label = empty.name
        coordinates.object = empty

        length = nodes.new("ShaderNodeVectorMath")
        length.name = f"Inclusion Radius {index + 1:02d}"
        length.operation = "LENGTH"

        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.name = f"Inclusion Density Mask {index + 1:02d}"
        ramp.color_ramp.interpolation = "LINEAR"
        ramp.color_ramp.elements[0].position = 0.92145
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 1.0
        ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)

        links.new(coordinates.outputs["Object"], length.inputs["Vector"])
        links.new(length.outputs["Value"], ramp.inputs["Fac"])
        mask_outputs.append(ramp.outputs["Color"])

    combined = mask_outputs[0]
    for index, mask in enumerate(mask_outputs[1:], start=2):
        multiply = nodes.new("ShaderNodeMath")
        multiply.name = f"Combine Inclusion Masks {index:02d}"
        multiply.operation = "MULTIPLY"
        links.new(combined, multiply.inputs[0])
        links.new(mask, multiply.inputs[1])
        combined = multiply.outputs["Value"]

    density = nodes.new("ShaderNodeMath")
    density.name = "Host Density outside Empty"
    density.operation = "MULTIPLY"
    density.inputs[1].default_value = host_density
    links.new(combined, density.inputs[0])
    links.new(density.outputs["Value"], absorption.inputs["Density"])
    material["hikari_inclusion_mapping"] = (
        "Ref-style Empty object coordinates -> vector length -> 0.92145..1.0 density ramp; "
        "masks multiply the host Volume Absorption density and do not create a separate refractive mesh"
    )


def prepare_ref_host_surface(obj: Any) -> None:
    """Make the exported triangle soup one connected, visually smooth body."""
    if obj.type != "MESH":
        return
    before = len(obj.data.vertices)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=1e-6)
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    after = len(obj.data.vertices)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    # Ref's 512-face host is a connected quad mesh and benefits from
    # Catmull-Clark. Hikari's marching-tetrahedra host is already a dense
    # triangle mesh. Applying that same modifier to disconnected triangles
    # made every face a pinched island, producing the reported pattern. After
    # welding, smooth vertex normals are sufficient and preserve the chosen
    # Hikari silhouette without a second resampling step.
    for modifier in list(obj.modifiers):
        if modifier.type == "SUBSURF":
            obj.modifiers.remove(modifier)
    longest_mm = max(float(value) for value in obj.dimensions)
    remesh = obj.modifiers.get("Hikari Surface Remesh") or obj.modifiers.new(
        "Hikari Surface Remesh", "REMESH"
    )
    remesh.mode = "VOXEL"
    remesh.voxel_size = max(0.05, longest_mm / 80.0)
    remesh.adaptivity = 0.0
    remesh.use_remove_disconnected = True
    remesh.use_smooth_shade = True
    relax = obj.modifiers.get("Hikari Surface Relax") or obj.modifiers.new(
        "Hikari Surface Relax", "SMOOTH"
    )
    relax.factor = 0.5
    relax.iterations = 6
    obj["hikari_welded_vertices"] = before - after
    obj["hikari_surface_voxel_mm"] = remesh.voxel_size
    obj["hikari_surface_prep"] = (
        "OBJ duplicate vertices welded at 1e-6 mm; all connected triangle polygons smooth; "
        "Subdivision omitted; Voxel Remesh at longest-edge/80 then Smooth factor=0.5 iterations=6"
    )


def set_role_properties(obj: Any, asset: dict[str, Any], medium: dict[str, Any] | None) -> None:
    obj["hikari_role"] = asset["role"]
    obj["hikari_asset_filename"] = asset["filename"]
    obj["hikari_source_coordinates_preserved"] = True
    obj["hikari_coordinate_conversion"] = "parent root: (x,y,z) -> (x,-z,y)"
    if medium:
        obj["hikari_medium_id"] = medium["id"]
        obj["hikari_declared_pose_json"] = json.dumps(medium["pose"], sort_keys=True)


def hikari_to_blender(value: Vector) -> Vector:
    return Vector((value.x, -value.z, value.y))


def create_receiver(spec: dict[str, Any], scale: float, material: Any) -> Any:
    bpy.ops.mesh.primitive_plane_add(size=10000.0)
    receiver = bpy.context.object
    receiver.name = f"Hikari Receiver {spec['id']}"
    pose = spec["pose"]
    receiver.location = hikari_to_blender(Vector(vec3(pose["position"], "receiver.position"))) * scale
    # The receiver's final Hikari-space normal is pose.rotation * local normal.
    hikari_normal = pose_quaternion(pose) @ Vector(vec3(spec["normal"], "receiver.normal")).normalized()
    blender_normal = hikari_to_blender(hikari_normal).normalized()
    normal_rotation = Vector((0, 0, 1)).rotation_difference(blender_normal)
    receiver.rotation_mode = "QUATERNION"
    receiver.rotation_quaternion = normal_rotation
    receiver.scale = (pose["uniformScale"],) * 3
    receiver.data.materials.append(material)
    receiver["hikari_role"] = "receiver"
    receiver["hikari_generated_size_mm"] = 10000.0
    return receiver


def create_sun(spec: dict[str, Any], angular_diameter_deg: float) -> Any:
    hikari_direction = Vector(vec3(spec["direction"], "light.direction")).normalized()
    direction = hikari_to_blender(hikari_direction).normalized()
    radiance = rgb(spec["radiance"], "light.radiance")
    data = bpy.data.lights.new(name="Hikari Directional Light", type="SUN")
    data.energy = max(radiance)
    data.color = tuple(c / max(radiance) for c in radiance) if max(radiance) > 0 else (1, 1, 1)
    data.angle = math.radians(angular_diameter_deg)
    obj = bpy.data.objects.new("Hikari Directional Light", data)
    bpy.context.scene.collection.objects.link(obj)
    # A Blender SUN emits along local -Z; Hikari stores propagation direction.
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(direction)
    obj["hikari_propagation_direction"] = json.dumps(list(direction))
    obj["hikari_source_propagation_direction"] = json.dumps(list(hikari_direction))
    obj["hikari_radiance_rgb"] = json.dumps(list(radiance))
    obj["hikari_sun_angular_diameter_deg"] = angular_diameter_deg
    obj["hikari_energy_mapping"] = "SUN energy=max(radiance RGB); approximation"
    return obj


def create_camera(spec: dict[str, Any], scale: float) -> Any:
    position = hikari_to_blender(Vector(spec["position"])) * scale
    target = hikari_to_blender(Vector(spec["target"])) * scale
    if (target - position).length < 1e-9:
        fail("camera position and target must differ")
    data = bpy.data.cameras.new("Hikari Camera")
    data.sensor_fit = "VERTICAL"
    data.angle = math.radians(spec["fov"])
    obj = bpy.data.objects.new("Hikari Camera", data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (target - position).to_track_quat("-Z", "Y")
    bpy.context.scene.camera = obj
    height = 1080
    width = max(2, min(7680, round(height * spec["aspect"])))
    width += width % 2
    bpy.context.scene.render.resolution_x = width
    bpy.context.scene.render.resolution_y = height
    bpy.context.scene.render.resolution_percentage = 100
    return obj


def main() -> None:
    args = parse_args()
    sidecar_path = args.sidecar.expanduser().resolve()
    with sidecar_path.open("r", encoding="utf-8") as stream:
        study = validate_sidecar(json.load(stream))

    if args.clear:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "MILLIMETERS"
    scene.unit_settings.scale_length = 0.001
    environment = study["environment"]
    scene.view_settings.exposure = environment["exposure"]
    try:
        scene.view_settings.view_transform = environment["viewTransform"]
    except (TypeError, ValueError):
        pass  # The unavailable requested transform remains in metadata.
    if environment["renderer"] == "cycles" and hasattr(scene, "cycles"):
        scene.render.engine = "CYCLES"
    elif environment["renderer"] in {"cycles", "eevee"}:
        # Blender 4.x exposed EEVEE_NEXT; Blender 5.2 reports EEVEE again.
        for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
            try:
                scene.render.engine = engine
                break
            except TypeError:
                continue

    world = bpy.data.worlds.new("Hikari Neutral World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = (0.18, 0.18, 0.18, 1.0)
        background.inputs["Strength"].default_value = 0.05
    world["hikari_declared_world"] = environment["world"]
    world["hikari_mapping"] = "neutral RGB world at strength 0.05; declared environment retained as metadata"
    scene.world = world

    optics = study["optics"]
    host_material = make_material(optics["hostMaterial"], "Host")
    inclusion_materials = [make_material(value, f"Inclusion {index + 1}") for index, value in enumerate(optics["inclusionMaterials"])]
    receiver_material = bpy.data.materials.new("Hikari Receiver Neutral")
    receiver_material.diffuse_color = (0.18, 0.18, 0.18, 1.0)
    scale = study["units"]["physicalScale"]["mmPerShapeUnit"]

    assets = study["geometry"]["meshes"]["assets"]
    primary_assets = [asset for asset in assets if asset["purpose"] == "primary"]
    hosts = [asset for asset in primary_assets if asset["role"] == "host"]
    inclusion_assets = [asset for asset in primary_assets if asset["role"] == "inclusion"]
    receiver_assets = [asset for asset in primary_assets if asset["role"] == "receiver"]
    if len(hosts) != 1:
        fail("exactly one host mesh asset is required")
    if len({asset["mediumId"] for asset in inclusion_assets}) != len(inclusion_assets):
        fail("each inclusion may have at most one primary mesh asset")
    if len(receiver_assets) > 1:
        fail("at most one receiver mesh asset is supported")

    host_id = study["geometry"]["host"]["id"]
    inclusions_by_id = {medium["id"]: medium for medium in study["geometry"]["inclusions"]}
    receiver_id = optics["receiver"]["id"]
    for asset in assets:
        expected = host_id if asset["role"] == "host" else receiver_id if asset["role"] == "receiver" else None
        if expected is not None and asset["mediumId"] != expected:
            fail(f"asset {asset['filename']} mediumId does not match its declared {asset['role']}")
        if asset["role"] == "inclusion" and asset["mediumId"] not in inclusions_by_id:
            fail(f"asset {asset['filename']} refers to an unknown inclusion mediumId")
    missing_inclusion_meshes = set(inclusions_by_id) - {asset["mediumId"] for asset in inclusion_assets}

    root = bpy.data.objects.new("Hikari Source→Blender (Y-up to Z-up)", None)
    bpy.context.scene.collection.objects.link(root)
    root.rotation_mode = "QUATERNION"
    root.rotation_quaternion = Quaternion((math.cos(math.pi / 4), math.sin(math.pi / 4), 0, 0))
    root["hikari_source_to_target_3x3"] = json.dumps(study["coordinateSystem"]["sourceToTarget3x3"])
    root["hikari_policy"] = "root-transform"
    bpy.context.view_layer.update()

    imported_count = 0
    for asset in assets:
        path = (sidecar_path.parent / asset["filename"]).resolve()
        if not path.is_file():
            fail(f"mesh asset does not exist: {asset['filename']}")
        if path.suffix.lower().lstrip(".") != asset["format"]:
            fail(f"mesh extension and declared format disagree: {asset['filename']}")
        if "sha256" in asset and sha256(path).lower() != asset["sha256"].lower():
            fail(f"SHA-256 mismatch: {asset['filename']}")
        if asset["purpose"] == "check":
            continue
        objects = imported_objects(path, asset["format"])
        if not objects:
            fail(f"asset imported no objects: {asset['filename']}")
        medium = None
        material = receiver_material
        if asset["role"] == "host":
            medium, material = study["geometry"]["host"], host_material
        elif asset["role"] == "inclusion":
            medium = inclusions_by_id[asset["mediumId"]]
            index = study["geometry"]["inclusions"].index(medium)
            material = inclusion_materials[index]
        elif asset["role"] == "receiver":
            medium = optics["receiver"]
        for obj in objects:
            set_role_properties(obj, asset, medium)
            if obj.type == "MESH":
                obj.data.materials.clear()
                obj.data.materials.append(material)
                if asset["role"] == "host":
                    prepare_ref_host_surface(obj)
        # GLB may import a hierarchy. Only its top-level objects receive the
        # coordinate root, otherwise descendants would be converted twice.
        imported_set = set(objects)
        for obj in objects:
            if obj.parent not in imported_set:
                local_matrix = obj.matrix_world.copy()
                if asset["format"] == "glb":
                    # glTF mandates Y-up and Blender's glTF importer performs
                    # that conversion. Undo it here so our declared root is the
                    # sole, visible coordinate conversion for every format.
                    local_matrix = root.matrix_world.inverted() @ local_matrix
                if asset["space"] == "medium-local" and medium is not None:
                    local_matrix = medium_pose_matrix(medium["pose"], scale) @ local_matrix
                obj.parent = root
                obj.matrix_parent_inverse = Matrix.Identity(4)
                obj.matrix_basis = local_matrix
        imported_count += len(objects)

    generated_inclusions = 0
    generated_inclusion_kinds: dict[str, str] = {}
    inclusion_empties = []
    for medium_id in sorted(missing_inclusion_meshes):
        medium = inclusions_by_id[medium_id]
        created = create_inclusion_empties(medium, scale, root)
        inclusion_empties.extend(created)
        generated_inclusion_kinds[medium_id] = f"Ref-style-empty-absorption-mask ({len(created)} empties)"
        generated_inclusions += 1
    apply_ref_inclusion_mask(host_material, inclusion_empties)

    mesh_scale = study["geometry"]["meshes"].get("scaleMmPerUnit")
    scale_status = "not declared"
    if mesh_scale is not None:
        scale_status = "matches" if math.isclose(mesh_scale, scale, rel_tol=1e-9, abs_tol=1e-12) else "MISMATCH (recorded, not corrected)"
    if not receiver_assets:
        create_receiver(optics["receiver"], scale, receiver_material)
    create_sun(optics["light"], optics["sunAngularDiameterDeg"])
    create_camera(study["camera"], scale)

    metadata = {
        "sidecar": str(sidecar_path),
        "case": study["case"],
        "unit_contract": study["units"],
        "coordinate_contract": study["coordinateSystem"],
        "mesh_scale_verification": scale_status,
        "mesh_space_policy": "medium-local assets receive their declared medium pose once; hikari-world assets do not",
        "generated_inclusions": generated_inclusion_kinds,
        "unsupported": study["unsupported"],
        "approximations": study["approximations"] + [
            "Blender Principled/Volume nodes approximate Hikari transmission and RGB Beer-Lambert absorption.",
            "Inclusions without primary meshes are Ref-style Empty masks in the host Volume Absorption density; they do not create a separate refractive boundary.",
            "SUN energy and color are normalized from Hikari radiance and are not photometrically calibrated.",
            "The declared world description is represented by a neutral low-strength Blender world, not an HDRI reconstruction.",
            "Generated receiver extent is 10000 mm when no receiver mesh is supplied.",
            "Medium-local primary meshes receive their declared medium pose once before the common coordinate root; Hikari-world meshes do not.",
        ],
    }
    text = bpy.data.texts.get("HIKARI_IMPORT_METADATA.json") or bpy.data.texts.new("HIKARI_IMPORT_METADATA.json")
    text.clear()
    text.write(json.dumps(metadata, indent=2, sort_keys=True))
    scene["hikari_case_id"] = study["case"]["caseId"]
    scene["hikari_sidecar"] = str(sidecar_path)
    scene["hikari_coordinate_conversion"] = "explicit root transform: (x,y,z) -> (x,-z,y)"
    scene["hikari_approximation_metadata"] = "HIKARI_IMPORT_METADATA.json"

    if args.save:
        save_path = args.save.expanduser().resolve()
        save_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(save_path))

    print(
        f"HIKARI_IMPORT case={study['case']['caseId']} assets={len(assets)} "
        f"objects={imported_count} inclusions={len(inclusion_assets)}+{generated_inclusions}generated checks={len(assets) - len(primary_assets)} "
        f"axes=hikari-Y-up→blender-Z-up units=mm meshScale={scale_status}"
    )


if __name__ == "__main__":
    main()
