from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from tools.skin_path_roundtrip.cli import main
from tools.skin_path_roundtrip.core import read_json, stable_hash, write_json


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


class CliRoundtripTests(unittest.TestCase):
    def test_t13_inspect_build_verify_resume_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            shutil.copy2(FIXTURES / "baseline.json", root / "baseline.json")
            shutil.copy2(FIXTURES / "edit_moved.json", root / "edit.json")
            write_json(root / "roots.json", {"schema_version": "1.0", "mappings": []})
            write_json(
                root / "manifest.json",
                {
                    "schema_version": "1.0",
                    "candidate_id": "FIXTURE_EDIT",
                    "baseline_id": "FIXTURE_BASE",
                    "source_revision": "fixture",
                    "object_selection": {"name": "PATHS", "type": "MESH", "faces": 0},
                    "inputs": [
                        {"name": "baseline", "path": "baseline.json", "role": "BASELINE", "authority": "HISTORICAL_REGRESSION"},
                        {"name": "edit_blend", "path": "edit.json", "role": "AUTHOR_EDIT", "authority": "REVIEW_CANDIDATE"},
                    ],
                    "support_ledger": {"anchors": [{"id": "SUP-1", "member_id": "B1"}]},
                },
            )
            run = root / "run"
            self.assertEqual(main(["inspect", "--manifest", str(root / "manifest.json"), "--roots", str(root / "roots.json"), "--out", str(run)]), 0)
            delta = read_json(run / "DELTA.json")
            selected = [item["operation_id"] for item in delta["operations"] if item["scope"] == "B1"]
            write_json(run / "resolution.json", {"schema_version": "1.0", "delta_sha256": stable_hash(delta), "input_lock_sha256": read_json(run / "INPUT_LOCK.json")["lock_sha256"], "selected_operation_ids": selected})
            self.assertEqual(main(["build-review", "--run", str(run), "--resolution", str(run / "resolution.json")]), 0)
            self.assertEqual(main(["verify", "--run", str(run)]), 0)
            self.assertEqual(main(["resume", "--run", str(run)]), 0)
            self.assertEqual(read_json(run / "VERIFY.json")["status"], "PASS")
            self.assertTrue(read_json(run / "RESUME.json")["read_only"])

    def test_t14_declared_hash_mismatch_blocks_before_extract(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "source.json").write_text("{}", encoding="utf-8")
            write_json(root / "roots.json", {"mappings": []})
            write_json(root / "manifest.json", {"schema_version": "1.0", "inputs": [{"name": "baseline", "path": "source.json", "sha256": "0" * 64}]})
            self.assertEqual(main(["inspect", "--manifest", str(root / "manifest.json"), "--roots", str(root / "roots.json"), "--out", str(root / "run")]), 2)
            self.assertEqual(read_json(root / "run" / "INPUT_LOCK.json")["status"], "BLOCKED")

    def test_t15_ambiguous_run_cannot_build_review(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            baseline = json.loads((FIXTURES / "baseline.json").read_text(encoding="utf-8"))
            edit = json.loads((FIXTURES / "baseline.json").read_text(encoding="utf-8"))
            edit["objects"][0]["vertices"][1]["attributes"]["source_vertex_index"] = 1
            write_json(root / "baseline.json", baseline)
            write_json(root / "edit.json", edit)
            write_json(root / "roots.json", {"mappings": []})
            write_json(root / "manifest.json", {"schema_version": "1.0", "object_selection": {"name": "PATHS"}, "inputs": [{"name": "baseline", "path": "baseline.json"}, {"name": "edit_blend", "path": "edit.json"}]})
            run = root / "run"
            self.assertEqual(main(["inspect", "--manifest", str(root / "manifest.json"), "--roots", str(root / "roots.json"), "--out", str(run)]), 0)
            delta = read_json(run / "DELTA.json")
            write_json(run / "resolution.json", {"schema_version": "1.0", "delta_sha256": stable_hash(delta), "input_lock_sha256": read_json(run / "INPUT_LOCK.json")["lock_sha256"], "selected_operation_ids": []})
            self.assertEqual(main(["build-review", "--run", str(run), "--resolution", str(run / "resolution.json")]), 2)

    def test_t16_absolute_old_prefix_requires_declared_mapping(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_json(root / "roots.json", {"mappings": []})
            write_json(root / "manifest.json", {"schema_version": "1.0", "inputs": [{"name": "baseline", "path": r"J:\\old\\source.json"}]})
            lock = read_json(root / "manifest.json")
            from tools.skin_path_roundtrip.core import build_input_lock

            result = build_input_lock(lock, read_json(root / "roots.json"), root)
            self.assertEqual(result["status"], "BLOCKED")

    def test_t17_resolution_rejects_unselected_unknown_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            shutil.copy2(FIXTURES / "baseline.json", root / "baseline.json")
            shutil.copy2(FIXTURES / "edit_moved.json", root / "edit.json")
            write_json(root / "roots.json", {"mappings": []})
            write_json(root / "manifest.json", {"schema_version": "1.0", "object_selection": {"name": "PATHS"}, "inputs": [{"name": "baseline", "path": "baseline.json"}, {"name": "edit_blend", "path": "edit.json"}]})
            run = root / "run"
            self.assertEqual(main(["inspect", "--manifest", str(root / "manifest.json"), "--roots", str(root / "roots.json"), "--out", str(run)]), 0)
            delta = read_json(run / "DELTA.json")
            resolution = {"schema_version": "1.0", "delta_sha256": stable_hash(delta), "input_lock_sha256": read_json(run / "INPUT_LOCK.json")["lock_sha256"], "selected_operation_ids": ["not-real"]}
            write_json(run / "resolution.json", resolution)
            self.assertEqual(main(["build-review", "--run", str(run), "--resolution", str(run / "resolution.json")]), 2)


if __name__ == "__main__":
    unittest.main()
