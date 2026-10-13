from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.authored_support.cli import _run_v4_d2
from tools.authored_support.contracts import ContractError
from tools.authored_support.planner import unresolved_generation_stages
from tools.authored_support.stage_registry import registered_stages, resolve_stage


PACKAGE_ROOT = Path(__file__).resolve().parents[3]
PRESET = PACKAGE_ROOT / "tools/authored_support/presets/minia_legacy_v1"


def contracts() -> tuple[dict, dict, dict]:
    case = json.loads((PRESET / "CASE.json").read_text(encoding="utf-8"))
    recipe = json.loads((PRESET / "RECIPE.json").read_text(encoding="utf-8"))
    source_map = json.loads((PRESET / "SOURCE_RULE_MAP.json").read_text(encoding="utf-8"))
    return case, recipe, source_map


class V4D2RegistryTests(unittest.TestCase):
    def test_python_registry_binds_case_recipe_and_source_map(self) -> None:
        case, recipe, source_map = contracts()
        callable_stage, holds = resolve_stage(
            "V4_D2_SUPPORT_GENERATION", case=case, recipe=recipe, source_map=source_map
        )
        self.assertFalse(holds)
        self.assertTrue(callable(callable_stage))
        self.assertEqual(list(registered_stages()), ["V4_D2_SUPPORT_GENERATION"])

    def test_json_generator_callable_is_never_evaluated(self) -> None:
        case, recipe, source_map = contracts()
        source_map["generator_callable"] = "os.remove"
        callable_stage, holds = resolve_stage(
            "V4_D2_SUPPORT_GENERATION", case=case, recipe=recipe, source_map=source_map
        )
        self.assertFalse(holds)
        self.assertTrue(callable(callable_stage))
        self.assertTrue(any(item.code == "GENERATOR_CALLABLE_MISSING" for item in unresolved_generation_stages(source_map)))

    def test_source_hash_mismatch_holds_stage_dispatch(self) -> None:
        case, recipe, source_map = contracts()
        stage = next(row for row in source_map["observed_lineage"] if row["stage_id"] == "V4_D2_SUPPORT_GENERATION")
        stage["source_code"][0]["sha256"] = "0" * 64
        callable_stage, holds = resolve_stage(
            "V4_D2_SUPPORT_GENERATION", case=case, recipe=recipe, source_map=source_map
        )
        self.assertIsNone(callable_stage)
        self.assertEqual(holds[0].code, "GENERATION_STAGE_SOURCE_BINDING_MISMATCH")

    def test_cli_refuses_an_output_path_inside_frozen_inputs(self) -> None:
        case_path = PRESET / "CASE.json"
        with tempfile.TemporaryDirectory(dir=PACKAGE_ROOT / "work") as tmp:
            frozen_root = Path(tmp) / "frozen"
            requested_output = frozen_root / "must-not-be-created"
            roots_path = Path(tmp) / "ROOTS.json"
            roots_path.write_text(json.dumps({"roots": {"outputs": str(frozen_root)}}), encoding="utf-8")
            with self.assertRaises(ContractError):
                _run_v4_d2(case_path, roots_path, requested_output)
            self.assertFalse(requested_output.exists())

    def test_registry_imports_in_a_fresh_process(self) -> None:
        code = (
            "from tools.authored_support.stage_registry import registered_stages; "
            "r=registered_stages(); "
            "assert list(r)==['V4_D2_SUPPORT_GENERATION']; "
            "print(r['V4_D2_SUPPORT_GENERATION'].implementation_module)"
        )
        env = os.environ.copy()
        env["PYTHONPATH"] = str(PACKAGE_ROOT) + os.pathsep + env.get("PYTHONPATH", "")
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=PACKAGE_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("tools.authored_support.stages.v4_d2.generate_v4_d2", result.stdout)


if __name__ == "__main__":
    unittest.main()

