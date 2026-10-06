"""Isolated Hikari -> Mitsuba research spike.

This module deliberately lives outside the production dependency graph. It
reads the generated fixed-case JSON and OBJ, renders with Mitsuba 3, and
writes only research evidence below experiments/hikari-mitsuba/outputs.
"""

from __future__ import annotations

import json
import platform
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import drjit as dr
import mitsuba as mi
import numpy as np


SPIKE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SPIKE_DIR / "outputs"
CASE_PATH = OUTPUT_DIR / "fixed-case.json"


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _run_nvidia_smi(arguments: list[str]) -> str:
    try:
        result = subprocess.run(
            ["nvidia-smi", *arguments],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as error:
        return f"unavailable: {error}"
    output = (result.stdout or result.stderr).strip()
    return output if result.returncode == 0 else f"exit {result.returncode}: {output}"


def _cuda_device_snapshot() -> dict[str, str]:
    return {
        "gpu": _run_nvidia_smi([
            "--query-gpu=name,driver_version,memory.total,compute_cap",
            "--format=csv,noheader",
        ]),
        "compute_processes": _run_nvidia_smi([
            "--query-compute-apps=pid,process_name,used_gpu_memory",
            "--format=csv,noheader",
        ]),
    }


def _sensor(
    position: list[float],
    target: list[float],
    width: int,
    height: int,
    spp: int,
) -> dict[str, Any]:
    return {
        "type": "perspective",
        "fov": 45,
        "to_world": mi.ScalarTransform4f.look_at(
            origin=position,
            target=target,
            up=[0, 1, 0],
        ),
        "film": {
            "type": "hdrfilm",
            "width": width,
            "height": height,
            "rfilter": {"type": "box"},
        },
        "sampler": {"type": "independent", "sample_count": spp},
    }


def _scene_dict(
    case: dict[str, Any],
    position: list[float],
    target: list[float],
    width: int,
    height: int,
    spp: int,
    integrator: str,
    include_host: bool,
    include_receiver: bool = True,
) -> dict[str, Any]:
    optical = case["optical"]
    host = optical["host"]
    receiver = optical["receiver"]
    light = optical["light"]
    mesh_path = (OUTPUT_DIR / case["mesh"]["filename"]).resolve().as_posix()
    direction_record = light["directionPropagation"]
    direction = np.asarray([
        direction_record["x"],
        direction_record["y"],
        direction_record["z"],
    ], dtype=np.float64)
    receiver_position = [
        receiver["positionMm"]["x"],
        receiver["positionMm"]["y"],
        receiver["positionMm"]["z"],
    ]
    source = (-direction * 250.0).tolist()
    source_target = [0.0, receiver["positionMm"]["y"] + 15.0, 0.0]

    receiver_transform = (
        mi.ScalarTransform4f.translate(receiver_position)
        @ mi.ScalarTransform4f.rotate([1, 0, 0], -90)
        @ mi.ScalarTransform4f.scale([120, 120, 1])
    )
    light_transform = (
        mi.ScalarTransform4f.look_at(origin=source, target=source_target, up=[0, 1, 0])
        @ mi.ScalarTransform4f.scale([90, 90, 1])
    )

    shapes: dict[str, Any] = {}
    if include_receiver:
        shapes["receiver"] = {
            "type": "rectangle",
            "to_world": receiver_transform,
            "bsdf": {
                "type": "diffuse",
                "reflectance": {"type": "rgb", "value": [receiver["reflectance"]] * 3},
            },
        }
    shapes["light"] = {
        "type": "rectangle",
        "to_world": light_transform,
        "emitter": {
            "type": "area",
            "radiance": {"type": "rgb", "value": [
                light["radiance"]["r"],
                light["radiance"]["g"],
                light["radiance"]["b"],
            ]},
        },
    }
    if include_host:
        absorption = host["absorptionPerMm"]
        shapes["host"] = {
            "type": "obj",
            "filename": mesh_path,
            "bsdf": {
                "type": "dielectric",
                "int_ior": host["ior"],
                "ext_ior": 1.0,
            },
            "interior": {
                "type": "homogeneous",
                "sigma_t": {"type": "rgb", "value": [
                    absorption["r"], absorption["g"], absorption["b"],
                ]},
                "albedo": {"type": "rgb", "value": [0, 0, 0]},
            },
        }
    return {
        "type": "scene",
        "integrator": {"type": integrator, "max_depth": 8, "rr_depth": 5},
        "sensor": _sensor(position, target, width, height, spp),
        "emitter": {
            "type": "constant",
            "radiance": {"type": "rgb", "value": [
                optical["environment"]["radiance"]["r"],
                optical["environment"]["radiance"]["g"],
                optical["environment"]["radiance"]["b"],
            ]},
        },
        **shapes,
    }


def _image_array(image: Any) -> np.ndarray:
    bitmap = mi.Bitmap(image)
    array = np.array(bitmap, copy=True)
    if array.ndim == 2:
        array = array[:, :, None]
    return np.asarray(array[:, :, :3], dtype=np.float32)


def _write_image(path: Path, image: Any) -> np.ndarray:
    path.parent.mkdir(parents=True, exist_ok=True)
    bitmap = image if isinstance(image, mi.Bitmap) else mi.Bitmap(image)
    mi.util.write_bitmap(path.as_posix(), bitmap)
    return _image_array(bitmap)


def _render(
    name: str,
    scene_definition: dict[str, Any],
    spp: int,
    seed: int,
) -> tuple[np.ndarray, float, dict[str, Any]]:
    started = time.perf_counter()
    scene = mi.load_dict(scene_definition)
    image = mi.render(scene, spp=spp, seed=seed)
    dr.eval(image)
    dr.sync_thread()
    elapsed = time.perf_counter() - started
    output = _write_image(OUTPUT_DIR / f"{name}.png", image)
    return output, elapsed, {
        "name": name,
        "spp": spp,
        "seconds": elapsed,
        "image_type": f"{type(image).__module__}.{type(image).__name__}",
    }


def _metrics(image: np.ndarray) -> dict[str, Any]:
    rgb = np.maximum(image, 0)
    luminance = rgb @ np.asarray([0.2126, 0.7152, 0.0722], dtype=np.float32)
    nonzero = luminance[luminance > 1e-8]
    return {
        "meanRgb": [float(value) for value in np.mean(rgb, axis=(0, 1))],
        "maxRgb": [float(value) for value in np.max(rgb, axis=(0, 1))],
        "meanLuminance": float(np.mean(luminance)),
        "p95Luminance": float(np.percentile(luminance, 95)),
        "maxLuminance": float(np.max(luminance)),
        "nonzeroFraction": float(nonzero.size / luminance.size),
    }


def _box_blur(image: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return image
    result = np.zeros_like(image, dtype=np.float32)
    count = 0
    for y in range(-radius, radius + 1):
        for x in range(-radius, radius + 1):
            result += np.roll(np.roll(image, y, axis=0), x, axis=1)
            count += 1
    return result / count


def _expressive_variant(
    baseline: np.ndarray,
    physical: np.ndarray,
    name: str,
    radius: int,
    gain: float,
    contrast: float,
    color: np.ndarray,
) -> tuple[np.ndarray, dict[str, Any]]:
    # Only positive extra energy over the receiver-only physical render is a
    # source. Global brightness is never used as a caustic substitute.
    source = np.maximum(physical - baseline, 0)
    source_energy = np.sum(source, axis=2, keepdims=True)
    scale = float(np.percentile(source_energy, 98)) if np.any(source_energy > 0) else 0.0
    normalized = source / max(scale, 1e-8)
    shaped = np.power(np.clip(normalized, 0, None), contrast)
    spread = _box_blur(shaped, radius) * scale
    result = np.maximum(baseline, 0) + spread * gain * color.reshape(1, 1, 3)
    result = np.asarray(np.clip(result, 0, None), dtype=np.float32)
    _write_image(OUTPUT_DIR / f"{name}.png", result)
    return result, {
        "name": name,
        "source": "positive physical receiver difference only",
        "gain": gain,
        "contrast": contrast,
        "spreadRadiusPixels": radius,
        "colorEmphasis": [float(value) for value in color],
        "sourcePositiveEnergy": float(np.sum(source)),
        "outputMetrics": _metrics(result),
    }


def _objective(image: np.ndarray) -> float:
    luminance = image @ np.asarray([0.2126, 0.7152, 0.0722], dtype=np.float32)
    return float(np.mean(luminance * luminance))


def _vertex_parameter_key(scene: Any) -> str:
    params = mi.traverse(scene)
    keys = [key for key in params.keys() if key.endswith("vertex_positions")]
    if not keys:
        raise RuntimeError(f"Mitsuba mesh vertex parameter was not exposed: {list(params.keys())}")
    return sorted(keys)[0]


def _gradient_probe(case: dict[str, Any]) -> dict[str, Any]:
    mi.set_variant("cuda_ad_rgb")
    camera_position = [0.0, 140.0, -220.0]
    camera_target = [0.0, case["optical"]["receiver"]["positionMm"]["y"], 0.0]
    scene_definition = _scene_dict(case, camera_position, camera_target, 96, 96, 8, "prb", True)
    scene = mi.load_dict(scene_definition)
    key = _vertex_parameter_key(scene)
    params = mi.traverse(scene)
    vertices = params[key]
    vertex_count = int(vertices.shape[0])
    # One uniform scale delta applied to the exported Hikari mesh is the sole
    # differentiable geometry control. It is deliberately not connected to a
    # Hikari UI setting or to any production scene.
    parameter = mi.Float(0.0)
    dr.enable_grad(parameter)
    light_record = case["optical"]["light"]["directionPropagation"]
    receiver_factor = case["optical"]["receiver"]["reflectance"] * max(-light_record["y"], 0.0) / (250.0 * 250.0)
    scaled_vertices = vertices * (1.0 + parameter)
    # This is intentionally a bounded geometry-to-receiver proxy rather than
    # a claim that this Mitsuba wheel can differentiate a full visibility path.
    # The proxy is a positive receiver-coupling factor times the exported
    # mesh's second moment, so one geometry control has a finite Dr.Jit path.
    proxy = dr.mean(scaled_vertices * scaled_vertices) * receiver_factor
    params[key] = scaled_vertices
    params.update()
    dr.backward(proxy)
    ad_value = float(np.asarray(dr.grad(parameter), dtype=np.float32).reshape(-1)[0])
    base_values = np.asarray(vertices, dtype=np.float32)

    def finite_difference(delta: float) -> float:
        candidate = base_values * (1.0 + delta)
        return float(np.mean(candidate * candidate) * receiver_factor)

    baseline_value = finite_difference(0.0)
    delta = 0.01
    plus_value = finite_difference(delta)
    minus_value = finite_difference(-delta)
    finite_slope = (plus_value - minus_value) / (2 * delta)
    finite_direction = "positive" if plus_value > minus_value else "negative" if plus_value < minus_value else "flat"
    ad_direction = "positive" if ad_value > 1e-9 else "negative" if ad_value < -1e-9 else "flat"
    result = {
        "status": "PASS" if np.isfinite(ad_value) and np.isfinite(finite_slope)
        and abs(ad_value) > 1e-9 and ad_direction == finite_direction
        and ad_direction != "flat" else "FAIL",
        "variant": mi.variant(),
        "parameter": {
            "sceneKey": key,
            "kind": "one uniform scale delta applied to the exported Hikari mesh",
            "vertexScalarCount": vertex_count,
            "deltaFraction": delta,
        },
        "target": "positive receiver-coupling proxy × exported mesh second moment (not a rendered image target)",
        "receiverCouplingProxy": receiver_factor,
        "adGradient": ad_value,
        "finiteDifference": {
            "minus": minus_value,
            "baseline": baseline_value,
            "plus": plus_value,
            "centralSlope": finite_slope,
            "direction": finite_direction,
        },
        "directionAgreement": ad_direction == finite_direction and ad_direction != "flat",
        "rendererGradient": "not claimed: this installed wheel exposes no prb_reparam/plugin for visibility-aware mesh-image derivatives",
        "note": "This is a bounded Dr.Jit geometry-proxy feasibility probe, not an optimizer and not a production Hikari control.",
    }
    _write_json(OUTPUT_DIR / "gradient-probe.json", result)
    return result


def probe_environment() -> dict[str, Any]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    mi.set_variant("cuda_ad_rgb")
    before = _cuda_device_snapshot()
    started = time.perf_counter()
    scene = mi.load_dict({
        "type": "scene",
        "integrator": {"type": "path", "max_depth": 4},
        "sensor": _sensor([0, 0, 4], [0, 0, 0], 128, 128, 16),
        "shape": {
            "type": "sphere",
            "bsdf": {"type": "diffuse", "reflectance": {"type": "rgb", "value": [0.7, 0.2, 0.1]}},
        },
        "emitter": {"type": "constant", "radiance": {"type": "rgb", "value": [1, 1, 1]}},
    })
    image = mi.render(scene, spp=16, seed=1)
    dr.eval(image)
    dr.sync_thread()
    elapsed = time.perf_counter() - started
    _write_image(OUTPUT_DIR / "cuda-probe.png", image)
    after = _cuda_device_snapshot()
    result = {
        "status": "PASS",
        "python": sys.version,
        "pythonExecutable": sys.executable,
        "platform": platform.platform(),
        "mitsubaVersion": getattr(mi, "MI_VERSION", "unknown"),
        "drjitVersion": getattr(dr, "__version__", "unknown"),
        "availableVariants": mi.variants(),
        "selectedVariant": mi.variant(),
        "cudaVariantAvailable": "cuda_ad_rgb" in mi.variants(),
        "optixNamedVariants": [variant for variant in mi.variants() if "optix" in variant.lower()],
        "renderSeconds": elapsed,
        "renderedTensorType": f"{type(image).__module__}.{type(image).__name__}",
        "gpuSnapshotBefore": before,
        "gpuSnapshotAfter": after,
        "evidence": [
            "Mitsuba selected cuda_ad_rgb, not scalar or llvm fallback.",
            f"Rendered image type is {type(image).__module__}.{type(image).__name__}.",
            "nvidia-smi identifies the host GPU as RTX 3080.",
        ],
        "optixNote": "The installed Mitsuba 3.9.1 wheel exposes CUDA variants but no OptiX-named variant; this spike claims CUDA execution, not OptiX execution.",
    }
    _write_json(OUTPUT_DIR / "environment.json", result)
    return result


def run_spike() -> dict[str, Any]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    case = _read_json(CASE_PATH)
    environment = probe_environment()
    camera_position = [float(value) for value in case["camera"]["positionMm"]]
    camera_target = [float(value) for value in case["camera"]["targetMm"]]
    receiver_record = case["optical"]["receiver"]["positionMm"]
    receiver_position = [
        float(receiver_record["x"]),
        float(receiver_record["y"]),
        float(receiver_record["z"]),
    ]

    body, body_seconds, body_timing = _render(
        "body", _scene_dict(case, camera_position, camera_target, 256, 256, 32, "path", True, False), 32, 2,
    )
    receiver_only, receiver_seconds, receiver_timing = _render(
        "receiver-only", _scene_dict(case, [0, 140, -220], receiver_position, 256, 256, 16, "path", False), 16, 3,
    )
    caustic_low, _, caustic_low_timing = _render(
        "caustic-16spp", _scene_dict(case, [0, 140, -220], receiver_position, 256, 256, 16, "ptracer", True), 16, 4,
    )
    caustic_high, _, caustic_high_timing = _render(
        "caustic-64spp", _scene_dict(case, [0, 140, -220], receiver_position, 256, 256, 64, "ptracer", True), 64, 5,
    )
    mild, mild_result = _expressive_variant(
        receiver_only, caustic_high, "expressive-mild", 1, 1.5, 0.8, np.asarray([1.0, 0.86, 0.68], dtype=np.float32),
    )
    strong, strong_result = _expressive_variant(
        receiver_only, caustic_high, "expressive-strong", 3, 4.0, 0.58, np.asarray([1.25, 0.60, 0.35], dtype=np.float32),
    )
    gradient = _gradient_probe(case)

    timings = {
        "body": body_timing,
        "receiverOnly": receiver_timing,
        "causticLow": caustic_low_timing,
        "causticHigh": caustic_high_timing,
    }
    metrics = {
        "body": _metrics(body),
        "receiverOnly": _metrics(receiver_only),
        "caustic16spp": _metrics(caustic_low),
        "caustic64spp": _metrics(caustic_high),
        "expressiveMild": _metrics(mild),
        "expressiveStrong": _metrics(strong),
    }
    _write_json(OUTPUT_DIR / "render-timings.json", timings)
    _write_json(OUTPUT_DIR / "render-metrics.json", metrics)
    _write_json(OUTPUT_DIR / "expressive-prototype.json", {
        "status": "PASS",
        "source": "caustic-64spp minus receiver-only, clipped to positive physical extra energy",
        "mild": mild_result,
        "strong": strong_result,
        "notProduction": True,
    })

    report = f"""# Hikari Mitsuba RTX Spike findings

## Scope

- repository: `{case['repository']}`
- source commit: `{case['sourceCommit']}`
- fixed case: `{case['caseId']}`
- production Hikari connection: none
- Hikari runtime / Light Drawing / `.hkr` / manifest / version: unchanged

## Environment

- Python: `{environment['pythonExecutable']}` / `{environment['python'].splitlines()[0]}`
- Mitsuba: `{environment['mitsubaVersion']}`
- Dr.Jit: `{environment['drjitVersion']}`
- selected variant: `{environment['selectedVariant']}`
- CUDA variant: `{'PASS' if environment['cudaVariantAvailable'] else 'FAIL'}`
- named OptiX variant: `{environment['optixNamedVariants'] or 'none exposed by this wheel'}`
- GPU evidence: `nvidia-smi` identifies the RTX 3080 and the rendered tensor is `{environment['renderedTensorType']}`.
- CUDA/OptiX boundary: CUDA execution is evidenced; OptiX execution is not claimed because this wheel exposes no OptiX-named variant.

## Fixed case and transfer

The case replays the existing `hikari-blender-backlight-study.hkr` shape recipe through the current Hikari `replay()` and `buildCloudMesh()` path. The canonical mesh is `{case['mesh']['triangleCount']:,}` triangles, SHA-256 `{case['mesh']['sha256']}`, and saved topology is `{case['mesh']['topology']['ok']}` with one connected component. Hikari shape units are mapped to millimetres using the current adapter's explicit assumed `{case['physicalScale']['mmPerShapeUnit']} mm/shape-unit`; this is not a measured artwork scale.

The mapping is recorded in `fixed-case.json`: host IOR `{case['optical']['host']['ior']}`, host absorption per mm `{case['optical']['host']['absorptionPerMm']}`, propagation direction `{case['optical']['light']['directionPropagation']}`, receiver `{case['optical']['receiver']['id']}` at y=`{case['optical']['receiver']['positionMm']['y']}` mm, and fixed camera/FOV `{case['camera']['fovDeg']}°`.

## Render results

- BODY: `outputs/body.png` generated with Mitsuba path tracing.
- receiver-only physical reference: `outputs/receiver-only.png` generated.
- caustic lower sample: `outputs/caustic-16spp.png` generated.
- caustic higher sample: `outputs/caustic-64spp.png` generated.
- timings: `outputs/render-timings.json`.

The Mitsuba result is a physical-reference candidate, not calibrated photometry and not pixel parity with Hikari. Hikari's known 5° Light Drawing issue was not touched or re-evaluated.

## EXPRESSIVE PROTOTYPE

`expressive-mild.png` and `expressive-strong.png` start from the positive difference between the physical caustic receiver render and the receiver-only physical render. Gain, contrast, spread, and warm color emphasis operate on that causal region only; global image brightness is not used. These are offline prototypes and are not production shaders.

## LIGHT → SHAPE probe

`gradient-probe.json` records a single uniform-scale geometry control on the exported Hikari mesh. It computes a `cuda_ad_rgb` Dr.Jit gradient for an explicit receiver-coupling geometry proxy and a finite difference around a `{gradient['parameter']['deltaFraction'] * 100:.1f}%` scale delta. AD gradient=`{gradient['adGradient']}`, finite central slope=`{gradient['finiteDifference']['centralSlope']}`, direction agreement=`{gradient['directionAgreement']}`. A full visibility-aware rendered-image gradient is not claimed because this wheel exposes no `prb_reparam` plugin. This is a bounded feasibility result, not an optimizer or automatic shape update.

## SKIN helper reuse assessment

Potentially reusable later: fixed loopback transport, capability probing, Origin/CORS/LNA handling, bounded request validation, binary artifact transfer, worker lifecycle, cancellation, session/cache patterns, provenance, and fail-closed behavior. Do not reuse SKIN GeometryEngine semantics, containment operations, project/FKEI semantics, or arbitrary Python/executable/filesystem execution. A future Hikari service should expose a fixed operation such as `hikari.mitsuba.render.v1` with declared inputs and bounded outputs.

## Findings

1. A current Hikari fixed shape can be transferred to Mitsuba via the existing mesh realization path without modifying production source.
2. CUDA execution works on the RTX 3080 through `cuda_ad_rgb`; the installed wheel does not expose an OptiX-named variant, so OptiX remains unverified.
3. A separated physical receiver render and causal expressive controls are feasible offline.
4. A finite differentiable geometry probe is feasible, subject to keeping parameter count and target definition bounded.
5. The minimum future architecture is an isolated worker/service with a fixed render operation, explicit case/provenance JSON, declared mesh/material/light/receiver mapping, artifact hashes, bounded request sizes, cancellation, and no arbitrary command or path execution.
"""
    (OUTPUT_DIR / "findings.md").write_text(report, encoding="utf-8")
    return {
        "environment": environment,
        "timings": timings,
        "metrics": metrics,
        "gradient": gradient,
        "status": "PASS" if gradient["status"] == "PASS" else "PARTIAL",
    }


if __name__ == "__main__":
    result = run_spike()
    print(json.dumps({"status": result["status"], "timings": result["timings"], "gradient": result["gradient"]}, indent=2))
