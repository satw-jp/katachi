"""Background subprocess runner for validated native slice jobs."""

from __future__ import annotations

import json
import hashlib
import os
import re
import shutil
import signal
import subprocess
import threading
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from xml.etree import ElementTree

from job import (
    JobSpec,
    resolve_argv,
    resolve_cwd,
    resolve_env,
    resolve_input_identities,
    resolve_profile_identities,
    resolve_windows_execution,
    validate_job,
    verify_input_locks,
)
from progress import ProgressEstimator, ProgressParser


EventCallback = Callable[[str, dict[str, Any]], None]
RUNNER_VERSION = "0.2.0"
JOB_SCHEMA_VERSION = "0.2"
RESULT_SCHEMA_VERSION = "0.2"


def windows_creation_flags(windows_execution: str) -> int:
    """Return the exact Windows creation flags for the job-authoritative mode."""

    if windows_execution not in {"no_window", "inherit_console"}:
        raise ValueError(f"未対応のwindows_executionです: {windows_execution}")
    if os.name != "nt":
        return 0
    flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    if windows_execution == "no_window":
        flags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return flags


class SliceRunner:
    def __init__(self, spec: JobSpec) -> None:
        self.spec = spec
        self._callback: EventCallback | None = None
        self._thread: threading.Thread | None = None
        self._process: subprocess.Popen[str] | None = None
        self._cancel_event = threading.Event()
        self._state_lock = threading.Lock()
        self._parser = ProgressParser()
        self._estimator = ProgressEstimator(spec.reference_duration_seconds)
        self._started_at: datetime | None = None
        self._run_dir: Path | None = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self, callback: EventCallback) -> None:
        if self.running:
            raise RuntimeError("このjobはすでに実行中です")
        self._callback = callback
        self._cancel_event.clear()
        self._parser = ProgressParser()
        self._thread = threading.Thread(target=self._worker, name="fukei-slice-runner", daemon=True)
        self._thread.start()

    def cancel(self) -> None:
        self._cancel_event.set()
        process = self._process
        if process is None or process.poll() is not None:
            return
        try:
            if os.name == "nt":
                process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                process.terminate()
        except (OSError, ValueError):
            try:
                process.terminate()
            except OSError:
                pass

    def _emit(self, event: str, payload: dict[str, Any] | None = None) -> None:
        if self._callback:
            self._callback(event, payload or {})

    def _make_run_dir(self) -> Path:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        candidate = re.sub(r"[^A-Za-z0-9_.-]+", "_", self.spec.candidate or self.spec.job_id or "slice")
        root = self.spec.output_dir / "runs"
        root.mkdir(parents=True, exist_ok=True)
        run_dir = root / f"{candidate}_{stamp}"
        suffix = 1
        while run_dir.exists():
            run_dir = root / f"{candidate}_{stamp}_{suffix:02d}"
            suffix += 1
        run_dir.mkdir()
        return run_dir

    def _worker(self) -> None:
        run_dir: Path | None = None
        argv: list[str] = []
        cwd = resolve_cwd(self.spec)
        windows_execution = str(self.spec.cli.get("windows_execution", "no_window")).strip().casefold()
        lock_verified = False
        lock_errors: list[str] = []
        input_identities: list[dict[str, Any]] = []
        profile_identities: list[dict[str, Any]] = []
        started_at = datetime.now().astimezone()
        self._started_at = started_at
        try:
            validation = validate_job(self.spec)
            failures = [item.detail for item in validation if not item.ok]
            if failures:
                raise ValueError(" / ".join(failures))

            run_dir = self._make_run_dir()
            self._run_dir = run_dir
            shutil.copy2(self.spec.path, run_dir / "SLICE_JOB.json")
            argv = resolve_argv(self.spec, run_dir)
            windows_execution = resolve_windows_execution(self.spec)
            input_identities = resolve_input_identities(self.spec)
            profile_identities = resolve_profile_identities(self.spec)
            lock_verified, lock_errors = verify_input_locks(self.spec)
            if self.spec.input_mode == "mesh_import" and not lock_verified:
                raise ValueError("mesh input lockがengine起動直前に一致しません: " + " / ".join(lock_errors))
            env = os.environ.copy()
            env.update(resolve_env(self.spec, run_dir))
            execution_context = {
                "job_id": self.spec.job_id,
                "candidate": self.spec.candidate,
                "runner_version": RUNNER_VERSION,
                "job_schema_version": self.spec.schema_version,
                "engine_path": str(self.spec.engine_path),
                "engine_version": self.spec.cli.get("version", self.spec.raw.get("engine_version", "unknown")),
                "data_dir": str(self.spec.data_dir),
                "cwd": str(cwd),
                "argv": argv,
                "windows_execution": windows_execution,
                "inputs": [str(path) for path in self.spec.inputs],
                "resolved_input_identities": input_identities,
                "profiles": {key: str(path) for key, path in self.spec.profiles.items()},
                "resolved_profile_identities": profile_identities,
                "input_locks": {"path": str(self.spec.locks_path), "verified": lock_verified, "errors": lock_errors},
                "output_dir": str(run_dir),
            }
            (run_dir / "RUNNER_EXECUTION_CONTEXT.json").write_text(
                json.dumps(execution_context, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            lock_copy = run_dir / "INPUT_LOCKS.json"
            if self.spec.locks_path.resolve() != lock_copy.resolve():
                shutil.copy2(self.spec.locks_path, lock_copy)

            popen_kwargs: dict[str, Any] = {}
            if os.name == "nt":
                popen_kwargs["creationflags"] = windows_creation_flags(windows_execution)
            else:
                popen_kwargs["start_new_session"] = True

            stdout_path = run_dir / "stdout.log"
            stderr_path = run_dir / "stderr.log"
            with stdout_path.open("w", encoding="utf-8", errors="replace") as stdout_log, stderr_path.open(
                "w", encoding="utf-8", errors="replace"
            ) as stderr_log:
                self._process = subprocess.Popen(
                    argv,
                    cwd=str(cwd),
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                    shell=False,
                    **popen_kwargs,
                )
                readers = [
                    threading.Thread(target=self._read_stream, args=("stdout", self._process.stdout, stdout_log), daemon=True),
                    threading.Thread(target=self._read_stream, args=("stderr", self._process.stderr, stderr_log), daemon=True),
                ]
                for reader in readers:
                    reader.start()
                self._emit("started", {"run_dir": str(run_dir), "argv": argv})
                next_tick = 0.0
                while self._process.poll() is None:
                    now = time.monotonic()
                    if now >= next_tick:
                        self._emit_snapshot()
                        next_tick = now + 1.0
                    if self._cancel_event.is_set() and self._process.poll() is None:
                        self._terminate_after_cancel()
                    time.sleep(0.1)
                for reader in readers:
                    reader.join(timeout=2.0)
                exit_code = self._process.returncode

            status = "CANCELLED" if self._cancel_event.is_set() else ("SUCCESS" if exit_code == 0 else "FAILED")
            review_artifact: dict[str, Any] | None = None
            if status == "SUCCESS":
                try:
                    review_artifact = self._create_review_artifact(run_dir)
                except Exception as exc:  # noqa: BLE001 - packaging must not rewrite CLI execution status
                    review_artifact = {
                        "status": "FAILED",
                        "review_ready": False,
                        "error": f"review packaging failed: {exc}",
                    }
            manifest = self._write_manifest(
                status, exit_code, started_at, run_dir, argv, cwd, windows_execution,
                lock_verified, lock_errors, input_identities, profile_identities, review_artifact,
            )
            self._emit("complete", {
                "status": status,
                "exit_code": exit_code,
                "run_dir": str(run_dir),
                "manifest": manifest,
                "review_artifact": manifest.get("review_artifact"),
            })
        except Exception as exc:  # noqa: BLE001 - the GUI must receive failures as a final event
            if run_dir is not None:
                manifest = self._write_manifest(
                    "CANCELLED" if self._cancel_event.is_set() else "FAILED", None,
                    started_at, run_dir, argv, cwd, windows_execution,
                    lock_verified, lock_errors, input_identities, profile_identities, None,
                )
                self._emit("complete", {
                    "status": "CANCELLED" if self._cancel_event.is_set() else "FAILED",
                    "exit_code": None,
                    "run_dir": str(run_dir),
                    "manifest": manifest,
                    "error": str(exc),
                })
            else:
                self._emit("error", {"message": str(exc)})
        finally:
            self._process = None

    def _terminate_after_cancel(self) -> None:
        process = self._process
        if process is None or process.poll() is not None:
            return
        try:
            process.terminate()
        except OSError:
            return
        deadline = time.monotonic() + 2.0
        while process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.1)
        if process.poll() is None:
            try:
                process.kill()
            except OSError:
                pass

    def _read_stream(self, stream_name: str, stream: Any, log_file: Any) -> None:
        if stream is None:
            return
        for line in iter(stream.readline, ""):
            log_file.write(line)
            log_file.flush()
            info = self._parser.feed(line)
            self._emit("line", {"stream": stream_name, "line": line.rstrip("\r\n"), "phase": info.phase})
            if info.progress is not None:
                self._emit_snapshot()
        stream.close()

    def _emit_snapshot(self) -> None:
        if self._started_at is None:
            return
        elapsed = (datetime.now().astimezone() - self._started_at).total_seconds()
        snapshot = self._estimator.snapshot(self._parser, elapsed)
        self._emit("progress", {
            "percent": snapshot.percent,
            "actual": snapshot.actual,
            "phase": snapshot.phase,
            "elapsed_seconds": snapshot.elapsed_seconds,
            "remaining_seconds": snapshot.remaining_seconds,
            "finish_at": snapshot.finish_at.isoformat() if snapshot.finish_at else None,
        })

    def _output_records(self, run_dir: Path) -> tuple[list[dict[str, Any]], int]:
        excluded = {
            "SLICE_JOB.json",
            "RESULT_MANIFEST.json",
            "RUNNER_EXECUTION_CONTEXT.json",
            "INPUT_LOCKS.json",
            "stdout.log",
            "stderr.log",
        }
        records: list[dict[str, Any]] = []
        total = 0
        for path in sorted(run_dir.rglob("*")):
            if not path.is_file() or path.name in excluded:
                continue
            size = path.stat().st_size
            total += size
            records.append({"path": path.relative_to(run_dir).as_posix(), "bytes": size})
        return records, total

    @staticmethod
    def _plate_recognition(argv: list[str], status: str, exit_code: int | None, run_dir: Path) -> dict[str, str]:
        options = {item.casefold() for item in argv}
        package_parse = "NOT_RUN"
        if "--info" in options:
            package_parse = "PACKAGE_PARSE_PASS" if exit_code == 0 else "PACKAGE_PARSE_FAILED"

        plate_status = "PRINTABLE_OBJECT_UNVERIFIED"
        if "--slice" in options:
            if status == "SUCCESS" and exit_code == 0:
                plate_status = "SLICE_ACCEPTED"
            elif exit_code not in (None, 0):
                output = ""
                for name in ("stdout.log", "stderr.log"):
                    try:
                        output += (run_dir / name).read_text(encoding="utf-8", errors="replace") + "\n"
                    except OSError:
                        pass
                if "-50:" in output or "one of the plate is empty or has no object fully inside it" in output.casefold():
                    plate_status = "SLICE_REJECTED_EMPTY_PLATE"
        return {
            "package_parse": package_parse,
            "plate_recognition": plate_status,
        }

    @staticmethod
    def _sha256_bytes(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def _sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _local_name(tag: str) -> str:
        return tag.rsplit("}", 1)[-1]

    def _find_standalone_gcode(self, run_dir: Path) -> Path | None:
        candidates = sorted(
            path for path in run_dir.rglob("*.gcode")
            if path.is_file() and not path.name.endswith(".gcode.3mf")
        )
        if not candidates:
            return None
        for path in candidates:
            if path.name.casefold() == "plate_1.gcode":
                return path
        return candidates[0]

    def _find_native_3mf(self, run_dir: Path) -> Path | None:
        candidates = sorted(
            path for path in run_dir.rglob("*.3mf")
            if path.is_file() and not path.name.casefold().endswith(".gcode.3mf")
        )
        return candidates[0] if candidates else None

    def _plate_model_settings(self, source: bytes | None) -> bytes:
        root = ElementTree.Element("config")
        plate = ElementTree.SubElement(root, "plate")
        if source:
            try:
                source_root = ElementTree.fromstring(source)
                source_plate = next(
                    (element for element in source_root.iter() if self._local_name(element.tag) == "plate"),
                    None,
                )
                if source_plate is not None:
                    plate.attrib.update(source_plate.attrib)
                    for child in source_plate:
                        if self._local_name(child.tag) == "metadata":
                            plate.append(ElementTree.fromstring(ElementTree.tostring(child, encoding="unicode")))
            except ElementTree.ParseError:
                pass
        gcode_metadata = next(
            (element for element in plate if self._local_name(element.tag) == "metadata" and element.get("key") == "gcode_file"),
            None,
        )
        if gcode_metadata is None:
            ElementTree.SubElement(plate, "metadata", {"key": "gcode_file", "value": "Metadata/plate_1.gcode"})
        else:
            gcode_metadata.set("value", "Metadata/plate_1.gcode")
        return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)

    def _create_review_artifact(self, run_dir: Path) -> dict[str, Any]:
        standalone = self._find_standalone_gcode(run_dir)
        if standalone is None:
            return {
                "status": "FAILED",
                "review_ready": False,
                "error": "standalone G-codeが見つかりません",
            }

        review_path = standalone.with_suffix(".gcode.3mf")
        temp_path = review_path.with_name(review_path.name + ".tmp")
        source_3mf = self._find_native_3mf(run_dir)
        if source_3mf is None:
            return {
                "status": "FAILED",
                "review_ready": False,
                "error": "native sliced 3MFが見つかりません",
            }

        standalone_bytes = standalone.read_bytes()
        source_entries: dict[str, bytes] = {}
        model_settings: bytes | None = None
        native_embedded_bytes: bytes
        native_zip_crc = "PASS"
        try:
            with zipfile.ZipFile(source_3mf, "r") as source_zip:
                bad_entry = source_zip.testzip()
                if bad_entry is not None:
                    return {
                        "status": "FAILED",
                        "review_ready": False,
                        "error": f"native sliced 3MF ZIP CRC failed: {bad_entry}",
                    }
                names = set(source_zip.namelist())
                settings_name = "Metadata/model_settings.config"
                embedded_name = "Metadata/plate_1.gcode"
                if settings_name not in names:
                    return {
                        "status": "FAILED",
                        "review_ready": False,
                        "error": "native 3MFにMetadata/model_settings.configがありません",
                    }
                if embedded_name not in names:
                    return {
                        "status": "FAILED",
                        "review_ready": False,
                        "error": "native 3MFにMetadata/plate_1.gcodeがありません",
                    }
                model_settings = source_zip.read(settings_name)
                try:
                    ElementTree.fromstring(model_settings)
                except ElementTree.ParseError as exc:
                    return {
                        "status": "FAILED",
                        "review_ready": False,
                        "error": f"native Metadata/model_settings.configをparseできません: {exc}",
                    }
                native_embedded_bytes = source_zip.read(embedded_name)
                if native_embedded_bytes != standalone_bytes:
                    return {
                        "status": "FAILED",
                        "review_ready": False,
                        "error": (
                            "native embedded G-codeとstandalone G-codeのSHA-256が一致しません: "
                            f"native={self._sha256_bytes(native_embedded_bytes)} "
                            f"standalone={self._sha256_bytes(standalone_bytes)}"
                        ),
                    }
                for info in source_zip.infolist():
                    name = info.filename
                    if name.startswith("3D/"):
                        continue
                    if name == settings_name:
                        continue
                    if name.casefold().endswith(".gcode") or name.casefold().endswith(".gcode.md5"):
                        continue
                    source_entries[name] = source_zip.read(name)
        except (zipfile.BadZipFile, EOFError, OSError, RuntimeError) as exc:
            return {
                "status": "FAILED",
                "review_ready": False,
                "error": f"native sliced 3MF ZIPを検証できません: {exc}",
            }

        embedded_name = "Metadata/plate_1.gcode"
        gcode_bytes = native_embedded_bytes
        source_entries[embedded_name] = gcode_bytes
        source_entries["Metadata/plate_1.gcode.md5"] = hashlib.md5(gcode_bytes).hexdigest().upper().encode("ascii")
        source_entries["Metadata/model_settings.config"] = self._plate_model_settings(model_settings)
        if "[Content_Types].xml" not in source_entries:
            source_entries["[Content_Types].xml"] = (
                b'<?xml version="1.0" encoding="UTF-8"?>\n'
                b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
                b' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
                b' <Default Extension="gcode" ContentType="text/x.gcode"/>\n'
                b'</Types>\n'
            )
        if "_rels/.rels" not in source_entries:
            source_entries["_rels/.rels"] = (
                b'<?xml version="1.0" encoding="UTF-8"?>\n'
                b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>\n'
            )

        try:
            with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as review_zip:
                for name in sorted(source_entries):
                    review_zip.writestr(name, source_entries[name])
            temp_path.replace(review_path)
        except Exception:
            try:
                temp_path.unlink()
            except FileNotFoundError:
                pass
            raise

        embedded = source_entries[embedded_name]
        review_sha256 = self._sha256_file(review_path)
        standalone_sha256 = self._sha256_bytes(gcode_bytes)
        embedded_sha256 = self._sha256_bytes(embedded)
        return {
            "status": "READY",
            "review_ready": True,
            "path": str(review_path),
            "relative_path": review_path.relative_to(run_dir).as_posix(),
            "sha256": review_sha256,
            "native_3mf_path": str(source_3mf),
            "native_3mf_sha256": self._sha256_file(source_3mf),
            "native_zip_crc": native_zip_crc,
            "native_embedded_gcode_sha256": self._sha256_bytes(native_embedded_bytes),
            "standalone_gcode_path": str(standalone),
            "standalone_gcode_sha256": standalone_sha256,
            "embedded_gcode_path": embedded_name,
            "embedded_gcode_sha256": embedded_sha256,
            "embedded_equals_standalone": embedded == gcode_bytes,
        }

    def _write_manifest(
        self,
        status: str,
        exit_code: int | None,
        started_at: datetime,
        run_dir: Path,
        argv: list[str],
        cwd: Path,
        windows_execution: str,
        lock_verified: bool,
        lock_errors: list[str],
        input_identities: list[dict[str, Any]],
        profile_identities: list[dict[str, Any]],
        review_artifact: dict[str, Any] | None,
    ) -> dict[str, Any]:
        finished_at = datetime.now().astimezone()
        outputs, output_bytes = self._output_records(run_dir)
        plate_recognition = self._plate_recognition(argv, status, exit_code, run_dir)
        manifest: dict[str, Any] = {
            "job_id": self.spec.job_id,
            "candidate": self.spec.candidate,
            "status": status,
            "execution_success": status == "SUCCESS",
            "runner_version": RUNNER_VERSION,
            "schema_version": RESULT_SCHEMA_VERSION,
            "job_schema_version": self.spec.schema_version,
            "input_mode": self.spec.input_mode,
            "provenance": self.spec.provenance,
            "mesh_geometry_summary": self.spec.mesh_summary,
            "engine_terminal_result": {
                "process_started": self._process is not None,
                "status": status,
                "exit_code": exit_code,
            },
            "plate_recognition": plate_recognition,
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "elapsed_seconds": round((finished_at - started_at).total_seconds(), 3),
            "exit_code": exit_code,
            "cwd": str(cwd),
            "data_dir": str(self.spec.data_dir),
            "windows_execution": windows_execution,
            "input_locks_path": str(self.spec.locks_path),
            "input_locks": {
                "path": str(self.spec.locks_path),
                "verified": lock_verified,
                "errors": lock_errors,
            },
            "resolved_input_identities": input_identities,
            "resolved_profile_identities": profile_identities,
            "engine": {
                "path": str(self.spec.engine_path),
                "version": self.spec.cli.get("version", self.spec.raw.get("engine_version", "unknown")),
            },
            "argv": argv,
            "inputs": [str(path) for path in self.spec.inputs],
            "profiles": {key: str(path) for key, path in self.spec.profiles.items()},
            "outputs": outputs,
            "output_bytes": output_bytes,
            "review_artifact": review_artifact,
            "review_ready": bool(review_artifact and review_artifact.get("review_ready")),
            "review_artifact_path": review_artifact.get("path") if review_artifact else None,
            "review_artifact_sha256": review_artifact.get("sha256") if review_artifact else None,
            "embedded_gcode_sha256": review_artifact.get("embedded_gcode_sha256") if review_artifact else None,
            "standalone_gcode_sha256": review_artifact.get("standalone_gcode_sha256") if review_artifact else None,
            "embedded_equals_standalone": review_artifact.get("embedded_equals_standalone") if review_artifact else None,
            "stdout_log": str(run_dir / "stdout.log"),
            "stderr_log": str(run_dir / "stderr.log"),
        }
        (run_dir / "RESULT_MANIFEST.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return manifest
