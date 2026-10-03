"""Create a persistent Phase B proof artifact using a non-Bambu fake CLI."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import textwrap
import time
import zipfile
from pathlib import Path

from job import load_job
from runner import SliceRunner


def main() -> None:
    root = Path(__file__).resolve().parent
    proof_root = root / "R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0"
    proof_root.mkdir(parents=True, exist_ok=True)
    output_root = proof_root / "proof-output"
    output_root.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="fukei_phase_b_proof_") as temp:
        fixture = Path(temp) / "job"
        (fixture / "geometry").mkdir(parents=True)
        (fixture / "profiles").mkdir()
        (fixture / "locks").mkdir()
        (fixture / "data").mkdir()
        (fixture / "geometry" / "proof.stl").write_text("phase-b-proof", encoding="utf-8")
        for name in ("printer", "process", "filament"):
            (fixture / "profiles" / f"{name}.json").write_text("{}", encoding="utf-8")

        fake_cli = fixture / "fake_cli.py"
        fake_cli.write_text(
            textwrap.dedent(
                """
                import pathlib, sys, zipfile
                output = pathlib.Path(sys.argv[sys.argv.index('--output-dir') + 1])
                output.mkdir(parents=True, exist_ok=True)
                (output / 'plate_1.gcode').write_bytes(b'; phase-b proof\\nG1 X0 Y0\\n')
                with zipfile.ZipFile(output / 'native.3mf', 'w', compression=zipfile.ZIP_DEFLATED) as native:
                    native.writestr('3D/3dmodel.model', b'geometry fixture')
                    native.writestr('Metadata/model_settings.config', b'<config><plate><metadata key="gcode_file" value="Metadata/plate_1.gcode"/></plate></config>')
                    native.writestr('Metadata/plate_1.gcode', b'; phase-b proof\\nG1 X0 Y0\\n')
                """
            ),
            encoding="utf-8",
        )
        locked = [fixture / "geometry" / "proof.stl", *(fixture / "profiles" / f"{name}.json" for name in ("printer", "process", "filament"))]
        lock_entries = {
            str(path.relative_to(fixture)).replace(os.sep, "/"): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in locked
        }
        (fixture / "locks" / "INPUT_LOCKS.json").write_text(json.dumps({"files": lock_entries}), encoding="utf-8")
        job_path = fixture / "SLICE_JOB.json"
        job_path.write_text(
            json.dumps(
                {
                    "job_id": "R5.PHASE_B.PROOF",
                    "candidate": "R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0",
                    "schema_version": "0.1",
                    "engine_path": sys.executable,
                    "data_dir": "./data",
                    "inputs": ["./geometry/proof.stl"],
                    "profiles": {name: f"./profiles/{name}.json" for name in ("printer", "process", "filament")},
                    "output_dir": str(output_root),
                    "cli": {
                        "version": "fake-proof-cli",
                        "cwd": ".",
                        "argv": [sys.executable, "{job_dir}/fake_cli.py", "--output-dir", "{run_dir}"],
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        events: list[tuple[str, dict]] = []
        runner = SliceRunner(load_job(job_path))
        runner.start(lambda event, payload: events.append((event, payload)))
        deadline = time.monotonic() + 10
        while runner.running and time.monotonic() < deadline:
            time.sleep(0.02)
        if runner.running:
            raise RuntimeError("proof runner did not finish")
        complete = [payload for event, payload in events if event == "complete"][-1]
        if complete["status"] != "SUCCESS":
            raise RuntimeError(f"proof runner failed: {complete}")
        manifest = complete["manifest"]
        review = manifest["review_artifact"]
        review_path = Path(review["path"])
        with zipfile.ZipFile(review_path) as archive:
            entries = archive.namelist()
            embedded = archive.read(review["embedded_gcode_path"])

        proof = {
            "phase": "R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0",
            "implementation": "Phase B",
            "bambu_cli_executed": False,
            "printer_send": False,
            "auto_print": False,
            "slice_contract_changed": False,
            "run_dir": str(Path(manifest["review_artifact"]["path"]).parent),
            "review_artifact": review,
            "review_artifact_sha256": manifest["review_artifact_sha256"],
            "standalone_gcode_sha256": manifest["standalone_gcode_sha256"],
            "embedded_gcode_sha256": manifest["embedded_gcode_sha256"],
            "embedded_equals_standalone": manifest["embedded_equals_standalone"],
            "contains_3d_geometry_entries": any(name.startswith("3D/") for name in entries),
            "embedded_bytes_sha256_recomputed": hashlib.sha256(embedded).hexdigest(),
            "output_entries": entries,
            "proof_source": "fake CLI only; no Bambu Studio invocation",
        }
        (proof_root / "PHASE_B_PROOF.json").write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
