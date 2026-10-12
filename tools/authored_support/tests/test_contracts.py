from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.authored_support.cli import _build
from tools.authored_support.compare import compare_support
from tools.authored_support.contracts import ContractError
from tools.authored_support.planner import unresolved_generation_stages
from tools.authored_support.source_io import check_asset, resolve_asset


def temporary_directory():
    workspace = Path(__file__).resolve().parents[3] / "work" / "authored_support_test_temp"
    workspace.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=workspace)


class SourceInputTests(unittest.TestCase):
    def test_sha_lock_matches_and_mismatch_holds(self) -> None:
        with temporary_directory() as tmp:
            root = Path(tmp)
            item = root / "asset.txt"
            item.write_text("fixed", encoding="utf-8")
            roots = {"roots": {"source": str(root)}}
            good = check_asset(
                {"logical_name": "asset", "root": "source", "path": "asset.txt", "sha256": ""},
                roots,
            )
            bad = check_asset(
                {"logical_name": "asset", "root": "source", "path": "asset.txt", "sha256": "0" * 64},
                roots,
            )
            self.assertEqual(good["status"], "PASS")
            self.assertEqual(bad["reason"], "SOURCE_SHA256_MISMATCH")

    def test_asset_cannot_escape_root(self) -> None:
        with temporary_directory() as tmp:
            with self.assertRaises(ContractError):
                resolve_asset({"root": "source", "path": "../outside"}, {"roots": {"source": tmp}})


class CompareTests(unittest.TestCase):
    def test_only_path_and_run_metadata_are_ignored(self) -> None:
        golden = {"objects": [{"id": "S1", "kind": "shaft", "points_mm": [[0.0, 1.0, 2.0]], "mesh_source": "old.npz"}]}
        actual = {"objects": [{"id": "S1", "kind": "shaft", "points_mm": [[0.0, 1.0, 2.0]], "mesh_source": "new.npz"}]}
        self.assertTrue(compare_support(actual, golden)["plan_equal"])
        actual["objects"][0]["points_mm"][0][2] = 2.000001
        self.assertEqual(compare_support(actual, golden)["mismatched_ids"], ["S1"])

    def test_duplicate_ids_are_not_a_match(self) -> None:
        value = {"objects": [{"id": "S1"}, {"id": "S1"}]}
        result = compare_support(value, value)
        self.assertFalse(result["plan_equal"])
        self.assertTrue(result["duplicate_ids"]["actual"])

    def test_unknown_top_level_metadata_is_part_of_semantic_identity(self) -> None:
        expected = {"objects": [], "future_contract_field": "from-golden"}
        actual = {"objects": [], "future_contract_field": "changed"}
        result = compare_support(actual, expected)
        self.assertFalse(result["plan_equal"])
        self.assertFalse(result["metadata_equal"])


class BuildIsolationTests(unittest.TestCase):
    def test_all_observed_minia_generation_stages_are_holds(self) -> None:
        source_map_path = (
            Path(__file__).resolve().parents[1]
            / "presets"
            / "minia_legacy_v1"
            / "SOURCE_RULE_MAP.json"
        )
        source_map = json.loads(source_map_path.read_text(encoding="utf-8"))
        holds = unresolved_generation_stages(source_map)
        self.assertEqual(len(holds), 9)
        self.assertEqual(holds[0].subject, "V5_BASELINE_SUPPORT")

    def test_build_does_not_need_or_read_golden_and_refuses_ready(self) -> None:
        with temporary_directory() as tmp:
            root = Path(tmp)
            preset = root / "preset"
            preset.mkdir()
            case = {
                "case_id": "fixture",
                "inputs": [],
                "recipe": "RECIPE.json",
                "overrides": "OVERRIDES.json",
            }
            (preset / "CASE.json").write_text(json.dumps(case), encoding="utf-8")
            (preset / "RECIPE.json").write_text("{}", encoding="utf-8")
            (preset / "OVERRIDES.json").write_text('{"operations": []}', encoding="utf-8")
            (preset / "SOURCE_RULE_MAP.json").write_text(
                '{"generation_stages": [{"stage_id": "upstream", "implementation_status": "not_implemented"}]}',
                encoding="utf-8",
            )
            (root / "ROOTS.json").write_text('{"roots": {}}', encoding="utf-8")
            self.assertFalse((preset / "GOLDEN.json").exists())
            out = root / "run"
            code = _build(preset / "CASE.json", root / "ROOTS.json", out)
            self.assertEqual(code, 2)
            record = json.loads((out / "INCOMPLETE.json").read_text(encoding="utf-8"))
            self.assertFalse(record["golden_read"])
            self.assertFalse(record["generated_support_objects"])
            self.assertFalse((out / "support_geometry.json").exists())


if __name__ == "__main__":
    unittest.main()
