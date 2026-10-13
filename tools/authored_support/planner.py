from __future__ import annotations

from typing import Any

from .contracts import Hold
from .stage_registry import registered_pipeline, registered_stages


def unresolved_generation_stages(source_map: dict[str, Any]) -> list[Hold]:
    """Report complete-pipeline gaps using Python registrations, never JSON callables."""
    holds: list[Hold] = []
    registrations = registered_stages()
    stages = source_map.get("generation_stages")
    if stages is None:
        stages = source_map.get("observed_lineage", [])
    for stage in stages:
        stage_id = str(stage.get("stage_id", "unknown"))
        implementation_status = stage.get("implementation_status")
        registration = registrations.get(stage_id)
        integration_status = stage.get("integration_status", "integrated")
        if implementation_status != "implemented":
            holds.append(
                Hold(
                    code="GENERATION_STAGE_NOT_IMPLEMENTED",
                    message="The source rule has no matching implemented Python stage registration.",
                    subject=stage_id,
                )
            )
        elif integration_status != "integrated":
            holds.append(
                Hold(
                    code="GENERATION_STAGE_NOT_INTEGRATED",
                    message="The registered source stage is not integrated into the complete fixed-case pipeline.",
                    subject=stage_id,
                )
            )
        elif registration is None:
            holds.append(
                Hold(
                    code="GENERATION_STAGE_NOT_REGISTERED",
                    message="The source map declares this stage integrated, but no Python stage callable is registered.",
                    subject=stage_id,
                )
            )
        elif stage.get("implementation_module") != registration.implementation_module:
            holds.append(
                Hold(
                    code="GENERATION_STAGE_IMPLEMENTATION_BINDING_MISMATCH",
                    message="The source map and Python stage registration identify different implementations.",
                    subject=stage_id,
                )
            )
    if registered_pipeline(str(source_map.get("case_id", ""))) is None:
        holds.append(
            Hold(
                code="GENERATOR_CALLABLE_MISSING",
                message="No complete fixed-case plan-generation callable is registered in Python.",
            )
        )
    return holds


def generate_plan(
    case: dict[str, Any], recipe: dict[str, Any], source_map: dict[str, Any]
) -> tuple[dict[str, Any] | None, list[Hold]]:
    """Run only a complete registered pipeline; bounded stages do not open this gate."""
    holds = unresolved_generation_stages(source_map)
    if holds:
        return None, holds
    generator = registered_pipeline(str(case.get("case_id", "")))
    if generator is None:
        return None, [
            Hold(
                "GENERATOR_CALLABLE_MISSING",
                "No complete fixed-case plan-generation callable is registered in Python.",
            )
        ]
    return generator(case=case, recipe=recipe), []

