from __future__ import annotations

import hashlib
import json
import os
import struct
import sys
import tempfile
import textwrap
import time
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from job import load_job, resolve_argv, validate_job  # noqa: E402
from progress import ProgressEstimator, ProgressParser  # noqa: E402
from runner import (  # noqa: E402
    JOB_SCHEMA_VERSION,
    RESULT_SCHEMA_VERSION,
    RUNNER_VERSION,
    SliceRunner,
    windows_creation_flags,
)


class RunnerTests(unittest.TestCase):
    @staticmethod
    def valid_ascii_stl() -> bytes:
        return b"""solid mesh
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 1 0 0
vertex 0 1 0
endloop
endfacet
endsolid mesh
"""

    @staticmethod
    def valid_binary_stl() -> bytes:
        header = bytearray(b"synthetic binary STL".ljust(80, b"\0"))
        header.extend(struct.pack("<I", 1))
        header.extend(struct.pack("<12fH", 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0))
        return bytes(header)

    def make_mesh_job(self, root: Path, mesh_bytes: bytes | None = None) -> Path:
        path = self.make_job(root, duration=0.01)
        job_dir = path.parent
        mesh_path = job_dir / "geometry" / "permanent.stl"
        mesh_path.write_bytes(mesh_bytes if mesh_bytes is not None else self.valid_ascii_stl())
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw["schema_version"] = "0.2"
        raw["input_mode"] = "mesh_import"
        raw["inputs"] = ["./geometry/permanent.stl"]
        raw["mesh"] = {
            "units": "mm",
            "expected_bounds_mm": {"min": [0, 0, 0], "max": [1, 1, 0]},
            "intended_transform": {
                "translation_mm": [0, 0, 0],
                "rotation_deg": [0, 0, 0],
                "scale": [1, 1, 1],
            },
        }
        path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
        lock_path = job_dir / "locks" / "INPUT_LOCKS.json"
        lock_data = json.loads(lock_path.read_text(encoding="utf-8"))
        lock_data["files"].pop("geometry/authored_support.stl", None)
        lock_data["files"]["geometry/permanent.stl"] = hashlib.sha256(mesh_path.read_bytes()).hexdigest()
        lock_path.write_text(json.dumps(lock_data, indent=2), encoding="utf-8")
        return path

    def assert_job_rejected_before_cli(self, path: Path) -> list[tuple[str, dict]]:
        events: list[tuple[str, dict]] = []
        runner = SliceRunner(load_job(path))
        runner.start(lambda event, payload: events.append((event, payload)))
        runner._thread.join(timeout=8)  # type: ignore[union-attr]
        self.assertFalse(runner.running)
        self.assertFalse(any(event == "started" for event, _ in events))
        self.assertFalse((path.parent / "output" / "runs").exists())
        self.assertEqual([event for event, _ in events], ["error"])
        return events

    def make_job(
        self,
        root: Path,
        mode: str = "success",
        duration: float = 0.25,
        windows_execution: str | None = None,
        emit_resolved_settings: bool = False,
        native_mode: str = "valid",
    ) -> Path:
        job_dir = root / "job"
        (job_dir / "geometry").mkdir(parents=True)
        (job_dir / "profiles").mkdir()
        (job_dir / "locks").mkdir()
        (job_dir / "data").mkdir()
        (job_dir / "geometry" / "permanent.stl").write_text("permanent", encoding="utf-8")
        (job_dir / "geometry" / "authored_support.stl").write_text("support", encoding="utf-8")
        for name in ("printer", "process", "filament"):
            (job_dir / "profiles" / f"{name}.json").write_text("{}", encoding="utf-8")

        fake_cli = job_dir / "fake_cli.py"
        fake_cli.write_text(textwrap.dedent(f"""
            import argparse, json, pathlib, sys, time, zipfile
            parser = argparse.ArgumentParser()
            parser.add_argument('--output-dir', required=True)
            parser.add_argument('--mode', default='{mode}')
            parser.add_argument('--duration', type=float, default={duration})
            parser.add_argument('--write-resolved-settings', action='store_true')
            parser.add_argument('--native-mode', default='{native_mode}')
            args = parser.parse_args()
            print(json.dumps({{'progress': 10, 'phase': 'prepare'}}), flush=True)
            time.sleep(args.duration)
            print('slicing 60%', flush=True)
            pathlib.Path(args.output_dir).mkdir(parents=True, exist_ok=True)
            pathlib.Path(args.output_dir, 'sample.gcode').write_bytes(b'G1 X0 Y0\\n')
            if args.native_mode != 'missing':
                native_path = pathlib.Path(args.output_dir, 'native.3mf')
                if args.native_mode == 'corrupt':
                    native_path.write_bytes(b'not a valid zip')
                else:
                    native_gcode = b'G1 X1 Y1\\n' if args.native_mode == 'mismatch' else b'G1 X0 Y0\\n'
                    settings = (
                        b'<config><plate><metadata key="gcode_file" value="Metadata/plate_1.gcode"/>'
                        b'</plate></config>'
                    )
                    if args.native_mode == 'malformed':
                        settings = b'<config><plate>'
                    with zipfile.ZipFile(native_path, 'w', compression=zipfile.ZIP_DEFLATED) as native_zip:
                        native_zip.writestr('3D/3dmodel.model', b'geometry fixture')
                        native_zip.writestr('Metadata/model_settings.config', settings)
                        if args.native_mode != 'missing_gcode':
                            native_zip.writestr('Metadata/plate_1.gcode', native_gcode)
            if args.write_resolved_settings:
                pathlib.Path(args.output_dir, 'resolved_settings.json').write_text(json.dumps({{'source': 'fake_cli'}}), encoding='utf-8')
            if args.mode == 'failure':
                print('failed', file=sys.stderr, flush=True)
                raise SystemExit(7)
            if args.mode == 'long':
                time.sleep(10)
            print('complete 100%', flush=True)
        """), encoding="utf-8")

        locked_files = [
            job_dir / "geometry" / "permanent.stl",
            job_dir / "geometry" / "authored_support.stl",
            job_dir / "profiles" / "printer.json",
            job_dir / "profiles" / "process.json",
            job_dir / "profiles" / "filament.json",
        ]
        lock_entries = {str(path.relative_to(job_dir)).replace(os.sep, "/"): hashlib.sha256(path.read_bytes()).hexdigest() for path in locked_files}
        (job_dir / "locks" / "INPUT_LOCKS.json").write_text(json.dumps({"files": lock_entries}), encoding="utf-8")

        cli = {"version": "test", "cwd": ".", "argv": ["{engine_path}", "-u", str(fake_cli), "--output-dir", "{run_dir}", "--mode", mode, "--duration", str(duration), "--native-mode", native_mode]}
        if windows_execution is not None:
            cli["windows_execution"] = windows_execution
        if emit_resolved_settings:
            cli["argv"].extend(["--write-resolved-settings"])
        job = {
            "job_id": "TEST",
            "candidate": "TEST",
            "schema_version": JOB_SCHEMA_VERSION,
            "engine_path": sys.executable,
            "data_dir": "./data",
            "inputs": ["./geometry/permanent.stl", "./geometry/authored_support.stl"],
            "profiles": {
                "printer": "./profiles/printer.json",
                "process": "./profiles/process.json",
                "filament": "./profiles/filament.json",
            },
            "output_dir": "./output",
            "display": {"printer": "Test", "layer_height": "0.2 mm", "material": "PLA", "temperature": "240 C", "support": "Authored"},
            "history": {"reference_duration_seconds": 2},
            "cli": cli,
        }
        path = job_dir / "SLICE_JOB.json"
        path.write_text(json.dumps(job, indent=2), encoding="utf-8")
        return path

    def run_job(self, path: Path, timeout: float = 8) -> tuple[list[tuple[str, dict]], Path | None]:
        events: list[tuple[str, dict]] = []
        runner = SliceRunner(load_job(path))
        runner.start(lambda event, payload: events.append((event, payload)))
        deadline = time.monotonic() + timeout
        while runner.running and time.monotonic() < deadline:
            time.sleep(0.05)
        self.assertFalse(runner.running, "runner did not finish")
        completes = [payload for event, payload in events if event == "complete"]
        self.assertTrue(completes)
        run_dir = Path(completes[-1]["run_dir"]) if completes[-1].get("run_dir") else None
        return events, run_dir

    def test_validation_and_success_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_job(Path(tmp))
            spec = load_job(path)
            self.assertTrue(all(item.ok for item in validate_job(spec)))
            events, run_dir = self.run_job(path)
            self.assertEqual([payload for event, payload in events if event == "complete"][-1]["status"], "SUCCESS")
            self.assertTrue((run_dir / "stdout.log").is_file())
            self.assertTrue((run_dir / "stderr.log").is_file())
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["status"], "SUCCESS")
            self.assertEqual(manifest["exit_code"], 0)
            self.assertTrue(manifest["execution_success"])
            self.assertNotIn("printable", manifest)
            self.assertEqual(manifest["runner_version"], RUNNER_VERSION)
            self.assertEqual(manifest["schema_version"], RESULT_SCHEMA_VERSION)
            self.assertEqual(manifest["job_schema_version"], JOB_SCHEMA_VERSION)
            self.assertEqual(manifest["cwd"], str(spec.cli and (spec.job_dir / ".").resolve()))
            self.assertEqual(manifest["data_dir"], str(spec.data_dir))
            self.assertEqual(manifest["windows_execution"], "no_window")
            self.assertEqual(manifest["input_locks_path"], str(spec.locks_path))
            self.assertTrue(manifest["input_locks"]["verified"])
            self.assertEqual(len(manifest["resolved_input_identities"]), 2)
            self.assertTrue((run_dir / "RUNNER_EXECUTION_CONTEXT.json").is_file())
            self.assertTrue((run_dir / "INPUT_LOCKS.json").is_file())
            self.assertFalse((run_dir / "resolved_settings.json").exists())
            context = json.loads((run_dir / "RUNNER_EXECUTION_CONTEXT.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["argv"], context["argv"])
            self.assertEqual(context["job_id"], "TEST")
            self.assertEqual(context["output_dir"], str(run_dir))
            self.assertEqual(len(manifest["resolved_profile_identities"]), 3)
            for identity in manifest["resolved_profile_identities"]:
                self.assertIn(identity["key"], {"printer", "process", "filament"})
                self.assertEqual(len(identity["sha256"]), 64)
            self.assertTrue(manifest["outputs"])

    def test_schema_0_1_job_remains_readable_and_executable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_job(Path(tmp), duration=0.01)
            raw = json.loads(path.read_text(encoding="utf-8"))
            raw["schema_version"] = "0.1"
            raw.pop("input_mode", None)
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            spec = load_job(path)
            self.assertEqual(spec.input_mode, "legacy_unspecified")
            self.assertTrue(all(item.ok for item in validate_job(spec)))
            events, run_dir = self.run_job(path)
            self.assertEqual([payload["status"] for event, payload in events if event == "complete"][-1], "SUCCESS")
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["job_schema_version"], "0.1")
            self.assertEqual(manifest["input_mode"], "legacy_unspecified")

    def test_mesh_import_manifest_records_geometry_hash_and_engine_terminal_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_mesh_job(Path(tmp))
            spec = load_job(path)
            validation = validate_job(spec)
            self.assertTrue(all(item.ok for item in validation), validation)
            self.assertEqual(spec.mesh_summary["triangle_count"], 1)
            events, run_dir = self.run_job(path)
            self.assertEqual([item[1]["status"] for item in events if item[0] == "complete"][-1], "SUCCESS")
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            mesh = manifest["mesh_geometry_summary"]
            self.assertEqual(manifest["input_mode"], "mesh_import")
            self.assertIsNone(manifest["provenance"])
            self.assertEqual(mesh["vertex_count"], 3)
            self.assertEqual(mesh["triangle_count"], 1)
            self.assertEqual(mesh["bounds_mm"], {"min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0]})
            self.assertEqual(mesh["sha256"], manifest["resolved_input_identities"][0]["sha256"])
            self.assertTrue(manifest["engine_terminal_result"]["process_started"])
            self.assertEqual(manifest["engine_terminal_result"]["status"], "SUCCESS")
            self.assertEqual(manifest["engine_terminal_result"]["exit_code"], 0)
            self.assertEqual(manifest["plate_recognition"]["plate_recognition"], "PRINTABLE_OBJECT_UNVERIFIED")

    def test_binary_stl_static_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_mesh_job(Path(tmp), self.valid_binary_stl())
            spec = load_job(path)
            self.assertTrue(all(item.ok for item in validate_job(spec)))
            self.assertEqual(spec.mesh_summary["format"], "binary_stl")
            self.assertEqual(spec.mesh_summary["triangle_count"], 1)

    def test_mesh_import_requires_units_bounds_and_transform(self) -> None:
        for invalid_mesh in (
            {"units": "inch", "expected_bounds_mm": {"min": [0, 0, 0], "max": [1, 1, 0]}, "intended_transform": {"translation_mm": [0, 0, 0], "rotation_deg": [0, 0, 0], "scale": [1, 1, 1]}},
            {"units": "mm", "intended_transform": {"translation_mm": [0, 0, 0], "rotation_deg": [0, 0, 0], "scale": [1, 1, 1]}},
            {"units": "mm", "expected_bounds_mm": {"min": [0, 0, 0], "max": [1, 1, 0]}},
        ):
            with self.subTest(mesh=invalid_mesh), tempfile.TemporaryDirectory() as tmp:
                path = self.make_mesh_job(Path(tmp))
                raw = json.loads(path.read_text(encoding="utf-8"))
                raw["mesh"] = invalid_mesh
                path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
                self.assertFalse(next(item for item in validate_job(load_job(path)) if item.key == "input_mode").ok)
                self.assert_job_rejected_before_cli(path)

    def test_mesh_import_rejects_empty_zero_face_corrupt_and_nonfinite_before_engine_launch(self) -> None:
        cases = {
            "empty": b"",
            "zero_faces": b"solid empty\nendsolid empty\n",
            "corrupt": b"not an STL mesh",
            "nonfinite": self.valid_ascii_stl().replace(b"vertex 1 0 0", b"vertex NaN 0 0"),
            "infinite": self.valid_ascii_stl().replace(b"vertex 1 0 0", b"vertex Inf 0 0"),
        }
        for name, contents in cases.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                path = self.make_mesh_job(Path(tmp), contents)
                results = validate_job(load_job(path))
                mode_result = next(item for item in results if item.key == "input_mode")
                self.assertFalse(mode_result.ok)
                self.assert_job_rejected_before_cli(path)

    def test_mesh_import_rejects_hash_mismatch_before_engine_launch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_mesh_job(Path(tmp))
            lock_path = path.parent / "locks" / "INPUT_LOCKS.json"
            lock_data = json.loads(lock_path.read_text(encoding="utf-8"))
            lock_data["files"]["geometry/permanent.stl"] = "0" * 64
            lock_path.write_text(json.dumps(lock_data), encoding="utf-8")
            results = validate_job(load_job(path))
            self.assertFalse(next(item for item in results if item.key == "locks").ok)
            self.assert_job_rejected_before_cli(path)

    def test_mesh_import_rechecks_lock_immediately_before_engine_launch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_mesh_job(Path(tmp))
            events: list[tuple[str, dict]] = []
            runner = SliceRunner(load_job(path))
            with patch("runner.verify_input_locks", return_value=(False, ["mesh hash changed"])):
                runner.start(lambda event, payload: events.append((event, payload)))
                runner._thread.join(timeout=8)  # type: ignore[union-attr]
            self.assertFalse(runner.running)
            self.assertFalse(any(event == "started" for event, _ in events))
            complete = [payload for event, payload in events if event == "complete"][-1]
            self.assertEqual(complete["status"], "FAILED")
            self.assertIsNone(complete["exit_code"])
            self.assertFalse(complete["manifest"]["engine_terminal_result"]["process_started"])
            self.assertIn("engine起動直前", complete["error"])

    def test_native_project_provenance_rejects_reduced_and_unknown_inputs(self) -> None:
        for provenance in (
            {"native_saved": True, "externally_reduced": True, "manually_repacked": False},
            None,
        ):
            with self.subTest(provenance=provenance), tempfile.TemporaryDirectory() as tmp:
                path = self.make_job(Path(tmp), duration=0.01)
                job_dir = path.parent
                project = job_dir / "geometry" / "source.3mf"
                project.write_bytes(b"placeholder project bytes")
                raw = json.loads(path.read_text(encoding="utf-8"))
                raw["schema_version"] = "0.2"
                raw["input_mode"] = "native_bambu_project"
                raw["inputs"] = ["./geometry/source.3mf"]
                if provenance is not None:
                    raw["provenance"] = provenance
                else:
                    raw.pop("provenance", None)
                path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
                lock_path = job_dir / "locks" / "INPUT_LOCKS.json"
                lock_data = json.loads(lock_path.read_text(encoding="utf-8"))
                lock_data["files"]["geometry/source.3mf"] = hashlib.sha256(project.read_bytes()).hexdigest()
                lock_path.write_text(json.dumps(lock_data, indent=2), encoding="utf-8")
                results = validate_job(load_job(path))
                self.assertFalse(next(item for item in results if item.key == "input_mode").ok)
                self.assert_job_rejected_before_cli(path)

    def test_info_success_is_package_parse_only_and_slice_empty_plate_is_distinct(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            info = SliceRunner._plate_recognition(["bambu-studio", "--info"], "SUCCESS", 0, run_dir)
            self.assertEqual(info["package_parse"], "PACKAGE_PARSE_PASS")
            self.assertEqual(info["plate_recognition"], "PRINTABLE_OBJECT_UNVERIFIED")
            (run_dir / "stderr.log").write_text(
                "-50: One of the plate is empty or has no object fully inside it.", encoding="utf-8"
            )
            rejected = SliceRunner._plate_recognition(["bambu-studio", "--slice", "0"], "FAILED", 1, run_dir)
            self.assertEqual(rejected["plate_recognition"], "SLICE_REJECTED_EMPTY_PLATE")
            accepted = SliceRunner._plate_recognition(["bambu-studio", "--slice", "0"], "SUCCESS", 0, run_dir)
            self.assertEqual(accepted["plate_recognition"], "SLICE_ACCEPTED")

    def test_cli_resolved_settings_is_recorded_as_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            events, run_dir = self.run_job(self.make_job(Path(tmp), emit_resolved_settings=True))
            complete = [payload for event, payload in events if event == "complete"][-1]
            self.assertEqual(complete["status"], "SUCCESS")
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            output_paths = {record["path"] for record in manifest["outputs"]}
            self.assertIn("resolved_settings.json", output_paths)
            self.assertTrue((run_dir / "resolved_settings.json").is_file())
            self.assertNotIn("RUNNER_EXECUTION_CONTEXT.json", output_paths)
            self.assertNotIn("INPUT_LOCKS.json", output_paths)

    def test_success_generates_sliced_only_review_artifact_with_matching_gcode_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            events, run_dir = self.run_job(self.make_job(Path(tmp)))
            complete = [payload for event, payload in events if event == "complete"][-1]
            self.assertEqual(complete["status"], "SUCCESS")
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            review = manifest["review_artifact"]
            self.assertTrue(manifest["review_ready"])
            self.assertEqual(review["native_zip_crc"], "PASS")
            review_path = Path(review["path"])
            standalone_path = run_dir / "sample.gcode"
            self.assertEqual(review_path, run_dir / "sample.gcode.3mf")
            self.assertTrue(review_path.is_file())
            self.assertIn("sample.gcode.3mf", {item["path"] for item in manifest["outputs"]})
            self.assertEqual(manifest["review_artifact_path"], str(review_path))
            self.assertEqual(manifest["review_artifact_sha256"], hashlib.sha256(review_path.read_bytes()).hexdigest())
            standalone_sha = hashlib.sha256(standalone_path.read_bytes()).hexdigest()
            self.assertEqual(manifest["standalone_gcode_sha256"], standalone_sha)
            self.assertEqual(manifest["embedded_gcode_sha256"], standalone_sha)
            self.assertTrue(manifest["embedded_equals_standalone"])
            self.assertEqual(review["standalone_gcode_sha256"], standalone_sha)
            self.assertTrue(review["embedded_equals_standalone"])
            with zipfile.ZipFile(review_path) as archive:
                self.assertIn("Metadata/plate_1.gcode", archive.namelist())
                self.assertEqual(archive.read("Metadata/plate_1.gcode"), standalone_path.read_bytes())
                self.assertFalse(any(name.startswith("3D/") for name in archive.namelist()))
                self.assertEqual(
                    archive.read("Metadata/plate_1.gcode.md5").decode("ascii"),
                    hashlib.md5(standalone_path.read_bytes()).hexdigest().upper(),
                )

    def _assert_review_failure(self, native_mode: str, expected_text: str) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            events, run_dir = self.run_job(self.make_job(Path(tmp), native_mode=native_mode, duration=0.01))
            complete = [payload for event, payload in events if event == "complete"][-1]
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            self.assertEqual(complete["status"], "SUCCESS")
            self.assertTrue(manifest["execution_success"])
            self.assertEqual(manifest["status"], "SUCCESS")
            self.assertFalse(manifest["review_ready"])
            self.assertEqual(manifest["review_artifact"]["status"], "FAILED")
            self.assertFalse(manifest["review_artifact"]["review_ready"])
            self.assertIn(expected_text, manifest["review_artifact"]["error"])
            self.assertIsNone(manifest["review_artifact_path"])
            self.assertFalse(any(path.name.endswith(".gcode.3mf") for path in run_dir.iterdir()))

    def test_missing_native_3mf_fails_closed_after_cli_success(self) -> None:
        self._assert_review_failure("missing", "native sliced 3MFが見つかりません")

    def test_corrupt_native_3mf_fails_closed_after_cli_success(self) -> None:
        self._assert_review_failure("corrupt", "native sliced 3MF ZIPを検証できません")

    def test_malformed_model_settings_fails_closed_after_cli_success(self) -> None:
        self._assert_review_failure("malformed", "model_settings.configをparseできません")

    def test_missing_native_embedded_gcode_fails_closed_after_cli_success(self) -> None:
        self._assert_review_failure("missing_gcode", "Metadata/plate_1.gcodeがありません")

    def test_native_embedded_gcode_mismatch_fails_closed_after_cli_success(self) -> None:
        self._assert_review_failure("mismatch", "SHA-256が一致しません")

    def test_packaging_exception_keeps_cli_success_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(SliceRunner, "_create_review_artifact", side_effect=RuntimeError("test packaging failure")):
                events, run_dir = self.run_job(self.make_job(Path(tmp), duration=0.01))
            complete = [payload for event, payload in events if event == "complete"][-1]
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            self.assertEqual(complete["status"], "SUCCESS")
            self.assertEqual(manifest["status"], "SUCCESS")
            self.assertTrue(manifest["execution_success"])
            self.assertFalse(manifest["review_ready"])
            self.assertEqual(manifest["review_artifact"]["status"], "FAILED")
            self.assertIn("test packaging failure", manifest["review_artifact"]["error"])

    def test_failure_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            events, run_dir = self.run_job(self.make_job(Path(tmp), mode="failure"))
            complete = [payload for event, payload in events if event == "complete"][-1]
            self.assertEqual(complete["status"], "FAILED")
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["exit_code"], 7)
            self.assertFalse(manifest["execution_success"])
            self.assertNotIn("printable", manifest)
            self.assertIsNone(manifest["review_artifact"])

    def test_cancel_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            events: list[tuple[str, dict]] = []
            runner = SliceRunner(load_job(self.make_job(Path(tmp), mode="long")))
            runner.start(lambda event, payload: events.append((event, payload)))
            time.sleep(0.35)
            runner.cancel()
            deadline = time.monotonic() + 8
            while runner.running and time.monotonic() < deadline:
                time.sleep(0.05)
            complete = [payload for event, payload in events if event == "complete"][-1]
            self.assertEqual(complete["status"], "CANCELLED")
            manifest = json.loads((Path(complete["run_dir"]) / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            self.assertFalse(manifest["execution_success"])
            self.assertNotIn("printable", manifest)
            self.assertTrue((Path(complete["run_dir"]) / "INPUT_LOCKS.json").is_file())
            self.assertIsNone(manifest["review_artifact"])

    def test_progress_distinguishes_actual_and_estimated(self) -> None:
        parser = ProgressParser()
        parser.feed("starting")
        estimated = ProgressEstimator(100).snapshot(parser, 25)
        self.assertFalse(estimated.actual)
        parser.feed('{"progress": 40}')
        actual = ProgressEstimator(100).snapshot(parser, 25)
        self.assertTrue(actual.actual)
        self.assertEqual(actual.percent, 40)
        parser.feed("ordinary slicer log 50%")
        still_actual = ProgressEstimator(100).snapshot(parser, 25)
        self.assertTrue(still_actual.actual)
        self.assertEqual(still_actual.percent, 40)

        only_text = ProgressParser()
        only_text.feed("ordinary slicer log 50%")
        text_snapshot = ProgressEstimator(100).snapshot(only_text, 25)
        self.assertFalse(text_snapshot.actual)

    def test_windows_execution_creation_flags(self) -> None:
        if os.name != "nt":
            self.skipTest("Windows flags are only available on Windows")
        no_window = windows_creation_flags("no_window")
        inherit_console = windows_creation_flags("inherit_console")
        self.assertTrue(no_window & __import__("subprocess").CREATE_NEW_PROCESS_GROUP)
        self.assertTrue(no_window & __import__("subprocess").CREATE_NO_WINDOW)
        self.assertTrue(inherit_console & __import__("subprocess").CREATE_NEW_PROCESS_GROUP)
        self.assertFalse(inherit_console & __import__("subprocess").CREATE_NO_WINDOW)

    def test_inherit_console_is_recorded_in_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            events, run_dir = self.run_job(self.make_job(Path(tmp), windows_execution="inherit_console"))
            complete = [payload for event, payload in events if event == "complete"][-1]
            self.assertEqual(complete["status"], "SUCCESS")
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["windows_execution"], "inherit_console")

    def test_profile_placeholder_resolves(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_job(Path(tmp))
            spec = load_job(path)
            spec.cli["argv"] = ["{engine_path}", "{profiles.printer}", "{profile_process}"]
            resolved = resolve_argv(spec, Path(tmp) / "run")
            self.assertEqual(resolved[1], str(spec.profiles["printer"]))
            self.assertEqual(resolved[2], str(spec.profiles["process"]))


if __name__ == "__main__":
    unittest.main()
