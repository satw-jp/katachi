from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import App  # noqa: E402
from job import load_job  # noqa: E402
from progress import format_duration  # noqa: E402
from runner import SliceRunner  # noqa: E402


class FakeVar:
    def __init__(self, value: str = "") -> None:
        self.value = value

    def set(self, value: object) -> None:
        self.value = str(value)


class FakeWidget:
    def __init__(self) -> None:
        self.config: dict[str, object] = {}

    def configure(self, **kwargs: object) -> None:
        self.config.update(kwargs)


class FakeProgress(FakeWidget):
    def __init__(self, value: float = 0.0) -> None:
        super().__init__()
        self.value = value

    def configure(self, **kwargs: object) -> None:
        super().configure(**kwargs)
        if "value" in kwargs:
            self.value = float(kwargs["value"])

    def __getitem__(self, key: str) -> float:
        if key != "value":
            raise KeyError(key)
        return self.value


def app_harness(progress: float = 0.0) -> App:
    app = App.__new__(App)
    app.status_var = FakeVar()
    app.mode_var = FakeVar()
    app.phase_var = FakeVar()
    app.elapsed_var = FakeVar()
    app.remaining_var = FakeVar()
    app.finish_var = FakeVar()
    app.validation_message = FakeVar()
    app.progress = FakeProgress(progress)
    app.cancel_button = FakeWidget()
    app.review_button = FakeWidget()
    app.open_button = FakeWidget()
    app.run_button = FakeWidget()
    app.runner = object()
    app.job = object()
    app.validation = []
    app.last_run_dir = None
    return app


def make_subsecond_fake_job(root: Path) -> Path:
    job_dir = root / "job"
    (job_dir / "geometry").mkdir(parents=True)
    (job_dir / "profiles").mkdir()
    (job_dir / "locks").mkdir()
    (job_dir / "data").mkdir()
    (job_dir / "geometry" / "permanent.stl").write_text("permanent", encoding="utf-8")
    for name in ("printer", "process", "filament"):
        (job_dir / "profiles" / f"{name}.json").write_text("{}", encoding="utf-8")
    fake_cli = job_dir / "fake_cli.py"
    fake_cli.write_text(textwrap.dedent("""
        import pathlib, sys, zipfile
        pathlib.Path(sys.argv[sys.argv.index('--output-dir') + 1]).mkdir(parents=True, exist_ok=True)
        output = pathlib.Path(sys.argv[sys.argv.index('--output-dir') + 1])
        output.joinpath('sample.gcode').write_bytes(b'G1 X0 Y0\\n')
        with zipfile.ZipFile(output / 'native.3mf', 'w', compression=zipfile.ZIP_DEFLATED) as native:
            native.writestr('3D/3dmodel.model', b'geometry fixture')
            native.writestr('Metadata/model_settings.config', b'<config><plate><metadata key="gcode_file" value="Metadata/plate_1.gcode"/></plate></config>')
            native.writestr('Metadata/plate_1.gcode', b'G1 X0 Y0\\n')
    """), encoding="utf-8")
    locked_files = [
        job_dir / "geometry" / "permanent.stl",
        *(job_dir / "profiles" / f"{name}.json" for name in ("printer", "process", "filament")),
    ]
    lock_entries = {
        str(path.relative_to(job_dir)).replace(os.sep, "/"): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in locked_files
    }
    (job_dir / "locks" / "INPUT_LOCKS.json").write_text(json.dumps({"files": lock_entries}), encoding="utf-8")
    job = {
        "job_id": "APP.TEST",
        "candidate": "APP.TEST",
        "schema_version": "0.1",
        "engine_path": sys.executable,
        "data_dir": "./data",
        "inputs": ["./geometry/permanent.stl"],
        "profiles": {name: f"./profiles/{name}.json" for name in ("printer", "process", "filament")},
        "output_dir": "./output",
        "cli": {
            "version": "test",
            "cwd": ".",
            "argv": [sys.executable, "-u", str(fake_cli), "--output-dir", "{run_dir}"],
        },
    }
    path = job_dir / "SLICE_JOB.json"
    path.write_text(json.dumps(job, indent=2), encoding="utf-8")
    return path


def run_fake_job(path: Path) -> tuple[list[tuple[str, dict]], Path]:
    events: list[tuple[str, dict]] = []
    runner = SliceRunner(load_job(path))
    runner.start(lambda event, payload: events.append((event, payload)))
    deadline = time.monotonic() + 8
    while runner.running and time.monotonic() < deadline:
        time.sleep(0.01)
    if runner.running:
        raise AssertionError("fake runner did not finish")
    complete = [payload for event, payload in events if event == "complete"][-1]
    return events, Path(complete["run_dir"])


class AppFinalStateTests(unittest.TestCase):
    def test_subsecond_fake_cli_completion_finalizes_gui_before_first_tick(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            job_path = make_subsecond_fake_job(Path(tmp))
            events, run_dir = run_fake_job(job_path)
            complete = [payload for event, payload in events if event == "complete"][-1]
            manifest = json.loads((run_dir / "RESULT_MANIFEST.json").read_text(encoding="utf-8"))
            self.assertEqual(complete["status"], "SUCCESS")
            self.assertTrue(manifest["execution_success"])

            app = app_harness()
            app._finish_run(complete)

            self.assertEqual(app.progress.value, 100.0)
            self.assertEqual(app.mode_var.value, "完了")
            self.assertEqual(app.phase_var.value, "現在: 完了")
            self.assertEqual(app.elapsed_var.value, f"経過時間: {format_duration(manifest['elapsed_seconds'])}")
            self.assertEqual(app.remaining_var.value, "残り推定: 0分")
            self.assertEqual(app.finish_var.value, f"完了時刻: {manifest['finished_at']}")
            self.assertEqual(app.status_var.value, "Slice completed")
            self.assertEqual(app.review_button.config["state"], "normal")
            self.assertEqual(app.review_artifact_path, Path(manifest["review_artifact_path"]))

    def test_failed_and_cancelled_final_states_are_not_100_percent(self) -> None:
        for status in ("FAILED", "CANCELLED"):
            with self.subTest(status=status):
                app = app_harness(progress=100.0)
                finished_at = "2026-09-20T12:34:56+09:00"
                app._finish_run({
                    "status": status,
                    "exit_code": 7 if status == "FAILED" else None,
                    "manifest": {
                        "status": status,
                        "elapsed_seconds": 0.847,
                        "finished_at": finished_at,
                    },
                })

                self.assertLess(app.progress.value, 100.0)
                self.assertEqual(app.elapsed_var.value, "経過時間: 00:00")
                self.assertEqual(app.remaining_var.value, "残り推定: 計測中")
                self.assertEqual(app.finish_var.value, "完了予定: --")
                self.assertEqual(app.review_button.config["state"], "disabled")

    def test_review_button_opens_artifact_only_when_user_triggers_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            engine = root / "BambuStudio.exe"
            review = root / "plate_1.gcode.3mf"
            engine.touch()
            review.write_bytes(b"review")
            app = app_harness()
            app.job = SimpleNamespace(engine_path=engine)
            app.review_artifact_path = review
            with patch("app.subprocess.Popen") as popen:
                app._open_review_artifact()
            popen.assert_called_once_with([str(engine), str(review)], cwd=str(root), shell=False)

    def test_review_packaging_failure_keeps_slice_completed_and_disables_review_button(self) -> None:
        app = app_harness()
        app._finish_run({
            "status": "SUCCESS",
            "exit_code": 0,
            "manifest": {
                "status": "SUCCESS",
                "execution_success": True,
                "elapsed_seconds": 0.847,
                "finished_at": "2026-09-21T15:00:00+09:00",
                "review_ready": False,
                "review_artifact": {
                    "status": "FAILED",
                    "review_ready": False,
                    "error": "native sliced 3MFが見つかりません",
                },
            },
        })
        self.assertEqual(app.status_var.value, "Slice completed")
        self.assertEqual(app.review_button.config["state"], "disabled")
        self.assertIn("Review artifact unavailable", app.validation_message.value)


if __name__ == "__main__":
    unittest.main()
