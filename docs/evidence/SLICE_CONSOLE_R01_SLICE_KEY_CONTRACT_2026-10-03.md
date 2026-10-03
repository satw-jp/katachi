# SLICE_KEY contract design evidence — 2026-10-03
Scope: documentation only. Decision owner: Author. No acceptance self-assigned.

## Merge and isolation — PROVEN
PR #40 was OPEN/Draft, mergeable, base main, head `7914942383d8cc5ce8e4a48aa0b0d7a6cafb7b93`. Remote main was `abb045990e9384f1eb6bc51a5049d6efb685c08d`. Local comparison reported behind0/ahead1. Marked Ready, then normal merge with expected_head_sha equal to the verified head.

[PR #40](https://github.com/satw-jp/katachi/pull/40) is MERGED. Fetched main `2341bc8a952115a826956b970e6de2f98eeb57dd` has parents `abb045990e9384f1eb6bc51a5049d6efb685c08d` and `7914942383d8cc5ce8e4a48aa0b0d7a6cafb7b93`. Ancestor check succeeded. New isolated branch `agent/slice-console-r0.1-slice-key-contract` starts at that main. Old mode-router checkout was clean at accepted head and was not changed.

## Actual sources read
At merged main: AGENTS.md, docs/TEAM_PROTOCOL_CORE.md, docs/status/R5_SLICE_RUNNER_CURRENT.md, tools/slice-console/CONSOLE_CONTRACT.md, job.py, runner.py, slice_console package and both Console schemas; [A1 runbook](../fabrication/A1_BAMBU_CLI_RUNBOOK.md).
- Versions: Runner 0.2.0, job/result 0.2, Console 0.1.
- Ordered argv/input/profile expansion, cwd resolution and inherited os.environ with overrides are actual backend behavior.
- Mesh intended_transform is recorded, not applied. Exact input/profile locks exist; complete engine binary/resource/environment identities do not.
- Runbook route includes ordered printer/process settings, filament/nozzle/runtime maps and mesh assembly flags. This is bounded route evidence, not all-engine option classification.

## Original REPRO evidence read
Exact [REPRO_AUDIT_01 folder](https://drive.google.com/drive/folders/1S8kNkIUebY0ss0YnqBOciG39ryUvGl3v) from CURRENT, listed before fetching:
- [REPRO_AUDIT.md](https://drive.google.com/file/d/1qAZuthN7Ohb9dABDzfQs3khSsKY9kId_/view), modified 2026-09-20T09:36:53.638Z.
- [FINAL_CLASSIFICATION.json](https://drive.google.com/file/d/1fSR5XLZ4fPCVf0ymCyTPvcCCOtfYiW3f/view), modified 2026-09-20T09:35:01.972Z.
- [EXECUTION_DIFF.json](https://drive.google.com/file/d/1YV5Ar9thH554ewf8sa8TgMNMkU1yKgYQ/view), modified 2026-09-20T09:26:53.143Z.

Observed classification C: MINOR TOOLPATH NONDETERMINISM / FABRICATION SEMANTICS EQUIVALENT. Raw bytes and ordered canonical toolpath were not identical. Resolved settings were byte-identical (SHA `e6f38d9806fd3550e6523714c42728588f8f1ca7b81afb564a1773573fa447e8`, semantic diff0). Ordered motion differences in layers1–100; layers101–150 matched audited canonicalization. All46 filament changes matched audited count/sequence/switch-block/purge semantics; no meaningful fabrication difference found in that bounded comparison.

Engine path/version02.08.02.61, input3MF/geometry hash, normalized argv/cwd/datadir paths and TEMP/TMP matched. Executable SHA was null/UNKNOWN; full inherited environment NOT_SNAPSHOTTED; historical datadir contents UNKNOWN. Console vs Runner transport/window flags differed as recorded. Internal ordering cause was not identified. These facts do not establish complete execution closure, physical PASS or universal determinism.

## Design evidence and verification
[Contract](../fabrication/SLICE_KEY_CONTRACT_V0_1.md) separates observed facts, proposed v0.1 rules and unresolved classifications. S/D/N/I/C/W vectors are synthetic **design expectations only**, not executable tests or computed golden digests.

Documentation review: required nine deliverable topics, canonical serialization dimensions, incomplete fail-closed rule, per-field table, minimum mutation vectors and exact deferred implementation scope checked. Scoped diff check and repository pointer existence checked before commit. No backend/schema/test changes; existing 51-test router/35-test Runner evidence remains the accepted PR #40 evidence, not newly rerun results. Docs-only task requires no real engine test.

## Counts / limits
Real Bambu slice0; cache implementation0; REUSE implementation0; geometry/MINIL change0; printer send0; print0; Print GO change0. Engine launches in this task0. Key generation0; synthetic vector executions0.

No complete installation/resource/environment policy currently established; current jobs may HOLD. Cross-worker behavior unmeasured. Closure tooling, policy evidence and integration are FOLLOW-UP only. No next task started.

STOP: **SLICE CONSOLE R0.1 SLICE_KEY CONTRACT — AUTHOR REVIEW**
