"""Create the minimal deterministic Astra Research Reader v0 asset.

The package directories remain external Research authority. This script copies
only geometry needed by the reader, selection metadata, and fabrication routes;
it intentionally omits diagnostics, render caches, and intermediate meshes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def candidate(dual_data: Path, four_data: Path, name: str, package_hash: str) -> dict[str, object]:
    geometry = read_json(dual_data / f"{name}_geometry.json")
    attachments = read_json(dual_data / f"{name}_attachments.json")
    d1 = read_json(four_data / f"{name}_D1_rules.json")
    d2 = read_json(four_data / f"{name}_D2_rules.json")
    return {
        "geometry": {
            "id": geometry["id"],
            "structure": [
                {key: row[key] for key in ("id", "ancestry", "points_mm", "radius_mm", "kind") if key in row}
                for row in geometry["structure"]
            ],
            "surface": [
                {"id": row["id"], "points_mm": row["points_mm"], "radii_mm": row["radii_mm"]}
                for row in geometry["surface"]
            ],
            "parameters": {"source_junction_count": geometry["parameters"]["source_junction_count"]},
        },
        "attachments": {
            "attachments": [
                {key: row[key] for key in ("id", "parent_member_id", "surface_component_id", "branch_start_mm", "branch_end_mm", "classification")}
                for row in attachments["attachments"]
            ],
            "component_target_count": attachments["component_target_count"],
        },
        "fabrication": {
            "d1": {"members": [{key: row[key] for key in ("id", "a", "b", "radius_mm", "role", "purpose") if key in row} for row in d1["members"]]},
            "d2": {
                "supports": [{key: row[key] for key in ("id", "a", "b", "tip", "anchor", "parent", "radius_mm") if key in row} for row in d2["supports"]],
                "braces": [{key: row[key] for key in ("id", "a", "b", "radius_mm") if key in row} for row in d2["braces"]],
            },
        },
        "packageSha256": package_hash,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    dual_root = source_root / "DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY"
    four_root = source_root / "FOUR_CANDIDATE_FABRICATION_D1_D2_ISLAND_RESOLUTION"
    dual_data = dual_root / "data"
    four_data = four_root / "data"
    package_hashes = {
        "DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY.zip": sha256(source_root / "DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY.zip"),
        "FOUR_CANDIDATE_FABRICATION_D1_D2_ISLAND_RESOLUTION.zip": sha256(source_root / "FOUR_CANDIDATE_FABRICATION_D1_D2_ISLAND_RESOLUTION.zip"),
    }
    host_npz = np.load(dual_data / "B_host.npz")
    output = {
        "schemaVersion": 1,
        "source": {
            "authority": "external Astra Research package",
            "packages": package_hashes,
            "sourceFiles": {
                "B_surface_components.json": sha256(dual_data / "B_surface_components.json"),
                "B_host.npz": sha256(dual_data / "B_host.npz"),
            },
        },
        "host": {"vertices": host_npz["vertices"].tolist(), "faces": host_npz["faces"].tolist()},
        "surfaceComponents": {
            key: read_json(dual_data / "B_surface_components.json")[key]
            for key in ("component_count", "patch_component_mapping")
        },
        "candidates": {
            "B_OPEN": candidate(dual_data, four_data, "B_OPEN", package_hashes["DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY.zip"]),
            "B_PARTICIPATING": candidate(dual_data, four_data, "B_PARTICIPATING", package_hashes["DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY.zip"]),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {args.output} ({args.output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
