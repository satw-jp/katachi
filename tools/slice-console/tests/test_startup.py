from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import _startup_args  # noqa: E402
from setup_windows import create_shortcut, desktop_spec, remove_shortcut  # noqa: E402
from startup import RuntimePaths, SingleInstance, resolve_pythonw  # noqa: E402


class StartupTests(unittest.TestCase):
    def test_startup_argument_is_separate_from_optional_job(self) -> None:
        startup, job = _startup_args(["--startup", r"J:\jobs\SLICE_JOB.json"])
        self.assertTrue(startup)
        self.assertEqual(job, Path(r"J:\jobs\SLICE_JOB.json"))

    def test_desktop_and_startup_shortcut_specs_differ_only_by_startup_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            python = root / "python.exe"
            pythonw = root / "pythonw.exe"
            app = root / "app.py"
            python.touch()
            pythonw.touch()
            app.touch()
            paths = RuntimePaths(root, app, root / "setup_windows.py", python, pythonw)
            desktop = desktop_spec(paths, root / "Desktop")
            from setup_windows import startup_spec

            startup = startup_spec(paths, root / "Startup")
            self.assertNotIn("--startup", desktop.arguments)
            self.assertIn("--startup", startup.arguments)
            self.assertEqual(desktop.target, pythonw)
            self.assertEqual(desktop.working_directory, root)

    def test_pythonw_sibling_is_preferred(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            python = Path(tmp) / "python.exe"
            pythonw = Path(tmp) / "pythonw.exe"
            python.touch()
            pythonw.touch()
            self.assertEqual(resolve_pythonw(python), pythonw)

    @unittest.skipUnless(os.name == "nt", "Windows shortcut test")
    def test_shortcut_create_and_remove(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "pythonw.exe"
            target.touch()
            spec = desktop_spec(
                RuntimePaths(root, root / "app.py", root / "setup_windows.py", root / "python.exe", target),
                root / "Desktop",
            )
            spec.path.parent.mkdir()
            create_shortcut(spec)
            self.assertTrue(spec.path.is_file())
            self.assertTrue(remove_shortcut(spec.path))
            self.assertFalse(spec.path.exists())

    @unittest.skipUnless(os.name == "nt", "Windows mutex test")
    def test_duplicate_instance_is_detected_without_pid_file(self) -> None:
        name = "Local\\FUKEI_Slice_Runner_Test_" + str(os.getpid())
        first = SingleInstance(name)
        second = SingleInstance(name)
        try:
            self.assertTrue(first.acquire())
            self.assertFalse(second.acquire())
        finally:
            second.release()
            first.release()


if __name__ == "__main__":
    unittest.main()

