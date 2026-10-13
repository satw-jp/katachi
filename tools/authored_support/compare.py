from __future__ import annotations

from typing import Any


# Only execution-location metadata is excluded. Unknown/support geometry fields
# remain part of the comparison and therefore cannot be silently normalized away.
_VOLATILE_KEYS = {"mesh_source", "output_path", "generated_at", "mtime_ns"}


def semantic_view(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: semantic_view(item)
            for key, item in value.items()
            if key not in _VOLATILE_KEYS
        }
    if isinstance(value, list):
        return [semantic_view(item) for item in value]
    return value


def compare_support(actual: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    actual_view = semantic_view(actual)
    expected_view = semantic_view(expected)
    a_objects = actual_view.get("objects") if isinstance(actual_view, dict) else None
    e_objects = expected_view.get("objects") if isinstance(expected_view, dict) else None
    if not isinstance(a_objects, list) or not isinstance(e_objects, list):
        return {
            "status": "HOLD",
            "reason": "SUPPORT_OBJECTS_ARRAY_MISSING",
            "plan_equal": False,
            "actual_count": len(a_objects) if isinstance(a_objects, list) else None,
            "expected_count": len(e_objects) if isinstance(e_objects, list) else None,
            "mismatches": [],
        }
    a_by_id = {item.get("id"): item for item in a_objects if isinstance(item, dict)}
    e_by_id = {item.get("id"): item for item in e_objects if isinstance(item, dict)}
    duplicate_a = len(a_by_id) != len(a_objects)
    duplicate_e = len(e_by_id) != len(e_objects)
    added = sorted(str(key) for key in a_by_id.keys() - e_by_id.keys())
    removed = sorted(str(key) for key in e_by_id.keys() - a_by_id.keys())
    mismatches = [
        key
        for key in sorted(a_by_id.keys() & e_by_id.keys(), key=str)
        if a_by_id[key] != e_by_id[key]
    ]
    actual_metadata = {key: value for key, value in actual_view.items() if key != "objects"}
    expected_metadata = {key: value for key, value in expected_view.items() if key != "objects"}
    metadata_equal = actual_metadata == expected_metadata
    order_equal = [r.get("id") for r in a_objects] == [r.get("id") for r in e_objects]
    equal = (
        not duplicate_a
        and not duplicate_e
        and not added
        and not removed
        and not mismatches
        and metadata_equal
        and order_equal
    )
    return {
        "status": "PASS" if equal else "HOLD",
        "reason": None if equal else "PLAN_MISMATCH",
        "plan_equal": equal,
        "actual_count": len(a_objects),
        "expected_count": len(e_objects),
        "duplicate_ids": {"actual": duplicate_a, "expected": duplicate_e},
        "added_ids": added,
        "removed_ids": removed,
        "mismatched_ids": mismatches,
        "metadata_equal": metadata_equal,
        "order_equal": order_equal,
    }
