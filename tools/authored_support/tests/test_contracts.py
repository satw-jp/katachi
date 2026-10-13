from __future__ import annotations

import json
import hashlib
import os
import tempfile
import unittest
from pathlib import Path

from tools.authored_support.cli import _build
from tools.authored_support.compare import compare_support
from tools.authored_support.contracts import ContractError
from tools.authored_support.planner import unresolved_generation_stages
from tools.authored_support.mesh_backend import ManifoldKernel
from tools.authored_support.rules.finalize import finalize_a_support
from tools.authored_support.rules.lower_support import generate_lower_support
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
                {"logical_name": "asset", "root": "source", "path": "asset.txt", "sha256": hashlib.sha256(b"fixed").hexdigest()},
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
    def test_unregistered_full_pipeline_remains_hold(self) -> None:
        source_map_path = (
            Path(__file__).resolve().parents[1]
            / "presets"
            / "minia_legacy_v1"
            / "SOURCE_RULE_MAP.json"
        )
        source_map = json.loads(source_map_path.read_text(encoding="utf-8"))
        from unittest.mock import patch
        with patch('tools.authored_support.planner.registered_pipeline', return_value=None):
            holds = unresolved_generation_stages(source_map)
        self.assertEqual(len(holds), 1)
        self.assertEqual(holds[-1].code, "GENERATOR_CALLABLE_MISSING")

    def test_finalizer_applies_x03795_only_when_expected_before_matches(self) -> None:
        support = {
            "objects": [
                {"id": "X03795", "kind": "UPPER_BRANCH_BRACE", "target": "T01268", "anchor": "S002579"},
                {
                    "id": "N00001",
                    "kind": "BODY_TO_BODY_TEMPORARY",
                    "target": "FLOWER_1",
                    "anchor": "PERM_1",
                    "anchor_status": "old-rooted",
                },
            ],
            "deleted": [],
            "custom_metadata": {"preserve": True},
        }
        override = {
            "case_id": "MINI_A_AUTHORED_SUPPORT_LEGACY_V1",
            "operations": [
                {
                    "operation": "remove_support_record",
                    "id": "X03795",
                    "expected_before": {"kind": "UPPER_BRANCH_BRACE", "target": "T01268", "anchor": "S002579"},
                    "reason": "fixture-specific obsolete leaf",
                }
            ],
        }
        result = finalize_a_support(
            support,
            case_id="MINI_A_AUTHORED_SUPPORT_LEGACY_V1",
            flower_ids={"FLOWER_1"},
            permanent_ids={"PERM_1"},
            override_document=override,
        )
        final = result["support_geometry"]
        self.assertEqual([item["id"] for item in final["objects"]], ["N00001"])
        self.assertEqual(final["objects"][0]["historical_anchor_status"], "old-rooted")
        self.assertIn("current_chronology", final["objects"][0])
        self.assertTrue(final["custom_metadata"]["preserve"])
        self.assertTrue(result["reference_validation"]["valid"])
        self.assertEqual(support["objects"][0]["id"], "X03795")

    def test_finalizer_holds_on_wrong_expected_before(self) -> None:
        support = {"objects": [{"id": "X03795", "kind": "UPPER_BRANCH_BRACE", "target": "OTHER", "anchor": "S002579"}]}
        override = {
            "case_id": "MINI_A_AUTHORED_SUPPORT_LEGACY_V1",
            "operations": [
                {
                    "operation": "remove_support_record",
                    "id": "X03795",
                    "expected_before": {"kind": "UPPER_BRANCH_BRACE", "target": "T01268", "anchor": "S002579"},
                    "reason": "fixture-specific obsolete leaf",
                }
            ],
        }
        with self.assertRaises(ContractError):
            finalize_a_support(
                support,
                case_id="MINI_A_AUTHORED_SUPPORT_LEGACY_V1",
                flower_ids=set(),
                permanent_ids=set(),
                override_document=override,
            )
        self.assertEqual(support["objects"][0]["target"], "OTHER")

    def test_finalizer_rejects_override_bound_to_another_case(self) -> None:
        support = {"objects": [{"id": "X03795", "kind": "UPPER_BRANCH_BRACE", "target": "T01268", "anchor": "S002579"}]}
        override = {
            "case_id": "ANOTHER_CASE",
            "operations": [
                {
                    "operation": "remove_support_record",
                    "id": "X03795",
                    "expected_before": {"kind": "UPPER_BRANCH_BRACE", "target": "T01268", "anchor": "S002579"},
                    "reason": "fixture-specific obsolete leaf",
                }
            ],
        }
        with self.assertRaises(ContractError):
            finalize_a_support(
                support,
                case_id="MINI_A_AUTHORED_SUPPORT_LEGACY_V1",
                flower_ids=set(),
                permanent_ids=set(),
                override_document=override,
            )
        self.assertEqual(support["objects"][0]["id"], "X03795")

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


class LowerSupportFixtureTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("AUTHORED_SUPPORT_GEOMETRY_RUNTIME"), "optional pinned geometry runtime is not configured")
    def test_one_lower_contact_is_generated_and_materialized(self) -> None:
        runtime = Path(os.environ["AUTHORED_SUPPORT_GEOMETRY_RUNTIME"])
        kernel = ManifoldKernel.from_runtime_root(runtime)
        np = kernel.np
        box = kernel.trimesh.creation.box(extents=(2, 2, 2))
        face_index = int(np.argmin(box.triangles_center[:, 2]))
        bottom_face = box.faces[face_index].copy()
        if box.face_normals[face_index, 2] > 0:
            bottom_face[[1, 2]] = bottom_face[[2, 1]]
        faces = np.vstack([bottom_face, np.delete(box.faces, face_index, axis=0)])
        flower = {
            "id": "FLOWER_FIXTURE",
            "bbox_mm": [[-1, -1, 9], [1, 1, 11]],
            "orientation_matrix": np.eye(3),
            "physical_scale": 1.0,
            "position_mm": [0.0, 0.0, 10.0],
        }
        with temporary_directory() as tmp:
            arguments = {
                "flower_surface": [flower],
                "flower_template": {"vertices": box.vertices, "faces": faces},
                "permanent_groups": [],
                "upstream_support": [],
                "mesh_loader": lambda _path: {},
                "kernel": kernel,
                "output_mesh_root": Path(tmp) / "support_mesh",
            }
            result = generate_lower_support(**arguments)
            self.assertEqual(result["new_contact_count"], 1)
            self.assertEqual(result["added"][0]["target"], "FLOWER_FIXTURE")
            mesh_path = Path(tmp) / "support_mesh" / "P10_LOW_0000.npz"
            self.assertTrue(mesh_path.is_file())
            self.assertEqual(len(result["mesh_array_identities"]["P10_LOW_0000"]["vertices_sha256"]), 64)
            with self.assertRaises(ContractError):
                generate_lower_support(**arguments)


if __name__ == "__main__":
    unittest.main()

