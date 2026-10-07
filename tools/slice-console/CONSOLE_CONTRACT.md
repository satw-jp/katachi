# Slice Console R0.1 mode router

Console schema version: **0.1**. Backend: unchanged Runner **0.2.0**, job/result schema **0.2**.
Console owns ORCHESTRATE / ROUTE; Runner owns EXECUTE / RECORD; Fabrication / Author owns WHAT / WHEN / REVIEW.

## Shared entry and CLI

Run from `tools/slice-console/` (or add that directory to PYTHONPATH). No installation or new dependencies are required.

```text
python -m slice_console.console preflight <SLICE_JOB.json>
python -m slice_console.console full-slice <SLICE_JOB.json>
python -m slice_console.console package <complete.gcode> --context <source.3mf> --output-dir <package-folder>
python -m slice_console.console audit <exact-artifact-path>
python -m slice_console.console reuse <exact-artifact-path>
python -m slice_console.console run <CONSOLE_REQUEST.json>
```

All commands use `ConsoleRouter.run(request)`. Convenience commands resolve their explicit paths against the caller's working directory and generate a UUID request_id unless `--request-id` is supplied. JSON requests require absolute paths on the execution host and are never selected by recency. JSON uses UTF-8.

The terminal JSON result goes to stdout. Optional `--result <directory>/CONSOLE_RESULT.json` exclusively creates a new wrapper result file before dispatch. The parent directory must exist; existing files or a different basename are refused with `HOLD / RESULT_PATH_UNAVAILABLE` before any backend invocation. This preserves job/backend files and avoids overwriting historical results. Exit code 0 means PASS, SUCCESS or PACKAGE_COMPLETE; HOLD, FAILED, CANCELLED and PACKAGE_FAILED return 2. Parser usage errors also return 2 and may print argparse text rather than result JSON; use the `run` command for machine requests/unknown modes.

GUI/AI Python callers import `ConsoleRouter` from `slice_console` and pass the same dictionary. `run()` blocks; a GUI should call it from its worker thread, poll the router's unbounded `events` queue for unchanged Runner events, and call `cancel()` for an active FULL_SLICE. Ctrl-C during CLI FULL_SLICE waiting delegates Cancel, waits for backend terminal result and emits the wrapper result. One router handles one active request; another returns ROUTER_BUSY. This is not persistent duplicate prevention or an execution queue.

## Request contract

[CONSOLE_REQUEST.schema.json](slice_console/schemas/CONSOLE_REQUEST.schema.json) specifies the machine-readable shape. Standard-library runtime validation rejects unknown fields/modes/versions and invalid required inputs before routing.

```json
{
  "schema_version": "0.1",
  "request_id": "AUTHOR.PREFLIGHT.01",
  "mode": "PREFLIGHT",
  "inputs": {"job_path": "J:/exact/job/SLICE_JOB.json"}
}
```

| Mode | Required inputs | Optional inputs |
|---|---|---|
| PREFLIGHT / FULL_SLICE | `job_path` | none |
| PACKAGE_ONLY | `gcode_path`, `context_3mf_path`, `output_dir` | `expected_sha256` (64 hex), `expected_bytes`, `expected_layers` (positive integers) |
| AUDIT_ONLY / REUSE | `artifact_path` | none |

All required inputs above are exact absolute path strings. AUDIT_ONLY/REUSE require an explicit pointer but do not open, hash, search for or certify it in this release. No fallback is implemented. Console request IDs are correlation only; they do not promise idempotence or replace job_id.

## Result contract / mode semantics

[CONSOLE_RESULT.schema.json](slice_console/schemas/CONSOLE_RESULT.schema.json) includes:

`schema_version`, `request_id`, `requested_mode`, `status`, `backend_invoked`, `engine_started`, `run_dir`, `result_manifest_path`, `package_result_path`, `package_path`, `reason`, `blocker`, `validation`, `started_at`, `finished_at`.

Times are Console wrapper UTC timestamps, independent of Runner timestamps. Unused pointers/reason/blocker are null; invalid/unreadable requests may have null request_id or requested_mode. Engine_started reports actual backend start evidence, not request intention. Results are terminal; execution_success remains a property of the unchanged backend manifest, not a new Console approval field.

| Requested mode | Backend invoked | Terminal behavior | Engine |
|---|---|---|---|
| PREFLIGHT | `load_job/validate_job` | PASS if all static checks are ok; HOLD / STATIC_VALIDATION_FAILED for failed checks. Read/parse/backend exceptions return HOLD / BACKEND_ERROR. | never starts |
| FULL_SLICE | `SliceRunner` | SUCCESS, FAILED or CANCELLED from existing manifest. Pre-run validation error returns HOLD / STATIC_VALIDATION_FAILED and no manifest pointer. | only Runner starts supplied engine |
| PACKAGE_ONLY | `package_gcode` | PACKAGE_COMPLETE / PACKAGE_FAILED from existing function, PACKAGE_RESULT.json pointer, successful output pointer. Unexpected exceptions return HOLD / BACKEND_ERROR. | never starts |
| AUDIT_ONLY | null | HOLD / AUDITOR_NOT_CONNECTED | never starts |
| REUSE | null | HOLD / CACHE_NOT_IMPLEMENTED | never starts |
| Unknown mode / invalid contract | null | HOLD / UNKNOWN_MODE or INVALID_REQUEST | never starts |

FULL_SLICE does not regenerate argv, edit geometry/profiles, replace SLICE_JOB.json or rewrite RESULT_MANIFEST.json. It returns exact run/manifest pointers and forwards events. Success packaging is independent from CLI success. PACKAGE_ONLY preserves context requirements, byte count/SHA checks, ZIP CRC, raw G-code bytes, PACKAGE_RESULT.json and AUTHOR_PREVIEW_CHECK. Console writes only its own optional wrapper result.

## Limits and gate separation

PREFLIGHT is existing static validation, including the existing output-directory temporary write probe. It is not entirely filesystem-read-only and does not invoke engine --info/--help or any Bambu probe. It checks engine file presence, not engine version/resources; profile presence/locks, not fabrication suitability. Existing argv validation checks declared structure/cwd/mode, not whether installed Bambu accepts each option. Mesh/provenance limitations from the frozen README remain unchanged. No additional preflight guarantees are asserted.

No persistent cache/SLICE_KEY/history, stage/resource logging, known-slow rules, Job Builder, audit engine, worker selection, real Bambu/benchmark or printer operation is implemented. A request may run again; one-router busy guard does not provide exactly-once operation. Package destination behavior remains the existing backend's behavior; callers must supply the intended separate output folder. GUI integration/deployment is not part of this task.

PREFLIGHT PASS ≠ slice technical PASS. Execution SUCCESS ≠ technical PASS ≠ fabrication PASS ≠ audit PASS ≠ package PASS ≠ Physical PASS ≠ Author ACCEPT ≠ Print GO. PACKAGE_COMPLETE leaves Preview at AUTHOR_PREVIEW_CHECK. No mode grants Print GO.

STOP: **SLICE CONSOLE R0.1 MODE ROUTER — AUTHOR REVIEW**.
