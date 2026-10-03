"""Synchronous core shared by CLI and future GUI; no CLI argv synthesis."""

from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from queue import SimpleQueue
import threading

from job import load_job, validate_job
from package_gcode import package_gcode
from runner import SliceRunner

from .contract import SCHEMA_VERSION, validate_request


def timestamp():
    return datetime.now(timezone.utc).isoformat()


class ConsoleRouter:
    """Run in a GUI worker thread; poll events and call cancel() for FULL_SLICE.

    One router accepts one request at a time. This is not persistent deduplication.
    Backend events are exposed unchanged through events, an unbounded SimpleQueue.
    """

    def __init__(self):
        self.events = SimpleQueue()
        self._runner = None
        self._busy = threading.Lock()

    def cancel(self):
        runner = self._runner
        if runner is not None:
            runner.cancel()

    def run(self, request):
        raw = request if isinstance(request, dict) else {}
        result = {
            "schema_version": SCHEMA_VERSION,
            "request_id": raw.get("request_id") if isinstance(raw.get("request_id"), str) else None,
            "requested_mode": raw.get("mode") if isinstance(raw.get("mode"), str) else None,
            "status": "HOLD", "backend_invoked": None, "engine_started": False,
            "run_dir": None, "result_manifest_path": None,
            "package_result_path": None, "package_path": None,
            "reason": None, "blocker": None, "validation": [],
            "started_at": timestamp(), "finished_at": None,
        }
        reason, blocker = validate_request(request)
        if reason:
            result.update(reason=reason, blocker=blocker, finished_at=timestamp())
            return result
        if not self._busy.acquire(blocking=False):
            result.update(reason="ROUTER_BUSY", blocker="A request is already active", finished_at=timestamp())
            return result
        try:
            mode, inputs = request["mode"], request["inputs"]
            if mode in {"AUDIT_ONLY", "REUSE"}:
                reason = "AUDITOR_NOT_CONNECTED" if mode == "AUDIT_ONLY" else "CACHE_NOT_IMPLEMENTED"
                result.update(reason=reason, blocker=reason)
            elif mode == "PREFLIGHT":
                result["backend_invoked"] = "load_job/validate_job"
                checks = validate_job(load_job(inputs["job_path"]))
                result["validation"] = [asdict(check) for check in checks]
                failures = [check.detail for check in checks if not check.ok]
                result.update(status="HOLD" if failures else "PASS",
                              reason="STATIC_VALIDATION_FAILED" if failures else None,
                              blocker=" / ".join(failures) if failures else None)
            elif mode == "PACKAGE_ONLY":
                result["backend_invoked"] = "package_gcode"
                package = package_gcode(
                    Path(inputs["gcode_path"]), Path(inputs["output_dir"]),
                    Path(inputs["context_3mf_path"]),
                    **{name: inputs[name] for name in ("expected_sha256", "expected_bytes", "expected_layers") if name in inputs},
                )
                result.update(status=package["status"],
                              package_result_path=str(Path(inputs["output_dir"]) / "PACKAGE_RESULT.json"),
                              package_path=package["output_path"] if package["status"] == "PACKAGE_COMPLETE" else None,
                              reason="PACKAGE_FAILED" if package["status"] != "PACKAGE_COMPLETE" else None,
                              blocker=package.get("error"))
            elif mode == "FULL_SLICE":
                spec = load_job(inputs["job_path"])
                result["backend_invoked"] = "SliceRunner"
                runner = SliceRunner(spec)
                self._runner = runner
                terminal = []

                def receive(event, payload):
                    self.events.put((event, payload))
                    if event == "started":
                        result["engine_started"] = True
                    if event in {"complete", "error"}:
                        terminal.append((event, payload))

                runner.start(receive)
                # Public running property; no private worker/process mutation.
                while runner.running:
                    try:
                        threading.Event().wait(0.05)
                    except KeyboardInterrupt:
                        runner.cancel()
                if not terminal:
                    result.update(status="FAILED", reason="BACKEND_ERROR", blocker="Runner ended without a terminal event")
                else:
                    event, payload = terminal[-1]
                    if event == "error":
                        result.update(reason="STATIC_VALIDATION_FAILED", blocker=payload.get("message"))
                    else:
                        manifest = payload["manifest"]
                        result.update(status=manifest["status"],
                                      engine_started=result["engine_started"] or manifest["engine_terminal_result"]["process_started"],
                                      run_dir=payload["run_dir"],
                                      result_manifest_path=str(Path(payload["run_dir"]) / "RESULT_MANIFEST.json"),
                                      reason=None if manifest["status"] == "SUCCESS" else "RUNNER_" + manifest["status"],
                                      blocker=payload.get("error"))
        except Exception as exc:
            result.update(status="FAILED" if result["engine_started"] else "HOLD",
                          reason="BACKEND_ERROR", blocker=str(exc))
        finally:
            self._runner = None
            result["finished_at"] = timestamp()
            self._busy.release()
        return result
