"""Pure validation and response helpers for the Hikari Mitsuba local bridge.

This module deliberately has no Mitsuba, filesystem, subprocess, or network
dependency.  Keeping the request contract here makes the boundary testable
when the optional research environment is not installed.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import re
from urllib.parse import urlsplit
from typing import Any, Mapping


SCHEMA_VERSION = "hikari-mitsuba-bridge.v1"
SERVICE_NAME = "hikari-mitsuba-local-bridge"
BIND_ADDRESS = "127.0.0.1"
PORT = 47659
OPERATION = "hikari.mitsuba.render.v1"
MAX_REQUEST_BYTES = 8_000_000
MAX_MESH_BYTES = 4_000_000
MAX_ARTIFACT_BYTES = 8_000_000
MAX_RESOLUTION = 512
MAX_SPP = 128
ALLOWED_ORIGINS = frozenset(
    {
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    }
)

HEX64 = re.compile(r"^[0-9a-f]{64}$")
SHA1 = re.compile(r"^[0-9a-f]{40}$")
REQUEST_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
CASE_ID = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


class BridgeError(Exception):
    """An expected fail-closed protocol error."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BridgeError("invalid_request", f"{name} must be an object")
    return value


def _keys(value: Mapping[str, Any], allowed: set[str], name: str, required: set[str] | None = None) -> None:
    unknown = set(value) - allowed
    if unknown:
        raise BridgeError("unknown_field", f"{name} contains unsupported field(s): {sorted(unknown)}")
    missing = (required or set()) - set(value)
    if missing:
        raise BridgeError("missing_field", f"{name} is missing required field(s): {sorted(missing)}")


def _string(value: Any, name: str, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value:
        raise BridgeError("invalid_request", f"{name} must be a non-empty string")
    if pattern is not None and pattern.fullmatch(value) is None:
        raise BridgeError("invalid_request", f"{name} has an invalid format")
    return value


def _number(value: Any, name: str, *, minimum: float | None = None, maximum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise BridgeError("invalid_request", f"{name} must be a finite number")
    number = float(value)
    if minimum is not None and number < minimum:
        raise BridgeError("invalid_request", f"{name} must be >= {minimum}")
    if maximum is not None and number > maximum:
        raise BridgeError("invalid_request", f"{name} must be <= {maximum}")
    return number


def _integer(value: Any, name: str, *, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise BridgeError("invalid_request", f"{name} must be an integer in [{minimum}, {maximum}]")
    return value


def _vector(value: Any, name: str, keys: tuple[str, ...]) -> dict[str, float]:
    obj = _object(value, name)
    _keys(obj, set(keys), name, set(keys))
    return {key: _number(obj[key], f"{name}.{key}") for key in keys}


def _rgb(value: Any, name: str, *, maximum: float | None = None) -> dict[str, float]:
    obj = _object(value, name)
    _keys(obj, {"r", "g", "b"}, name, {"r", "g", "b"})
    return {
        key: _number(obj[key], f"{name}.{key}", minimum=0, maximum=maximum)
        for key in ("r", "g", "b")
    }


def _walk_forbidden(value: Any, path: str = "request") -> None:
    forbidden = {
        "command",
        "code",
        "executable",
        "filename",
        "file",
        "import",
        "module",
        "path",
        "plugin",
        "python",
        "scene",
        "script",
        "shell",
        "url",
    }
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in forbidden:
                raise BridgeError("unsupported_field", f"{path}.{key} is not accepted")
            _walk_forbidden(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_forbidden(child, f"{path}[{index}]")


def _mesh(value: Any) -> dict[str, Any]:
    obj = _object(value, "canonicalMesh")
    _keys(obj, {"format", "dataBase64", "byteLength", "sha256"}, required={"format", "dataBase64", "byteLength", "sha256"}, name="canonicalMesh")
    if obj["format"] != "obj":
        raise BridgeError("invalid_request", "canonicalMesh.format must be obj")
    encoded = _string(obj["dataBase64"], "canonicalMesh.dataBase64")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise BridgeError("invalid_request", "canonicalMesh.dataBase64 is not valid base64") from exc
    if len(data) > MAX_MESH_BYTES:
        raise BridgeError("request_too_large", f"canonical mesh exceeds {MAX_MESH_BYTES} bytes", 413)
    byte_length = _integer(obj["byteLength"], "canonicalMesh.byteLength", minimum=1, maximum=MAX_MESH_BYTES)
    if byte_length != len(data):
        raise BridgeError("invalid_request", "canonicalMesh.byteLength does not match decoded bytes")
    sha256 = _string(obj["sha256"], "canonicalMesh.sha256", HEX64)
    actual = hashlib.sha256(data).hexdigest()
    if actual != sha256:
        raise BridgeError("provenance_mismatch", "canonical mesh sha256 does not match bytes")
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise BridgeError("invalid_request", "canonical OBJ must be UTF-8") from exc
    return {"format": "obj", "data": data, "byteLength": byte_length, "sha256": sha256}


def validate_render_request(value: Any) -> dict[str, Any]:
    """Validate and normalize the fixed render request.

    The returned mapping intentionally contains decoded mesh bytes for the
    worker.  It is never a path or an executable instruction.
    """

    request = _object(value, "request")
    _walk_forbidden(request)
    allowed = {
        "requestId",
        "operation",
        "case",
        "provenance",
        "canonicalMesh",
        "physicalScale",
        "camera",
        "hostMaterial",
        "light",
        "receiver",
        "environment",
        "renderPurpose",
        "compute",
        "spp",
        "resolution",
    }
    _keys(request, allowed, required=allowed, name="request")
    request_id = _string(request["requestId"], "requestId", REQUEST_ID)
    if request["operation"] != OPERATION:
        raise BridgeError("unsupported_operation", f"operation must be {OPERATION}")

    case = _object(request["case"], "case")
    _keys(case, {"id", "label"}, required={"id"}, name="case")
    case_id = _string(case["id"], "case.id", CASE_ID)
    label = case.get("label", case_id)
    if not isinstance(label, str) or len(label) > 120:
        raise BridgeError("invalid_request", "case.label must be a bounded string")

    provenance = _object(request["provenance"], "provenance")
    _keys(
        provenance,
        {"repository", "sourceCommit", "sourceRef", "shapeSource", "fingerprint"},
        required={"repository", "sourceCommit", "sourceRef", "shapeSource", "fingerprint"},
        name="provenance",
    )
    repository = _string(provenance["repository"], "provenance.repository")
    source_commit = _string(provenance["sourceCommit"], "provenance.sourceCommit", SHA1)
    source_ref = _string(provenance["sourceRef"], "provenance.sourceRef")
    shape_source = _string(provenance["shapeSource"], "provenance.shapeSource")
    fingerprint = _string(provenance["fingerprint"], "provenance.fingerprint", HEX64)

    physical_scale = _object(request["physicalScale"], "physicalScale")
    _keys(physical_scale, {"mmPerShapeUnit", "source"}, required={"mmPerShapeUnit", "source"}, name="physicalScale")
    mm_per_unit = _number(physical_scale["mmPerShapeUnit"], "physicalScale.mmPerShapeUnit", minimum=1e-6, maximum=10_000)
    scale_source = physical_scale["source"]
    if scale_source not in {"assumed", "derived-from-mesh", "author"}:
        raise BridgeError("invalid_request", "physicalScale.source is invalid")

    camera = _object(request["camera"], "camera")
    _keys(camera, {"positionMm", "targetMm", "up", "fovDeg", "aspect"}, required={"positionMm", "targetMm", "up", "fovDeg", "aspect"}, name="camera")
    camera_normalized = {
        "positionMm": _vector(camera["positionMm"], "camera.positionMm", ("x", "y", "z")),
        "targetMm": _vector(camera["targetMm"], "camera.targetMm", ("x", "y", "z")),
        "up": _vector(camera["up"], "camera.up", ("x", "y", "z")),
        "fovDeg": _number(camera["fovDeg"], "camera.fovDeg", minimum=1, maximum=179),
        "aspect": _number(camera["aspect"], "camera.aspect", minimum=0.01, maximum=100),
    }

    host = _object(request["hostMaterial"], "hostMaterial")
    _keys(host, {"id", "ior", "absorptionPerMm", "roughness"}, required={"id", "ior", "absorptionPerMm", "roughness"}, name="hostMaterial")
    host_normalized = {
        "id": _string(host["id"], "hostMaterial.id"),
        "ior": _number(host["ior"], "hostMaterial.ior", minimum=1.000001, maximum=4),
        "absorptionPerMm": _rgb(host["absorptionPerMm"], "hostMaterial.absorptionPerMm", maximum=100),
        "roughness": _number(host["roughness"], "hostMaterial.roughness", minimum=0, maximum=1),
    }

    light = _object(request["light"], "light")
    _keys(light, {"directionPropagation", "radiance", "angularDiameterDeg"}, required={"directionPropagation", "radiance", "angularDiameterDeg"}, name="light")
    direction = _vector(light["directionPropagation"], "light.directionPropagation", ("x", "y", "z"))
    if math.sqrt(sum(component * component for component in direction.values())) < 1e-9:
        raise BridgeError("invalid_request", "light.directionPropagation must be non-zero")
    light_normalized = {
        "directionPropagation": direction,
        "radiance": _rgb(light["radiance"], "light.radiance", maximum=100_000),
        "angularDiameterDeg": _number(light["angularDiameterDeg"], "light.angularDiameterDeg", minimum=0, maximum=180),
    }

    receiver = _object(request["receiver"], "receiver")
    _keys(receiver, {"positionMm", "normal", "extentMm", "reflectance"}, required={"positionMm", "normal", "extentMm", "reflectance"}, name="receiver")
    normal = _vector(receiver["normal"], "receiver.normal", ("x", "y", "z"))
    normal_length = math.sqrt(sum(component * component for component in normal.values()))
    if not 0.999 <= normal_length <= 1.001:
        raise BridgeError("invalid_request", "receiver.normal must be normalized")
    extent = _object(receiver["extentMm"], "receiver.extentMm")
    _keys(extent, {"x", "z"}, required={"x", "z"}, name="receiver.extentMm")
    receiver_normalized = {
        "positionMm": _vector(receiver["positionMm"], "receiver.positionMm", ("x", "y", "z")),
        "normal": normal,
        "extentMm": {
            "x": _number(extent["x"], "receiver.extentMm.x", minimum=1e-3, maximum=10_000),
            "z": _number(extent["z"], "receiver.extentMm.z", minimum=1e-3, maximum=10_000),
        },
        "reflectance": _number(receiver["reflectance"], "receiver.reflectance", minimum=0, maximum=1),
    }

    environment = _object(request["environment"], "environment")
    _keys(environment, {"radiance"}, required={"radiance"}, name="environment")
    environment_normalized = {"radiance": _rgb(environment["radiance"], "environment.radiance", maximum=100_000)}

    render_purpose = request["renderPurpose"]
    if render_purpose not in {"body", "receiver"}:
        raise BridgeError("invalid_request", "renderPurpose must be body or receiver")
    compute = _object(request["compute"], "compute")
    _keys(compute, {"device"}, required={"device"}, name="compute")
    device = compute["device"]
    if device not in {"cuda", "cpu"}:
        raise BridgeError("invalid_request", "compute.device must be cuda or cpu")
    spp = _integer(request["spp"], "spp", minimum=1, maximum=MAX_SPP)
    resolution = _object(request["resolution"], "resolution")
    _keys(resolution, {"width", "height"}, required={"width", "height"}, name="resolution")
    width = _integer(resolution["width"], "resolution.width", minimum=1, maximum=MAX_RESOLUTION)
    height = _integer(resolution["height"], "resolution.height", minimum=1, maximum=MAX_RESOLUTION)

    mesh = _mesh(request["canonicalMesh"])
    if provenance["fingerprint"] == "0" * 64:
        raise BridgeError("invalid_request", "provenance.fingerprint must identify the caller snapshot")

    return {
        "requestId": request_id,
        "operation": OPERATION,
        "case": {"id": case_id, "label": label},
        "provenance": {
            "repository": repository,
            "sourceCommit": source_commit,
            "sourceRef": source_ref,
            "shapeSource": shape_source,
            "fingerprint": fingerprint,
        },
        "canonicalMesh": mesh,
        "physicalScale": {"mmPerShapeUnit": mm_per_unit, "source": scale_source},
        "camera": camera_normalized,
        "hostMaterial": host_normalized,
        "light": light_normalized,
        "receiver": receiver_normalized,
        "environment": environment_normalized,
        "renderPurpose": render_purpose,
        "compute": {"device": device},
        "spp": spp,
        "resolution": {"width": width, "height": height},
    }


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def provenance_hash(request: Mapping[str, Any]) -> str:
    payload = {
        "operation": request["operation"],
        "case": request["case"],
        "provenance": request["provenance"],
        "canonicalMeshSha256": request["canonicalMesh"]["sha256"],
        "physicalScale": request["physicalScale"],
        "camera": request["camera"],
        "hostMaterial": request["hostMaterial"],
        "light": request["light"],
        "receiver": request["receiver"],
        "environment": request["environment"],
        "renderPurpose": request["renderPurpose"],
        "compute": request["compute"],
        "spp": request["spp"],
        "resolution": request["resolution"],
    }
    return hashlib.sha256(canonical_json(payload)).hexdigest()


def artifact_hash(data: bytes) -> str:
    if len(data) > MAX_ARTIFACT_BYTES:
        raise BridgeError("artifact_too_large", "render artifact exceeds the bridge limit", 500)
    return hashlib.sha256(data).hexdigest()


def origin_allowed(origin: str | None) -> bool:
    if origin is None or origin == "":
        return True
    if origin in ALLOWED_ORIGINS:
        return True
    # Do not accept arbitrary local ports: the allowlist is intentionally
    # limited to the known Vite dev/preview origins above.
    parsed = urlsplit(origin)
    return False if parsed.hostname in {"localhost", "127.0.0.1", "::1"} else False


def validate_capabilities(value: Any) -> dict[str, Any]:
    capabilities = _object(value, "capabilities")
    required = {
        "schemaVersion", "service", "bindAddress", "port", "mitsuba", "drjit", "pythonVersion",
        "variants", "selectedVariant", "cudaAvailable", "gpu", "workerReady", "supportedOperations", "supportedDevices",
        "optix", "artifactTransport", "cancellation",
    }
    _keys(capabilities, required, required=required, name="capabilities")
    if capabilities["schemaVersion"] != SCHEMA_VERSION or capabilities["service"] != SERVICE_NAME:
        raise BridgeError("invalid_capabilities", "unsupported capabilities identity")
    if capabilities["bindAddress"] != BIND_ADDRESS or capabilities["port"] != PORT:
        raise BridgeError("invalid_capabilities", "capabilities endpoint is not the fixed loopback bridge")
    if not isinstance(capabilities["variants"], list) or not all(isinstance(v, str) for v in capabilities["variants"]):
        raise BridgeError("invalid_capabilities", "variants must be a string array")
    if not isinstance(capabilities["supportedOperations"], list) or OPERATION not in capabilities["supportedOperations"]:
        raise BridgeError("invalid_capabilities", "fixed render operation is not advertised")
    if capabilities["optix"] != "unknown":
        raise BridgeError("invalid_capabilities", "OptiX may only be reported as unknown by this bridge")
    if not isinstance(capabilities["workerReady"], bool) or not isinstance(capabilities["cudaAvailable"], bool):
        raise BridgeError("invalid_capabilities", "workerReady and cudaAvailable must be booleans")
    return capabilities
