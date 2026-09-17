from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from tools.skin_path_roundtrip.core import (
    analyze_diff,
    build_input_lock,
    compute_impact,
    normalize_extract,
    rebuild_changed_extract,
    stable_hash,
    verify_json_rebuild,
    validate_resolution,
)


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def changed_fixture() -> dict:
    value = fixture("baseline.json")
    obj = value["objects"][0]
    obj["vertices"][1]["co"] = [11, 0, 0]
    obj["members"][0]["points_mm"][1] = [11, 0, 0]
    return value


class CoreRoundtripTests(unittest.TestCase):
    def setUp(self) -> None:
        self.baseline = normalize_extract(fixture("baseline.json"), "PATHS")
        self.edited = normalize_extract(fixture("edit_moved.json"), "PATHS")

    def test_t01_noop_is_unchanged(self) -> None:
        delta = analyze_diff(self.baseline, self.baseline, object_name="PATHS")
        self.assertEqual(delta["status"], "PASS")
        self.assertEqual(delta["counts"]["UNCHANGED"], 1)

    def test_t02_one_point_move_is_local(self) -> None:
        delta = analyze_diff(self.baseline, self.edited, object_name="PATHS")
        self.assertEqual(delta["status"], "PASS")
        self.assertEqual(delta["counts"]["POINT_MOVED"], 1)
        self.assertEqual(delta["affected_scopes"], ["B1"])

    def test_t03_subdivision_is_not_an_added_branch(self) -> None:
        edited = copy.deepcopy(self.baseline)
        obj = edited["objects"][0]
        obj["vertices"].insert(1, {"id": "v:new", "co": [5, 1, 0], "attributes": {"source_vertex_index": 5}})
        obj["edges"] = [
            {"id": "e:0a", "vertices": [0, 1], "attributes": {"source_branch_id": "B1", "source_branch_index": 1}},
            {"id": "e:0b", "vertices": [1, 2], "attributes": {"source_branch_id": "B1", "source_branch_index": 1}},
            obj["edges"][1],
        ]
        obj["members"][0]["points_mm"] = [[0, 0, 0], [5, 1, 0], [10, 0, 0]]
        delta = analyze_diff(self.baseline, edited, object_name="PATHS")
        self.assertEqual(delta["counts"]["PATH_SUBDIVIDED"], 1)
        self.assertEqual(delta["counts"]["EDGE_ADDED"], 0)

    def test_t04_reroute_is_detected_without_array_identity(self) -> None:
        edited = copy.deepcopy(self.baseline)
        obj = edited["objects"][0]
        obj["vertices"][0], obj["vertices"][1] = obj["vertices"][1], obj["vertices"][0]
        obj["vertices"][0]["co"], obj["vertices"][1]["co"] = [11, 0, 0], [0, 0, 0]
        obj["members"][0]["points_mm"] = [[11, 0, 0], [0, 0, 0]]
        delta = analyze_diff(self.baseline, edited, object_name="PATHS")
        self.assertEqual(delta["counts"]["PATH_REROUTED"], 1)

    def test_t05_branch_add_and_delete_are_separate(self) -> None:
        edited = copy.deepcopy(self.baseline)
        obj = edited["objects"][0]
        obj["members"] = [obj["members"][0], {"id": "B3", "points_mm": [[30, 0, 0], [40, 0, 0]], "branch_index": 3}]
        obj["edges"].append({"id": "e:new", "vertices": [0, 1], "attributes": {"source_branch_id": "B3", "source_branch_index": 3}})
        obj["edges"] = [obj["edges"][0], obj["edges"][2]]
        delta = analyze_diff(self.baseline, edited, object_name="PATHS")
        self.assertEqual(delta["counts"]["EDGE_ADDED"], 1)
        self.assertEqual(delta["counts"]["EDGE_DELETED"], 1)

    def test_t06_subdivision_duplicate_stable_id_is_resolved(self) -> None:
        edited = copy.deepcopy(self.baseline)
        obj = edited["objects"][0]
        obj["vertices"].insert(1, {"id": "v:subdivided", "co": [5, 0, 0], "attributes": {"source_vertex_index": 1, "source_branch_index": 1}})
        obj["edges"] = [
            {"id": "e:0a", "vertices": [0, 1], "attributes": {"source_branch_id": "B1", "source_branch_index": 1}},
            {"id": "e:0b", "vertices": [1, 2], "attributes": {"source_branch_id": "B1", "source_branch_index": 1}},
            {"id": "e:1", "vertices": [3, 4], "attributes": {"source_branch_id": "B2", "source_branch_index": 2}},
        ]
        obj["members"][0]["points_mm"] = [[0, 0, 0], [5, 0, 0], [10, 0, 0]]
        delta = analyze_diff(self.baseline, edited, object_name="PATHS")
        self.assertEqual(delta["status"], "PASS")
        self.assertEqual(delta["counts"]["PATH_SUBDIVIDED"], 1)
        self.assertEqual(delta["counts"]["AMBIGUOUS_MAPPING"], 0)
        self.assertEqual(len(delta["mapping"]["resolved_duplicates"]), 1)
        self.assertEqual(delta["mapping"]["resolved_duplicates"][0]["classification"], "SUBDIVISION_INHERITED_ID")

    def test_t07_genuinely_ambiguous_duplicate_is_fail_closed(self) -> None:
        edited = copy.deepcopy(self.baseline)
        edited["objects"][0]["vertices"][1]["attributes"]["source_vertex_index"] = 1
        delta = analyze_diff(self.baseline, edited, object_name="PATHS")
        self.assertEqual(delta["status"], "AMBIGUOUS")
        self.assertGreaterEqual(delta["counts"]["AMBIGUOUS_MAPPING"], 1)

    def test_t08_face_bearing_input_is_unsupported(self) -> None:
        edited = copy.deepcopy(self.baseline)
        edited["objects"][0]["faces"] = [[0, 1, 2]]
        delta = analyze_diff(self.baseline, edited, object_name="PATHS")
        self.assertEqual(delta["status"], "UNSUPPORTED")
        self.assertEqual(delta["counts"]["UNSUPPORTED_INPUT"], 1)

    def test_t09_support_impact_is_derived_and_non_mutating(self) -> None:
        manifest = {"support_ledger": {"anchors": [{"id": "A1", "member_id": "B1"}]}}
        before = json.dumps(manifest, sort_keys=True)
        delta = analyze_diff(self.baseline, self.edited, object_name="PATHS")
        impact = compute_impact(delta, self.baseline, self.edited, manifest)
        self.assertEqual(impact["support_validity"], "NOT_REVALIDATED")
        self.assertIn("SPATIAL_RECHECK", impact["items"][0]["reasons"])
        self.assertEqual(json.dumps(manifest, sort_keys=True), before)

    def test_t10_rebuild_materializes_only_selected_member(self) -> None:
        delta = analyze_diff(self.baseline, self.edited, object_name="PATHS")
        selected = [item["operation_id"] for item in delta["operations"] if item["scope"] == "B1"]
        rebuilt = rebuild_changed_extract(self.baseline, self.edited, delta, selected)
        check = verify_json_rebuild(self.baseline, self.edited, rebuilt, delta)
        self.assertEqual(check["status"], "PASS")
        self.assertEqual(rebuilt["roundtrip_review"]["changed_members"], ["B1"])
        self.assertEqual(rebuilt["roundtrip_review"]["preserved_members"], ["B2"])

    def test_t11_resolution_rejects_stale_hash(self) -> None:
        delta = analyze_diff(self.baseline, self.edited, object_name="PATHS")
        lock = {"lock_sha256": "lock"}
        resolution = {"schema_version": "1.0", "delta_sha256": "stale", "input_lock_sha256": "lock", "selected_operation_ids": []}
        self.assertTrue(validate_resolution(resolution, delta, lock))

    def test_t12_input_lock_hashes_explicit_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.txt"
            source.write_text("source", encoding="utf-8")
            manifest = {"schema_version": "1.0", "candidate_id": "C", "baseline_id": "B", "inputs": [{"name": "baseline", "path": "source.txt", "role": "BASELINE"}]}
            lock = build_input_lock(manifest, {"mappings": []}, root)
            self.assertEqual(lock["status"], "PASS")
            self.assertEqual(lock["inputs"][0]["actual_sha256"], hashlib.sha256(b"source").hexdigest())

    def test_t13_original_inputs_can_be_normalized_without_writing_them(self) -> None:
        source = fixture("baseline.json")
        normalized = normalize_extract(source, "PATHS")
        self.assertEqual(normalized["objects"][0]["name"], "PATHS")
        self.assertEqual(len(normalized["objects"][0]["members"]), 2)


if __name__ == "__main__":
    unittest.main()
