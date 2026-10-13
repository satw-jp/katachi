from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .contracts import Hold


StageCallable = Callable[..., dict[str, Any]]


@dataclass(frozen=True)
class StageRegistration:
    stage_id: str
    case_id: str
    implementation_module: str
    source_code: tuple[tuple[str, str], ...]
    callable: StageCallable


def _v4_d2_registration() -> StageRegistration:
    from .stages.v4_d2 import LEGACY_SOURCE_CODE_SHA256, generate_v4_d2

    return StageRegistration(
        stage_id="V4_D2_SUPPORT_GENERATION",
        case_id="MINI_A_AUTHORED_SUPPORT_LEGACY_V1",
        implementation_module="tools.authored_support.stages.v4_d2.generate_v4_d2",
        source_code=tuple(sorted(LEGACY_SOURCE_CODE_SHA256.items())),
        callable=generate_v4_d2,
    )


def registered_stages() -> dict[str, StageRegistration]:
    """Return executable stages registered in Python; source-map JSON is data only."""
    registration = _v4_d2_registration()
    return {registration.stage_id: registration}


def resolve_stage(
    stage_id: str,
    *,
    case: dict[str, Any],
    recipe: dict[str, Any],
    source_map: dict[str, Any],
) -> tuple[StageCallable | None, list[Hold]]:
    registration = registered_stages().get(stage_id)
    if registration is None:
        return None, [Hold("GENERATION_STAGE_NOT_REGISTERED", "No Python stage callable is registered.", stage_id)]
    if case.get("case_id") != registration.case_id or recipe.get("case_id") != registration.case_id:
        return None, [Hold("GENERATION_STAGE_CASE_MISMATCH", "The registered stage is bound to a different fixed case.", stage_id)]
    if source_map.get("case_id") != registration.case_id:
        return None, [Hold("GENERATION_STAGE_SOURCE_MAP_CASE_MISMATCH", "The fixed source map is bound to a different case.", stage_id)]
    if stage_id not in recipe.get("stage_order", []):
        return None, [Hold("GENERATION_STAGE_RECIPE_MISMATCH", "The fixed recipe does not include this stage.", stage_id)]
    binding = recipe.get("stage_bindings", {}).get(stage_id)
    expected_binding = {
        "implementation_module": registration.implementation_module,
        "source_code_sha256": dict(registration.source_code),
    }
    if binding != expected_binding:
        return None, [Hold("GENERATION_STAGE_RECIPE_BINDING_MISMATCH", "The fixed recipe is not explicitly bound to this Python stage and its legacy source hashes.", stage_id)]
    mapped = next(
        (row for row in source_map.get("observed_lineage", []) if row.get("stage_id") == stage_id),
        None,
    )
    if mapped is None:
        return None, [Hold("GENERATION_STAGE_SOURCE_MAP_MISSING", "The fixed source map does not describe this stage.", stage_id)]
    mapped_sources = tuple(
        sorted((str(item.get("path")), str(item.get("sha256", "")).lower()) for item in mapped.get("source_code", []))
    )
    if mapped_sources != registration.source_code:
        return None, [Hold("GENERATION_STAGE_SOURCE_BINDING_MISMATCH", "The source map does not match the Python registration's pinned legacy sources.", stage_id)]
    if mapped.get("implementation_module") != registration.implementation_module:
        return None, [Hold("GENERATION_STAGE_IMPLEMENTATION_BINDING_MISMATCH", "The source map does not identify the registered Python implementation.", stage_id)]
    if mapped.get("implementation_status") != "implemented":
        return None, [Hold("GENERATION_STAGE_NOT_IMPLEMENTED", "The source map does not record the implemented stage.", stage_id)]
    if mapped.get("integration_status") != "bounded_stage_registry":
        return None, [Hold("GENERATION_STAGE_REGISTRY_STATUS_MISMATCH", "The stage is not declared as bounded to the Python stage registry.", stage_id)]
    return registration.callable, []


def registered_pipeline(_case_id: str) -> StageCallable | None:
    """No complete MINI_A pipeline is registered yet."""
    return None

