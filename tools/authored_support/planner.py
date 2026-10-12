from __future__ import annotations

from typing import Any

from .contracts import Hold


def unresolved_generation_stages(source_map: dict[str, Any]) -> list[Hold]:
    holds: list[Hold] = []
    stages = source_map.get("generation_stages")
    if stages is None:
        stages = source_map.get("observed_lineage", [])
    for stage in stages:
        implementation_status = stage.get("implementation_status")
        integration_status = stage.get("integration_status", "integrated")
        if implementation_status != "implemented":
            code = "GENERATION_STAGE_NOT_IMPLEMENTED"
        elif integration_status != "integrated":
            code = "GENERATION_STAGE_NOT_INTEGRATED"
        else:
            continue
        if code:
            holds.append(
                Hold(
                    code=code,
                    message=(
                        "The source rule is mapped, but it is not yet part of a complete "
                        "fixed-case generation pipeline."
                    ),
                    subject=str(stage.get("stage_id", "unknown")),
                )
            )
    if not callable(source_map.get("generator_callable")):
        holds.append(
            Hold(
                code="GENERATOR_CALLABLE_MISSING",
                message="No complete fixed-case plan-generation callable is registered.",
            )
        )
    return holds


def generate_plan(
    case: dict[str, Any], recipe: dict[str, Any], source_map: dict[str, Any]
) -> tuple[dict[str, Any] | None, list[Hold]]:
    """Run only a complete registered pipeline; fail closed while any stage is absent."""
    holds = unresolved_generation_stages(source_map)
    if holds:
        return None, holds
    # All current stages are deliberately marked unresolved. Adding a stage is
    # not enough by itself: it must register one callable and its input/output contract.
    generator = source_map.get("generator_callable")
    if not callable(generator):
        return None, [
            Hold(
                "GENERATOR_CALLABLE_MISSING",
                "No complete generation callable is registered.",
            )
        ]
    return generator(case=case, recipe=recipe), []
