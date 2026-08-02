#!/usr/bin/env python3
"""Verify the authored Ref surface and Empty-mask contract in an open blend."""

from __future__ import annotations

import bpy


def fail(message: str) -> "NoReturn":
    raise RuntimeError(f"HIKARI_REF_MATCH_FAILED {message}")


hosts = [obj for obj in bpy.data.objects if obj.get("hikari_role") == "host"]
inclusions = [obj for obj in bpy.data.objects if obj.get("hikari_role") == "inclusion"]
if len(hosts) != 1:
    fail(f"expected one host, got {len(hosts)}")
if not inclusions:
    fail("expected at least one inclusion Empty")
if any(obj.type != "EMPTY" for obj in inclusions):
    fail("every generated inclusion must be an Empty")

host = hosts[0]
if host.type != "MESH" or not host.data.polygons:
    fail("host must be a non-empty mesh")
if any(not polygon.use_smooth for polygon in host.data.polygons):
    fail("every host polygon must use smooth shading")

if len(host.data.vertices) >= len(host.data.polygons) * 2:
    fail("host still looks like disconnected per-face triangle vertices")
if any(modifier.type == "SUBSURF" for modifier in host.modifiers):
    fail("dense triangulated host must not use the Ref quad mesh's Subdivision modifier")
remesh = next((modifier for modifier in host.modifiers if modifier.type == "REMESH"), None)
relax = next((modifier for modifier in host.modifiers if modifier.type == "SMOOTH"), None)
if remesh is None or remesh.mode != "VOXEL" or not remesh.use_smooth_shade:
    fail("host needs the smooth Voxel Remesh surface reconstruction")
if relax is None or relax.iterations != 6 or abs(relax.factor - 0.5) > 1e-9:
    fail("host needs the six-iteration 0.5 Surface Relax modifier")

material = host.active_material
if material is None or material.node_tree is None:
    fail("host material has no node tree")
absorption = next(
    (node for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeVolumeAbsorption"),
    None,
)
if absorption is None or not absorption.inputs["Density"].is_linked:
    fail("host Volume Absorption density is not driven by the Empty mask")

coordinate_empties = {
    node.object
    for node in material.node_tree.nodes
    if node.bl_idname == "ShaderNodeTexCoord" and node.object is not None
}
if not set(inclusions).issubset(coordinate_empties):
    fail("one or more inclusion Empties are not connected to host material coordinates")

print(
    "HIKARI_REF_MATCH_OK "
    f"host={host.name} polygons={len(host.data.polygons)} smooth={len(host.data.polygons)} "
    f"vertices={len(host.data.vertices)} connected=yes subdivision=omitted "
    f"voxel_mm={remesh.voxel_size:.6g} relax=0.5x6 empties={len(inclusions)}"
)
