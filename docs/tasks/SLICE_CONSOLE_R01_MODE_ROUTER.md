# Slice Console R0.1 — Mode Router Contract + Backend Adapter

Decision owner: Author. Status: implementation complete / AUTHOR REVIEW pending.

Authority: Author accepted baseline PR #39 and authorized Ready + SHA-conditioned normal merge. PR #39 merged as `abb045990e9384f1eb6bc51a5049d6efb685c08d`, retaining baseline `5e0f8d6ad0c5177ab240654cb45f78ef4958d8c8` as parent/ancestor. Use that fetched main as this task's base. Worktree branch: `agent/slice-console-r0.1-mode-router`. No changes on baseline branch or operational Drive source.

## Definition of Done

1. Verify PR #39 head/state/base/mergeability, merge using normal merge with expected head SHA, and verify new main/ancestry/version.
2. New isolated worktree from updated main; versioned Console request/result above existing job/manifest.
3. Shared core router and thin CLI for PREFLIGHT/FULL_SLICE/AUDIT_ONLY/PACKAGE_ONLY/REUSE.
4. Unchanged Runner and package delegation; no execution-to-Print PASS promotion or implicit fallback.
5. Required fake/synthetic tests and existing 35-test regression; record per-test engine starts.
6. Dedicated branch/commit/evidence, then STOP for Author review.

Exact contract: [CONSOLE_CONTRACT](../../tools/slice-console/CONSOLE_CONTRACT.md). Implementation: new `slice_console/` package. Tests: new `tests/test_console.py`. Evidence: [mode-router evidence](../evidence/SLICE_CONSOLE_R01_MODE_ROUTER_2026-10-03.md).

Protected: all frozen backend/source/test/sample files, existing jobs/manifests/artifacts/shortcuts/processes, geometry/MINIL, physical/printer/Print GO states. Out of scope: SLICE_KEY/cache, resource/stage logging, history, known-slow, Job Builder, auditor, worker selection, benchmarks, real Bambu slice. Scope-out findings are FOLLOW-UP only; do not start subsequent tasks.

STOP: **SLICE CONSOLE R0.1 MODE ROUTER — AUTHOR REVIEW**.
