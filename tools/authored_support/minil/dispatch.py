"""Case-aware stage dispatch with explicit dependency holds, never eval/import from JSON."""
from dataclasses import dataclass
from typing import Callable

@dataclass(frozen=True)
class Stage:
    id: str
    run: Callable
    needs: tuple[str, ...] = ()

def dispatch(case_id, expected_case_id, stages, context):
    if case_id != expected_case_id:
        raise ValueError("CASE_ID_MISMATCH")
    records = []
    completed = set()
    for stage in stages:
        missing = sorted(set(stage.needs) - completed)
        if missing:
            result = {"status": "HOLD", "code": "STAGE_DEPENDENCY_HOLD", "missing": missing}
        else:
            result = stage.run(context)
        records.append({"stage_id": stage.id, **result})
        if result["status"] == "PASS":
            completed.add(stage.id)
    return records
