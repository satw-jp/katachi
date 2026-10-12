from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import platform
import sys
from pathlib import Path
from typing import Any

from .contracts import ContractError


class ManifoldKernel:
    """Thin adapter for the exact legacy NumPy/trimesh/manifold3d kernel."""

    def __init__(self, np: Any, trimesh: Any, manifold: Any) -> None:
        self.np = np
        self.trimesh = trimesh
        self.md = manifold

    @classmethod
    def from_runtime_root(cls, runtime_root: Path) -> "ManifoldKernel":
        if sys.version_info[:2] != (3, 12):
            raise ContractError(f"geometry runtime requires Python 3.12.x; actual is {platform.python_version()}")
        runtime_root = runtime_root.resolve()
        if not runtime_root.is_dir():
            raise ContractError(f"geometry runtime directory is missing: {runtime_root}")
        root_text = str(runtime_root)
        if root_text not in sys.path:
            sys.path.insert(0, root_text)
        importlib.invalidate_caches()
        modules = {name: importlib.import_module(name) for name in ("numpy", "trimesh", "manifold3d")}
        expected = {"numpy": "2.5.2", "scipy": "1.18.1", "manifold3d": "3.5.2", "trimesh": "5.1.0"}
        actual = {
            "numpy": modules["numpy"].__version__,
            "scipy": importlib.metadata.version("scipy"),
            "manifold3d": importlib.metadata.version("manifold3d"),
            "trimesh": modules["trimesh"].__version__,
        }
        differences = {key: {"expected": expected[key], "actual": actual[key]} for key in expected if actual[key] != expected[key]}
        if differences:
            raise ContractError(f"geometry runtime version mismatch: {differences}")
        return cls(modules["numpy"], modules["trimesh"], modules["manifold3d"])

    def man(self, vertices: Any, faces: Any) -> Any:
        np = self.np
        return self.md.Manifold(self.md.Mesh(np.asarray(vertices, np.float32), np.asarray(faces, np.uint32)))

    def capsule(self, a: Any, b: Any, radius: float) -> Any:
        np = self.np
        a = np.array(a)
        b = np.array(b)
        parts = []
        if np.linalg.norm(a - b) > 1e-6:
            mesh = self.trimesh.creation.cylinder(radius=radius, segment=[a, b], sections=12)
            parts.append(self.man(mesh.vertices, mesh.faces))
        for point in (a, b):
            mesh = self.trimesh.creation.icosphere(subdivisions=1, radius=radius)
            parts.append(self.man(mesh.vertices + point, mesh.faces))
        return self.md.Manifold.batch_boolean(parts, self.md.OpType.Add)

    def union(self, parts: list[Any]) -> Any:
        return self.md.Manifold.batch_boolean(parts, self.md.OpType.Add)

    def store(self, path: Path, mesh: Any) -> dict[str, Any]:
        if mesh.status() != self.md.Error.NoError or mesh.volume() <= 0:
            raise ContractError(f"legacy geometry kernel returned an invalid solid: {path.name}")
        if path.exists():
            raise ContractError(f"refusing to overwrite support mesh: {path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        data = mesh.to_mesh()
        vertices = data.vert_properties[:, :3]
        faces = data.tri_verts
        self.np.savez_compressed(path, vertices=vertices, faces=faces)
        return {
            "bbox_mm": [vertices.min(0).tolist(), vertices.max(0).tolist()],
            "volume_mm3": float(mesh.volume()),
            "vertices": len(vertices),
            "faces": len(faces),
        }

    def load_mesh(self, path: Path) -> dict[str, Any]:
        with self.np.load(path) as archive:
            return {"vertices": archive["vertices"], "faces": archive["faces"]}

    def mesh_array_identity(self, path: Path) -> dict[str, str]:
        data = self.load_mesh(path)
        result = {}
        for key in ("vertices", "faces"):
            array = self.np.ascontiguousarray(data[key])
            digest = hashlib.sha256()
            digest.update(str(array.dtype).encode("ascii"))
            digest.update(repr(array.shape).encode("ascii"))
            digest.update(array.tobytes(order="C"))
            result[key + "_sha256"] = digest.hexdigest()
        return result


def inspect_geometry_runtime(runtime_root: str | Path | None) -> dict[str, Any]:
    if not isinstance(runtime_root, str) or not runtime_root:
        return {"status": "HOLD", "reason": "GEOMETRY_RUNTIME_ROOT_NOT_MAPPED"}
    try:
        kernel = ManifoldKernel.from_runtime_root(Path(runtime_root))
        return {
            "status": "PASS",
            "root": str(Path(runtime_root).resolve()),
            "python": platform.python_version(),
            "numpy": kernel.np.__version__,
            "scipy": importlib.metadata.version("scipy"),
            "manifold3d": importlib.metadata.version("manifold3d"),
            "trimesh": kernel.trimesh.__version__,
        }
    except (ContractError, ImportError, OSError) as exc:
        return {"status": "HOLD", "reason": "GEOMETRY_RUNTIME_INVALID", "detail": str(exc)}
