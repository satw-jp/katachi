from __future__ import annotations

import functools
import math
from pathlib import Path
from typing import Any, Callable


BED_Z_MM = -1.7660574107474478
COLLISION_VOLUME_THRESHOLD_MM3 = 1e-5


def generate_lower_support(
    *,
    flower_surface: list[dict[str, Any]],
    flower_template: dict[str, Any],
    permanent_groups: list[list[dict[str, Any]]],
    upstream_support: list[dict[str, Any]],
    mesh_loader: Callable[[str], dict[str, Any]],
    kernel: Any,
    output_mesh_root: Path,
) -> dict[str, Any]:
    """Migrate the original lower_support.py builder without its top-level I/O.

    Input Support must be the output of the preceding generated A1 stage. It is
    never loaded from GOLDEN. The obstacle ordering, mesh_source deduplication,
    array sampling, NumPy argsort, candidate limits, and collision predicates
    intentionally follow source SHA 174ad470… and its original script.
    """
    np = kernel.np
    md = kernel.md
    output_mesh_root.mkdir(parents=True, exist_ok=True)
    unit = flower_template
    unit_manifold = kernel.man(unit["vertices"], unit["faces"])

    body = list(flower_surface)
    seen_mesh_sources: set[str] = set()
    for group in permanent_groups:
        for member in group:
            mesh_source = str(member["mesh_source"])
            if mesh_source not in seen_mesh_sources:
                body.append(member)
                seen_mesh_sources.add(mesh_source)

    boxes = np.array([member["bbox_mm"] for member in body])
    support_by_id = {item["id"]: item for item in upstream_support}

    @functools.lru_cache(256)
    def solid(index: int) -> Any:
        member = body[index]
        if "physical_scale" in member:
            transform = np.c_[
                np.array(member["orientation_matrix"]) * member["physical_scale"],
                member["position_mm"],
            ].tolist()
            return unit_manifold.transform(transform)
        mesh = mesh_loader(str(member["mesh_source"]))
        return kernel.man(mesh["vertices"], mesh["faces"])

    def hits(mesh: Any) -> list[tuple[str, float]]:
        vertices = mesh.to_mesh().vert_properties[:, :3]
        near = np.where(
            np.all(boxes[:, 0] <= vertices.max(0), axis=1)
            & np.all(boxes[:, 1] >= vertices.min(0), axis=1)
        )[0]
        result = []
        for index in near:
            volume = float((mesh ^ solid(int(index))).volume())
            if volume > COLLISION_VOLUME_THRESHOLD_MM3:
                result.append((body[int(index)]["id"], volume))
        return result

    def cylinder(xy: Any, z0: float, z1: float, r0: float, r1: float | None = None) -> Any:
        r1 = r0 if r1 is None else r1
        divisions = 24
        vertices = np.array(
            [
                [*(np.array(xy) + radius * np.array([math.cos(angle), math.sin(angle)])), z]
                for z, radius in ((z0, r0), (z1, r1))
                for angle in np.arange(divisions) * math.tau / divisions
            ]
            + [[*xy, z0], [*xy, z1]]
        )
        faces = []
        for index in range(divisions):
            following = (index + 1) % divisions
            faces.extend(
                [
                    [index, following, divisions + following],
                    [index, divisions + following, divisions + index],
                    [2 * divisions, following, index],
                    [2 * divisions + 1, divisions + index, divisions + following],
                ]
            )
        return kernel.man(vertices, faces)

    added: list[dict[str, Any]] = []
    held: list[dict[str, str]] = []
    mesh_identities: dict[str, dict[str, str]] = {}

    def save(mesh: Any, record: dict[str, Any]) -> None:
        mesh_path = output_mesh_root / f"{record['id']}.npz"
        record.update(
            kernel.store(mesh_path, mesh),
            mesh_source=f"support_mesh/lower/{record['id']}.npz",
        )
        mesh_identities[record["id"]] = kernel.mesh_array_identity(mesh_path)
        added.append(record)

    # Wider flat feet increase adhesion footprint; tall base collars act before higher braces.
    for foot in [item for item in upstream_support if item["kind"] == "R3_STYLE_FLAT_FOOT"]:
        shaft = support_by_id[foot["target"]]
        xy = np.array(shaft["points_mm"][0])[:2]
        height = shaft["bbox_mm"][1][2] - BED_Z_MM
        chosen = None
        for radius in [3.5, 3.0]:
            mesh = cylinder(xy, BED_Z_MM, BED_Z_MM + 0.8, radius)
            if not hits(mesh):
                chosen = mesh
                break
        if chosen is None:
            held.append({"id": foot["id"], "reason": "Foot expansion blocked by BODY; original retained"})
            continue
        if height > 25:
            for rad in [1.6, 1.5]:
                collar = kernel.union(
                    [
                        cylinder(xy, BED_Z_MM + 0.4, BED_Z_MM + 12, rad),
                        cylinder(xy, BED_Z_MM + 12, BED_Z_MM + 18, rad, 0.8),
                    ]
                )
                if not hits(collar):
                    chosen = kernel.union([chosen, collar])
                    break
        save(
            chosen,
            {
                "id": "P10_" + foot["id"],
                "kind": "ENLARGED_BASAL_FOOT_COLLAR",
                "anchor": "BED",
                "target": shaft["id"],
                "pad_diameter_mm": radius * 2,
                "points_mm": [
                    [*xy, BED_Z_MM],
                    [*xy, min(BED_Z_MM + 18, shaft["bbox_mm"][1][2])],
                ],
                "purpose": "Footprint and early basal stiffness; no claim that adhesion was the observed failure cause",
                "removal_direction": "down/outward in small exterior panels after BODY contacts cut",
                "cutting_access": "below released print; original sacrificial contacts retained",
            },
        )

    # Extra distributed direct bed contacts on the lower flower surfaces; no permanent changes.
    triangles = unit["vertices"][unit["faces"][::24]]
    centroids = triangles.mean(1)
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-20)
    low = [member for member in flower_surface if member["bbox_mm"][0][2] < BED_Z_MM + 35]
    contact_records: list[dict[str, Any]] = []
    for flower_index, flower in enumerate(low):
        rotation = np.array(flower["orientation_matrix"])
        points = centroids @ rotation.T * flower["physical_scale"] + flower["position_mm"]
        directions = normals @ rotation.T
        selected = (directions[:, 2] < -0.55) & (points[:, 2] > BED_Z_MM + 2.2) & (points[:, 2] < BED_Z_MM + 35)
        points = points[selected]
        directions = directions[selected]
        existing = [
            np.array(item["contact_mm"])
            for item in upstream_support
            if item.get("target") == flower["id"] and "contact_mm" in item
        ]
        new_points = []
        if len(points):
            order = np.argsort(points[:, 2])
            tested = 0
            for candidate_index in order:
                if len(new_points) >= 2 or tested >= 22:
                    break
                if any(np.linalg.norm(points[candidate_index] - point) < 2.5 for point in existing + new_points):
                    continue
                tested += 1
                end = points[candidate_index] + directions[candidate_index] * 1.2
                start = np.r_[end[:2], BED_Z_MM + 0.8]
                if end[2] < BED_Z_MM + 1.2:
                    continue
                shaft = kernel.capsule(start, end, 0.8)
                neck = kernel.capsule(end, points[candidate_index] - directions[candidate_index] * 0.25, 0.3)
                if hits(shaft):
                    continue
                contact = hits(neck)
                if len(contact) != 1 or contact[0][0] != flower["id"]:
                    continue
                foot_mesh = None
                for radius in [3.5, 2.5, 1.8]:
                    possible_foot = cylinder(end[:2], BED_Z_MM, BED_Z_MM + 0.65, radius)
                    if not hits(possible_foot):
                        foot_mesh = possible_foot
                        break
                if foot_mesh is None:
                    continue
                parts = [shaft, neck, foot_mesh]
                if end[2] > BED_Z_MM + 8:
                    collar = kernel.union(
                        [
                            cylinder(end[:2], BED_Z_MM + 0.4, BED_Z_MM + 4, 1.3),
                            cylinder(end[:2], BED_Z_MM + 4, min(BED_Z_MM + 7, end[2]), 1.3, 0.8),
                        ]
                    )
                    if not hits(collar):
                        parts.append(collar)
                record = {
                    "id": f"P10_LOW_{len(contact_records):04d}",
                    "kind": "LOWER_DISTRIBUTED_BED_CONTACT",
                    "target": flower["id"],
                    "anchor": "BED",
                    "contact_mm": points[candidate_index].tolist(),
                    "contact_normal": directions[candidate_index].tolist(),
                    "cut_mm": (points[candidate_index] + directions[candidate_index] * 0.45).tolist(),
                    "points_mm": [start.tolist(), end.tolist(), (points[candidate_index] - directions[candidate_index] * 0.25).tolist()],
                    "shaft_diameter_mm": 1.6,
                    "contact_diameter_mm": 0.6,
                    "contact_overlap_mm3": contact[0][1],
                    "removal_direction": "down through the same verified vertical approach after neck cutting; cut shafts to short pieces from bottom",
                    "cutting_access": "bottom-up after plate release; sacrificial neck only",
                    "growth": "direct vertical bed shaft; small short contact bend; no dependence on future BODY anchor",
                }
                save(kernel.union(parts), record)
                contact_records.append(record)
                new_points.append(points[candidate_index])

    return {
        "added": added,
        "held": held,
        "mesh_array_identities": mesh_identities,
        "lower_flower_count": len(low),
        "new_contact_count": len(contact_records),
        "body_collision_check": "Exact original D6 plus both current A/F2 permanent, each new main and foot clear, neck contacts only target. No strength or toolpath PASS.",
    }
