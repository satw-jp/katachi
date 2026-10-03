"""Thin CLI using exactly the same ConsoleRouter as GUI/AI callers."""

import argparse
import json
from pathlib import Path
import sys
import uuid

from .contract import SCHEMA_VERSION
from .router import ConsoleRouter, timestamp


def main(argv=None):
    parser = argparse.ArgumentParser(description="Slice Console R0.1; no implicit print approval")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("preflight", "full-slice", "audit", "reuse"):
        command = commands.add_parser(name)
        command.add_argument("path")
        command.add_argument("--request-id", default=None)
        command.add_argument("--result", help="Write a new file named CONSOLE_RESULT.json; existing files are refused")
    package = commands.add_parser("package")
    package.add_argument("gcode")
    package.add_argument("--context", required=True)
    package.add_argument("--output-dir", required=True)
    package.add_argument("--expected-sha256")
    package.add_argument("--expected-bytes", type=int)
    package.add_argument("--expected-layers", type=int)
    package.add_argument("--request-id", default=None)
    package.add_argument("--result")
    run = commands.add_parser("run", help="Execute a versioned CONSOLE_REQUEST.json")
    run.add_argument("request")
    run.add_argument("--result")
    args = parser.parse_args(argv)
    if args.command == "run":
        read_error = None
        try:
            request = json.loads(Path(args.request).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            request = None
            read_error = str(exc)
    else:
        modes = {"preflight": "PREFLIGHT", "full-slice": "FULL_SLICE", "package": "PACKAGE_ONLY", "audit": "AUDIT_ONLY", "reuse": "REUSE"}
        if args.command == "package":
            inputs = {"gcode_path": str(Path(args.gcode).resolve()),
                      "context_3mf_path": str(Path(args.context).resolve()),
                      "output_dir": str(Path(args.output_dir).resolve())}
            for key in ("expected_sha256", "expected_bytes", "expected_layers"):
                if getattr(args, key) is not None:
                    inputs[key] = getattr(args, key)
        else:
            key = "job_path" if args.command in {"preflight", "full-slice"} else "artifact_path"
            inputs = {key: str(Path(args.path).resolve())}
        request = {"schema_version": SCHEMA_VERSION, "request_id": args.request_id if args.request_id is not None else str(uuid.uuid4()),
                   "mode": modes[args.command], "inputs": inputs}
    output = None
    if args.result:
        try:
            if Path(args.result).name != "CONSOLE_RESULT.json":
                raise OSError("Console result filename must be CONSOLE_RESULT.json; backend filenames are reserved")
            # Reserve before dispatch; cannot overwrite a job, backend artifact or prior result.
            output = Path(args.result).open("x", encoding="utf-8")
        except OSError as exc:
            result = ConsoleRouter().run(None)
            result.update(request_id=request.get("request_id") if isinstance(request, dict) and isinstance(request.get("request_id"), str) else None,
                          requested_mode=request.get("mode") if isinstance(request, dict) and isinstance(request.get("mode"), str) else None,
                          reason="RESULT_PATH_UNAVAILABLE", blocker=str(exc), finished_at=timestamp())
            print(json.dumps(result, ensure_ascii=False))
            return 2
    router = ConsoleRouter()
    try:
        result = router.run(request)
        if args.command == "run" and read_error:
            result.update(reason="INVALID_REQUEST", blocker=read_error)
    finally:
        if output is not None and 'result' not in locals():
            output.close()
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if output is not None:
        with output:
            output.write(text + "\n")
    print(text)
    return 0 if result["status"] in {"PASS", "SUCCESS", "PACKAGE_COMPLETE"} else 2


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
