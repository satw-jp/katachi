from __future__ import annotations

import copy
from typing import Any

from ..contracts import ContractError


_HISTORICAL_KEYS = ("anchor_status", "anchor_evidence", "anchor_rooted_probe_mm")
_CURRENT_CHRONOLOGY = (
    "See current BODY_ANCHOR_HEIGHT_SCREEN; historical V3/V6 rooted claims are not current print evidence"
)


def _remove_expected_record(
    support: dict[str, Any], override: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    operation = override.get("operation")
    if operation != "remove_support_record":
        raise ContractError(f"unsupported override operation: {operation}")
    expected = override.get("expected_before")
    if not isinstance(expected, dict):
        raise ContractError(f"override {override.get('id')} is missing expected_before")
    records = support.get("objects")
    if not isinstance(records, list):
        raise ContractError("support document is missing its objects array")
    matches = [record for record in records if isinstance(record, dict) and record.get("id") == override.get("id")]
    if len(matches) != 1:
        raise ContractError(f"override target count is {len(matches)}, expected exactly one: {override.get('id')}")
    before = matches[0]
    for key, value in expected.items():
        if before.get(key) != value:
            raise ContractError(f"override precondition mismatch for {override.get('id')}.{key}")
    output = copy.deepcopy(support)
    output["objects"] = [record for record in output["objects"] if record.get("id") != override["id"]]
    output.setdefault("deleted", []).append(
        {
            "id": before["id"],
            "target": before.get("target"),
            "anchor": before.get("anchor"),
            "reason": override["reason"],
        }
    )
    return output, {"id": before["id"], "expected_before": expected, "status": "APPLIED"}


def validate_support_references(
    support: dict[str, Any], *, flower_ids: set[str], permanent_ids: set[str]
) -> dict[str, Any]:
    records = support.get("objects")
    if not isinstance(records, list):
        raise ContractError("support document is missing its objects array")
    ids = [record.get("id") for record in records if isinstance(record, dict)]
    duplicates = sorted({str(value) for value in ids if ids.count(value) > 1})
    valid_ids = flower_ids | permanent_ids | set(ids) | {"BED"}
    missing = []
    for record in records:
        if not isinstance(record, dict):
            missing.append({"id": "<non-object>", "role": "record", "value": type(record).__name__})
            continue
        for role in ("target", "anchor"):
            value = record.get(role)
            if isinstance(value, str) and value not in valid_ids:
                missing.append({"id": record.get("id"), "role": role, "value": value})
    return {
        "duplicate_support_ids": duplicates,
        "missing_anchor_or_target_ids": missing,
        "support_count": len(records),
        "valid": not duplicates and not missing,
    }


def finalize_a_support(
    support_document: dict[str, Any],
    *,
    flower_ids: set[str],
    permanent_ids: set[str],
    x03795_override: dict[str, Any],
) -> dict[str, Any]:
    """Pure migration of the MINI_A portion of final_support_data.py."""
    output, applied = _remove_expected_record(support_document, x03795_override)
    for record in output["objects"]:
        if record.get("kind") != "BODY_TO_BODY_TEMPORARY":
            continue
        for key in _HISTORICAL_KEYS:
            if key in record:
                record["historical_" + key] = record.pop(key)
        record["current_chronology"] = _CURRENT_CHRONOLOGY
    validation = validate_support_references(
        output, flower_ids=flower_ids, permanent_ids=permanent_ids
    )
    if not validation["valid"]:
        raise ContractError(f"final Support reference validation failed: {validation}")
    return {
        "support_geometry": output,
        "override_applied": applied,
        "reference_validation": validation,
    }
