"""Fixed Mitsuba worker used by the Hikari local research bridge.

The worker accepts only the normalized mapping produced by bridge_contract.py.
It writes a sanitized OBJ into a private temporary directory and constructs a
small, fixed Mitsuba scene dictionary.  No request value is treated as a path,
plugin name, Python fragment, or command.
"""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from bridge_contract import BridgeError, MAX_ARTIFACT_BYTES, artifact_hash, provenance_hash


class MitsubaWorker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._mi: Any = None
        self._dr: Any = None
        self._import_error: str | None = None
        self._variants: list[str] = []
        self._active_variant: str | None = None
        self._cuda_variant_ready = False
        self._gpu = self._probe_gpu()
        try:
            import drjit as dr
            import mitsuba as mi

            self._dr = dr
            self._mi = mi
            self._variants = [str(value) for value in mi.variants()]
            self._try_set_variant("cuda_ad_rgb" if self._gpu and "cuda_ad_rgb" in self._variants else "scalar_rgb")
            if self._active_variant is None:
                for candidate in ("scalar_rgb", "llvm_ad_rgb"):
                    if candidate in self._variants and self._try_set_variant(candidate):
                        break
        except Exception as exc:  # optional research dependency is allowed to be absent
            self._import_error = f"{type(exc).__name__}: {exc}"

    def _try_set_variant(self, variant: str) -> bool:
        if self._mi is None or variant not in self._variants:
            return False
        try:
            self._mi.set_variant(variant)
            self._active_variant = variant
            if variant == "cuda_ad_rgb":
                self._cuda_variant_ready = True
            return True
        except Exception:
            return False

    @staticmethod
    def _probe_gpu() -> dict[str, Any] | None:
        """Probe one local adapter using a fixed, non-request-controlled command."""
        try:
            completed = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=name,memory.total,compute_cap",
                    "--format=csv,noheader,nounits",
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
                shell=False,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        if completed.returncode != 0:
            return None
        first = next((line.strip() for line in completed.stdout.splitlines() if line.strip()), "")
        parts = [part.strip() for part in first.split(",")]
        if len(parts) != 3 or not parts[0]:
            return None
        try:
            memory = int(float(parts[1]))
        except ValueError:
            memory = None
        return {
            "available": True,
            "name": parts[0],
            "memoryMiB": memory,
            "computeCapability": parts[2],
        }

    @property
    def cuda_available(self) -> bool:
        return bool(self._gpu and self._cuda_variant_ready)

    @property
    def ready(self) -> bool:
        return self._mi is not None and self._active_variant is not None

    def capabilities(self) -> dict[str, Any]:
        mitsuba_version = None
        drjit_version = None
        if self._mi is not None:
            mitsuba_version = str(getattr(self._mi, "__version__", "unknown"))
        if self._dr is not None:
            drjit_version = str(getattr(self._dr, "__version__", "unknown"))
        import sys
        supported_devices = ["cuda"] if self._active_variant == "cuda_ad_rgb" else ["cpu"] if self._active_variant == "scalar_rgb" else []

        return {
            "schemaVersion": "hikari-mitsuba-bridge.v1",
            "service": "hikari-mitsuba-local-bridge",
            "bindAddress": "127.0.0.1",
            "port": 47659,
            "mitsuba": {"available": self._mi is not None, "version": mitsuba_version},
            "drjit": {"available": self._dr is not None, "version": drjit_version},
            "pythonVersion": ".".join(str(value) for value in sys.version_info[:3]),
            "variants": self._variants,
            "selectedVariant": self._active_variant,
            "cudaAvailable": self.cuda_available,
            "gpu": self._gpu,
            "workerReady": self.ready,
            "supportedOperations": ["hikari.mitsuba.render.v1"],
            "supportedDevices": supported_devices,
            "optix": "unknown",
            "artifactTransport": "GET /v1/artifacts/{requestId}",
            "cancellation": "POST /v1/cancel",
        }

    def render(self, request: dict[str, Any], cancel_event: threading.Event) -> dict[str, Any]:
        if cancel_event.is_set():
            raise BridgeError("cancelled", "render was cancelled before the fixed scene started", 409)
        if not self.ready:
            raise BridgeError("mitsuba_unavailable", "Mitsuba worker is not ready", 503)
        device = request["compute"]["device"]
        with self._lock:
            if cancel_event.is_set():
                raise BridgeError("cancelled", "render was cancelled before the fixed scene started", 409)
            required_variant = "cuda_ad_rgb" if device == "cuda" else "scalar_rgb"
            if device == "cuda" and not self.cuda_available:
                raise BridgeError("cuda_unavailable", "CUDA was requested but cuda_ad_rgb/RTX is unavailable", 503)
            # Mitsuba's Python binding owns a process-global variant. Switching
            # scalar_rgb -> cuda_ad_rgb after a scene has been used is not a
            # safe request boundary on the current wheel, so the worker fixes
            # one variant at startup and rejects a mismatched device explicitly.
            if self._active_variant != required_variant:
                code = "cuda_unavailable" if device == "cuda" else "device_unavailable"
                raise BridgeError(code, f"worker is fixed to {self._active_variant}; requested {required_variant}", 503)
            obj_text = _sanitize_obj(request["canonicalMesh"]["data"])
            with tempfile.TemporaryDirectory(prefix="hikari-mitsuba-bridge-") as temp_name:
                temp_dir = Path(temp_name)
                obj_path = temp_dir / "canonical.obj"
                png_path = temp_dir / "artifact.png"
                obj_path.write_text(obj_text, encoding="utf-8", newline="\n")
                scene = self._scene(request, obj_path)
                if cancel_event.is_set():
                    raise BridgeError("cancelled", "render was cancelled before the fixed render call", 409)
                started = time.perf_counter()
                try:
                    scene_object = self._mi.load_dict(scene)
                    image = self._mi.render(scene_object, spp=request["spp"], seed=1)
                    self._dr.eval(image)
                    self._dr.sync_thread()
                    # ``mi.render`` returns a Dr.Jit tensor for CUDA variants;
                    # convert to Mitsuba's bitmap wrapper before serializing.
                    bitmap = self._mi.Bitmap(image)
                    # Mitsuba's renderer returns linear float32 RGB. PNG's
                    # encoder in this wheel accepts an explicit UInt8 bitmap;
                    # conversion is bounded and keeps the artifact transport
                    # independent of the research EXR/float formats.
                    png_bitmap = bitmap.convert(self._mi.Bitmap.PixelFormat.RGB, self._mi.Struct.Type.UInt8, True)
                    png_bitmap.write(str(png_path), self._mi.Bitmap.FileFormat.PNG)
                    artifact = png_path.read_bytes()
                except BridgeError:
                    raise
                except Exception as exc:
                    raise BridgeError("render_failed", f"Mitsuba render failed: {type(exc).__name__}: {exc}", 502) from exc
                elapsed_ms = (time.perf_counter() - started) * 1000
                if cancel_event.is_set():
                    raise BridgeError("cancelled", "render completed after cancellation and was discarded", 409)
                if len(artifact) > MAX_ARTIFACT_BYTES:
                    raise BridgeError("artifact_too_large", "render artifact exceeds bridge limit", 500)
                output_hash = artifact_hash(artifact)
                warnings = []
                if request["physicalScale"]["source"] == "assumed":
                    warnings.append("physicalScale is assumed, not measured")
                warnings.append("OptiX status is unknown; this render used the selected Mitsuba variant")
                return {
                    "requestId": request["requestId"],
                    "success": True,
                    "operation": request["operation"],
                    "selectedVariant": required_variant,
                    "gpu": self._gpu if device == "cuda" else None,
                    "executionDevice": device,
                    "cudaFallback": False,
                    "purpose": request["renderPurpose"],
                    "resolution": request["resolution"],
                    "spp": request["spp"],
                    "renderMs": round(elapsed_ms, 3),
                    "artifactHash": output_hash,
                    "artifactByteLength": len(artifact),
                    "artifactUrl": f"/v1/artifacts/{request['requestId']}",
                    "provenanceHash": provenance_hash(request),
                    "provenanceFingerprint": request["provenance"]["fingerprint"],
                    "warnings": warnings,
                    "artifact": artifact,
                }

    def _scene(self, request: dict[str, Any], obj_path: Path) -> dict[str, Any]:
        mi = self._mi
        camera = request["camera"]
        position = _xyz_list(camera["positionMm"])
        target = _xyz_list(camera["targetMm"])
        up = _xyz_list(camera["up"])
        receiver = request["receiver"]
        receiver_position = _xyz_list(receiver["positionMm"])
        receiver_normal = _xyz_list(receiver["normal"])
        direction = _normalize(_xyz_list(request["light"]["directionPropagation"]))
        light_target = receiver_position
        light_source = [receiver_position[index] - direction[index] * 250.0 for index in range(3)]
        distance = math.sqrt(sum((light_source[index] - light_target[index]) ** 2 for index in range(3)))
        angular = request["light"]["angularDiameterDeg"]
        light_size = max(1.0, distance * math.tan(math.radians(max(0.1, angular) / 2.0)))
        receiver_transform = mi.ScalarTransform4f.look_at(
            origin=receiver_position,
            target=[receiver_position[index] + receiver_normal[index] for index in range(3)],
            up=_safe_up(receiver_normal),
        ) @ mi.ScalarTransform4f.scale([receiver["extentMm"]["x"] / 2, receiver["extentMm"]["z"] / 2, 1])
        light_transform = mi.ScalarTransform4f.look_at(
            origin=light_source,
            target=light_target,
            up=[0, 1, 0],
        ) @ mi.ScalarTransform4f.scale([light_size, light_size, 1])
        material = request["hostMaterial"]
        integrator_type = "ptracer" if request["renderPurpose"] == "receiver" else "path"
        shapes: dict[str, Any] = {
            "host": {
                "type": "obj",
                "filename": obj_path.as_posix(),
                "bsdf": {
                    "type": "roughdielectric" if material["roughness"] > 0 else "dielectric",
                    "int_ior": material["ior"],
                    "ext_ior": 1.0,
                    **({"alpha": max(0.001, material["roughness"] ** 2)} if material["roughness"] > 0 else {}),
                },
                "interior": {
                    "type": "homogeneous",
                    "sigma_t": {"type": "rgb", "value": _rgb_list(material["absorptionPerMm"])},
                },
            },
            "light": {
                "type": "rectangle",
                "to_world": light_transform,
                "emitter": {
                    "type": "area",
                    "radiance": {"type": "rgb", "value": _rgb_list(request["light"]["radiance"])},
                },
            },
        }
        if request["renderPurpose"] == "receiver":
            shapes["receiver"] = {
                "type": "rectangle",
                "to_world": receiver_transform,
                "bsdf": {
                    "type": "diffuse",
                    "reflectance": {"type": "rgb", "value": [receiver["reflectance"]] * 3},
                },
            }
        return {
            "type": "scene",
            "integrator": {"type": integrator_type, "max_depth": 8, "rr_depth": 5},
            "sensor": {
                "type": "perspective",
                "fov": camera["fovDeg"],
                "to_world": mi.ScalarTransform4f.look_at(origin=position, target=target, up=up),
                "film": {
                    "type": "hdrfilm",
                    "width": request["resolution"]["width"],
                    "height": request["resolution"]["height"],
                    "rfilter": {"type": "box"},
                    "pixel_format": "rgb",
                },
                "sampler": {"type": "independent", "sample_count": request["spp"]},
            },
            "emitter": {
                "type": "constant",
                "radiance": {"type": "rgb", "value": _rgb_list(request["environment"]["radiance"])},
            },
            **shapes,
        }


_FLOAT = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")


def _sanitize_obj(data: bytes) -> str:
    """Allow only the canonical v/f subset, removing loader-side indirection."""
    if not data or len(data) > 4_000_000:
        raise BridgeError("invalid_mesh", "canonical OBJ is empty or too large")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise BridgeError("invalid_mesh", "canonical OBJ is not UTF-8") from exc
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if parts[0] == "v" and len(parts) == 4:
            values: list[float] = []
            for token in parts[1:]:
                if _FLOAT.fullmatch(token) is None:
                    raise BridgeError("invalid_mesh", f"OBJ vertex line {line_number} is not numeric")
                value = float(token)
                if not math.isfinite(value) or abs(value) > 10_000:
                    raise BridgeError("invalid_mesh", f"OBJ vertex line {line_number} is out of bounds")
                values.append(value)
            vertices.append((values[0], values[1], values[2]))
            if len(vertices) > 200_000:
                raise BridgeError("invalid_mesh", "canonical OBJ has too many vertices")
            continue
        if parts[0] == "f" and len(parts) == 4:
            indexes: list[int] = []
            for token in parts[1:]:
                if re.fullmatch(r"[1-9]\d*", token) is None:
                    raise BridgeError("invalid_mesh", f"OBJ face line {line_number} is not a plain index")
                index = int(token)
                if index > len(vertices):
                    raise BridgeError("invalid_mesh", f"OBJ face line {line_number} references a missing vertex")
                indexes.append(index)
            if len(set(indexes)) < 3:
                raise BridgeError("invalid_mesh", f"OBJ face line {line_number} is degenerate")
            faces.append((indexes[0], indexes[1], indexes[2]))
            if len(faces) > 400_000:
                raise BridgeError("invalid_mesh", "canonical OBJ has too many faces")
            continue
        raise BridgeError("invalid_mesh", f"OBJ line {line_number} contains unsupported syntax")
    if not vertices or not faces:
        raise BridgeError("invalid_mesh", "canonical OBJ must contain vertices and faces")
    output = ["# Hikari canonical OBJ sanitized by local bridge"]
    output.extend(f"v {x:.9g} {y:.9g} {z:.9g}" for x, y, z in vertices)
    output.extend(f"f {a} {b} {c}" for a, b, c in faces)
    return "\n".join(output) + "\n"


def _xyz_list(value: dict[str, float]) -> list[float]:
    return [value["x"], value["y"], value["z"]]


def _rgb_list(value: dict[str, float]) -> list[float]:
    return [value["r"], value["g"], value["b"]]


def _normalize(value: list[float]) -> list[float]:
    length = math.sqrt(sum(component * component for component in value))
    if length < 1e-9:
        raise BridgeError("invalid_request", "direction cannot be zero")
    return [component / length for component in value]


def _safe_up(normal: list[float]) -> list[float]:
    candidate = [0.0, 1.0, 0.0]
    if abs(sum(candidate[index] * normal[index] for index in range(3))) > 0.98:
        candidate = [1.0, 0.0, 0.0]
    return candidate
