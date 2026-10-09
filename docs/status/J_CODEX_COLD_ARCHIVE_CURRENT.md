# J CODEX Cold Archive — CURRENT

**Checkpoint:** 2026-10-09 JST / READ-ONLY AUDIT PUBLISHED.  
**State:** `RETIREMENT_NOT_AUTHORIZED / LOCAL_AUDIT_PENDING`.

This is an evidence and routing front, **not** a Windows filesystem scan, verified D backup, deletion allowlist, or authorization to alter Google Drive. The published seed audit found **zero** paths eligible for `SAFE_TO_COLD_ARCHIVE_AND_RETIRE_FROM_J`; it does **not** infer that all other paths must permanently remain on J. Do not update those classifications from date alone.

## Read in order

1. [Read-only audit and path exceptions](../evidence/J_CODEX_COLD_ARCHIVE_AUDIT_20261009.md)
2. [Machine-readable four-class seed inventory](../evidence/J_CODEX_COLD_ARCHIVE_AUDIT_20261009.json)
3. [Next bounded task — one-shot local read-only audit](../tasks/J_CODEX_BULK_LOCAL_AUDIT_HANDOFF_20261009.md)

## Decision

- **NO** to automatically retiring all directories before `2026-10-09` from `J:\My Drive\codex`, even after a D file-copy/hash check.
- **YES** to a future bulk, job-level classification with protected exceptions; avoid asking the Author to inspect every folder.
- Known old-date dependencies include current MINIA source files, the editable 3MF/successful G-code baseline, MINIL input and repaired CAD, Large exact artifacts, and Git/worktree/runtime dependencies.
- Verify Drive for desktop stream/mirror and pending sync *before* any separate storage action. A D byte copy does not preserve cloud file IDs, revisions, Git worktree relationships or live path bindings.
- The next task is **read-only only**: no copy, move, delete, rename, Git changes, Drive changes, sync changes or process stopping. Return `DATE_SUMMARY.json`, `JOB_CLASSIFICATION.json`, `KEEP_EXCEPTIONS.json`, `REFERENCE_EDGES.json`, `LOCAL_STATE_GAPS.md`. Unknown jobs remain HOLD while unrelated jobs can be classified.

## One-line handoff for the organizing chat

`satw-jp/katachi の docs/status/J_CODEX_COLD_ARCHIVE_CURRENT.md を読み、リンク先のread-only一括実機監査で J:\My Drive\codex の旧日付をjob単位に4分類し、KEEP例外・一括候補・未確認と容量を返してください（コピー・移動・削除・Git/Drive変更は禁止）。`

**Next gate:** `J CODEX COLD ARCHIVE — READ-ONLY CLASSIFICATION READY / NO DATA MUTATION`.
