# Slice Console R0.1 mode router — evidence

Recorded: 2026-10-03 JST. Decision owner: Author. Gate: **SLICE CONSOLE R0.1 MODE ROUTER — AUTHOR REVIEW**.

## Base / preservation

PR #39 was rechecked as Draft/OPEN, base main, mergeable, exact head `5e0f8d6ad0c5177ab240654cb45f78ef4958d8c8`; marked Ready; merged by normal merge with expected_head_sha. GitHub confirmed MERGED. Fetched main is `abb045990e9384f1eb6bc51a5049d6efb685c08d`, a two-parent merge of prior main `b5422dbbf937eca8b3fb7781978c7c9fed3a8262` and baseline head. Baseline is an ancestor; tools/slice-console exists with Runner 0.2.0 / job and result schemas 0.2.

New isolated worktree: `work/katachi-mode-router`; branch `agent/slice-console-r0.1-mode-router`. Base clone: `work/katachi-router-base`. The old baseline checkout remains at its original head and clean; no reset/rebase/clean/force update or operational Drive changes. All 29 frozen source/tests/sample files match both baseline manifest SHA-256 and fetched-main Git blobs. The Console package is added above them; none were edited.

## Change / contract

New files: `tools/slice-console/slice_console/{__init__,contract,router,console}.py`, two request/result JSON schemas, `CONSOLE_CONTRACT.md`, `tests/test_console.py`; bounded task/evidence and CURRENT pointer. Console schema 0.1 is distinct from backend schema 0.2. Detailed [request/result and CLI contract](../../tools/slice-console/CONSOLE_CONTRACT.md).

Request fields: schema_version, request_id, mode, inputs. Exact absolute job/artifact pointers and strict per-mode inputs; no latest-run search. Result fields: schema_version, request_id, requested_mode, status, backend_invoked, engine_started, run_dir, result_manifest_path, package_result_path, package_path, reason, blocker, validation, started_at, finished_at. Malformed requests return terminal HOLD with nullable unresolved correlation fields. Console timestamps are UTC; backend timestamps remain untouched.

| Mode | Exact behavior | Engine |
|---|---|---|
| PREFLIGHT | load_job + existing validate_job; static checks PASS/HOLD, failed checks STATIC_VALIDATION_FAILED | 0 |
| FULL_SLICE | existing SliceRunner; argv/job/profile/geometry/manifest unchanged, pointer to backend result; SUCCESS/FAILED/CANCELLED preserved | backend only |
| PACKAGE_ONLY | existing package_gcode; context, CRC, expanded bytes/SHA equality, PACKAGE_RESULT retained; PACKAGE_COMPLETE/PACKAGE_FAILED | 0 |
| AUDIT_ONLY | HOLD / AUDITOR_NOT_CONNECTED, no artifact read or fallback | 0 |
| REUSE | HOLD / CACHE_NOT_IMPLEMENTED, no search/read/re-slice fallback | 0 |
| Unknown | HOLD / UNKNOWN_MODE; malformed/version/field/path contract INVALID_REQUEST | 0 |

Shared synchronous ConsoleRouter.run is used by the thin CLI and available to GUI/AI. GUI can use a worker thread, unchanged event queue and delegated cancel. No GUI redesign/integration was done. One-instance busy guard returns ROUTER_BUSY; it is not persistent deduplication. stdout is UTF-8 JSON; optional result writes a new file named CONSOLE_RESULT.json without overwriting backend results. Errors in static read/backend dispatch return HOLD/BACKEND_ERROR unless actual engine start already occurred, in which case failure remains FAILED.

## Tests / engine launch counts

Windows 11 / bundled Python 3.12.14: **PASS 51 / SKIP 0 / FAIL 0**. Includes unchanged 35 backend regression tests and 16 new Console tests. Existing schema 0.1 compatibility, native/standalone equality, input fail-closed, manifest identity, package regression and Windows startup fixtures remain passing. New full-slice fixtures exercise SUCCESS, exit7 FAILED and Cancel plus busy rejection; wrapper never adds printable/Print GO approval. [Full test output](SLICE_CONSOLE_R01_MODE_ROUTER_2026-10-03/MODE_ROUTER_TESTS.txt).

Each new test instruments actual subprocess.Popen entry into the unchanged backend. These counts concern fake engine launches only (not CLI wrapper processes or original regression suite process totals). Invalid lock/profile/mesh subcases each assert zero; context/hash package failure subcases each assert zero.

| New Console test | Engine launches |
|---|---:|
| `test_audit_hold_no_engine_or_artifact_selection` | 0 |
| `test_cli_backend_result_name_refuses_dispatch` | 0 |
| `test_cli_existing_result_refuses_dispatch` | 0 |
| `test_cli_invalid_json_writes_hold_without_engine` | 0 |
| `test_cli_preflight_and_request_json_share_router_and_write_result` | 0 |
| `test_full_slice_backend_failure_remains_failed` | 1 |
| `test_full_slice_cancel_and_busy_preserve_backend_events` | 1 |
| `test_full_slice_delegates_one_fake_engine_preserves_manifest` | 1 |
| `test_full_slice_invalid_job_no_engine` | 0 |
| `test_invalid_contract_fail_closed` | 0 |
| `test_package_missing_context_or_wrong_hash_fails_no_engine` | 0 |
| `test_package_only_identity_no_engine` | 0 |
| `test_preflight_invalid_lock_profile_mesh_hold_no_engine` | 0 |
| `test_preflight_pass_no_engine` | 0 |
| `test_reuse_hold_no_engine_or_artifact_selection` | 0 |
| `test_unknown_mode_fail_closed` | 0 |

Separately, all five `python -m slice_console.console` subcommands were executed against temporary synthetic fixtures: PREFLIGHT PASS/false/exit0, FULL_SLICE SUCCESS/true/exit0, PACKAGE_ONLY PACKAGE_COMPLETE/false/exit0, AUDIT_ONLY HOLD/false/exit2, REUSE HOLD/false/exit2. FULL_SLICE launched one additional Python fake CLI; backend pointers existed at verification time. [CLI smoke summary](SLICE_CONSOLE_R01_MODE_ROUTER_2026-10-03/MODE_ROUTER_CLI_SMOKE.json). The temporary CLI fixtures are removed after verification; this summary does not point to durable real-run artifacts.

JSON schemas are valid parsed JSON with version/closed-object definitions, and standard-library runtime contracts are tested. Independent JSON Schema meta-validation was NOT RUN because no validator library is installed; no dependency installation was introduced. [Verification and per-test launch counts](SLICE_CONSOLE_R01_MODE_ROUTER_2026-10-03/VERIFICATION.json).

## Known limitations / FOLLOW-UP

Static PREFLIGHT delegates the existing output availability temporary write probe; it is not wholly read-only. It does not inspect installed CLI options or certify engine/profile suitability. Input/provenance/static-mesh coverage and native/legacy lock-coverage limits remain exactly the frozen backend's limits. No bounded engine probe is implemented.

Execution SUCCESS is exit0, not complete technical/fabrication/audit/physical/Author/Print GO acceptance. PACKAGE_COMPLETE leaves AUTHOR_PREVIEW_CHECK. Existing backend package destination semantics are unchanged; explicitly choose the intended separate output folder. Correlation request_id is not idempotence. Cross-router/process deduplication, cache, persistent orchestration, GUI integration and deployment remain out of scope.

DoD review: **pass** for the bounded implementation/evidence handoff; Author review pending. No blocking failure remains. Scope-out improvements are FOLLOW-UP recommendations only.

## Next one task candidate — not started

**SLICE_KEY CONTRACT DESIGN ONLY** after Author accepts this router: specify canonical key inputs/versioning (exact geometry/profile bytes, engine/resources, effective argv, cwd/datadir/env semantics and backend identity), uncertainty handling and synthetic equality/change cases. Treat key equality as requested-execution identity, not byte-deterministic G-code or Print PASS. No cache/history or real engine work; return one reviewed contract before implementation.

## Stop

**SLICE CONSOLE R0.1 MODE ROUTER — AUTHOR REVIEW**.

SLICE_KEY/cache/stage timing/resources/history/known-slow/Job Builder/auditor/worker selection/benchmark not implemented. Real Bambu slice 0; geometry changes 0; MINIL changes 0; printer send 0; print 0; Print GO changes 0. Original Runner/jobs/shortcuts/processes unchanged. Router PR is for review, not automatic merge or next-task authorization.
