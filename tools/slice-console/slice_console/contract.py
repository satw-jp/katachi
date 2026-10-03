"""Versioned, standard-library-only request validation."""

from pathlib import Path
import re

SCHEMA_VERSION = "0.1"
MODES = {"PREFLIGHT", "FULL_SLICE", "PACKAGE_ONLY", "AUDIT_ONLY", "REUSE"}
FIELDS = {
    "PREFLIGHT": ({"job_path"}, set()),
    "FULL_SLICE": ({"job_path"}, set()),
    "PACKAGE_ONLY": (
        {"gcode_path", "context_3mf_path", "output_dir"},
        {"expected_sha256", "expected_bytes", "expected_layers"},
    ),
    "AUDIT_ONLY": ({"artifact_path"}, set()),
    "REUSE": ({"artifact_path"}, set()),
}


def validate_request(request):
    if not isinstance(request, dict):
        return "INVALID_REQUEST", "Request must be a JSON object"
    if set(request) != {"schema_version", "request_id", "mode", "inputs"}:
        return "INVALID_REQUEST", "Required fields: schema_version, request_id, mode, inputs only"
    if request["schema_version"] != SCHEMA_VERSION:
        return "INVALID_REQUEST", "Unsupported Console schema version"
    if not isinstance(request["request_id"], str) or not request["request_id"].strip():
        return "INVALID_REQUEST", "request_id must be a nonempty string"
    mode = request["mode"]
    if not isinstance(mode, str) or mode not in MODES:
        return "UNKNOWN_MODE", "Mode is unsupported; no fallback"
    inputs = request["inputs"]
    required, optional = FIELDS[mode]
    if not isinstance(inputs, dict) or not required <= set(inputs) or set(inputs) - required - optional:
        return "INVALID_REQUEST", "Missing or unsupported mode-specific inputs"
    for name in required:
        value = inputs[name]
        if not isinstance(value, str) or not value.strip() or not Path(value).is_absolute():
            return "INVALID_REQUEST", f"{name} must be an exact absolute path"
    if "expected_sha256" in inputs:
        value = inputs["expected_sha256"]
        if not isinstance(value, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
            return "INVALID_REQUEST", "expected_sha256 must be 64 hexadecimal characters"
    for name in ("expected_bytes", "expected_layers"):
        if name in inputs and (type(inputs[name]) is not int or inputs[name] <= 0):
            return "INVALID_REQUEST", f"{name} must be a positive integer"
    return None, None
