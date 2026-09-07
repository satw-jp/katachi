# DEV Storage Migration — Finalization Sequence v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — FINALIZATION SEQUENCE

## Purpose

Finish the remaining C:\dev -> J:\dev migration work now that the major Katachi lanes have reached clean J-side checkpoints.

This task is a sequencing / migration task only. It does not authorize new product implementation, Support redesign, Performance v2, G/H/J, or speculative refactors.

## Current verified baseline

Major J-side lane cutovers are complete:

- HANA -> `J:\dev\worktrees\hana-viewport-context-topbar-v0`
- Team C -> `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- ART -> `J:\dev\worktrees\skin-art-research-principles-r3`
- Viewer -> `J:\dev\worktrees\fkei-analysis-viewer-v0`
- Team AB -> `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`
- canonical J clone -> `J:\dev\katachi`

Additional J-side preservation/staging already exists:

- `J:\dev\katachi-compute-helper-tray` staged
- `katachi-c-checkpoint` verified on J
- `katachi-support-coverage` verified on J
- `hikari2` verified on J
- `J:\dev\_preserve\astra-usagi`
- FIELD recovery artifacts preserved on J
- user-owned `samples` has been manually moved by the author to `J:\dev\samples`; treat `J:\dev\samples` as canonical user-owned input and do not reorganize/delete its contents.

AB Performance v1 is PASS/CLOSED at:

- branch: `agent/skin-a2-sparse-support-performance-v1`
- HEAD: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- no AB performance implementation is currently active

C-side `docs/infrastructure/` untracked user work remains protected and must not be silently committed, deleted, or folded into AB migration state.

## Required reading

1. this task
2. latest `docs/status/AB_CURRENT.md` front
3. latest `docs/status/C_CURRENT.md` front
4. `docs/tasks/DEV_STORAGE_MIGRATION_COMPUTE_HELPER_CONTROLLED_CUTOVER_V0.md`
5. `docs/tasks/DEV_STORAGE_MIGRATION_PRE_CLEANUP_LEDGER_REFRESH_V0.md`
6. `docs/protocol/LOCAL_DIRTY_WORK.md`

Do not preload unrelated lane history.

# Phase 1 — compute helper live runtime cutover

Execute the existing controlled cutover task:

`docs/tasks/DEV_STORAGE_MIGRATION_COMPUTE_HELPER_CONTROLLED_CUTOVER_V0.md`

with these current-state clarifications:

- AB Performance v1 is CLOSED; AB is no longer an active migration blocker.
- C implementation is STOPPED.
- `J:\dev\katachi-compute-helper-tray` is already staged and should be inspected, not overwritten.

Require before switch:

1. identify the exact live compute/helper process/workspace;
2. prove no active compute job/client request is in flight;
3. confirm source/runtime identity and local-only config needs;
4. verify J-side runtime source is complete;
5. controlled stop only of the identified C-side helper runtime;
6. start from J-side helper workspace;
7. verify endpoint/health parity and normal process stability;
8. switch launcher/autostart path only if ownership is clear;
9. keep C-side helper source unchanged for rollback.

If identity or idle state cannot be proven, STOP the whole sequence and report the exact blocker. Do not proceed to cleanup.

# Phase 2 — Team C connection / health verification after compute PASS

Only after Phase 1 PASS:

Use the J-side C workspace:

`J:\dev\worktrees\skin-field-vnext-interaction-v0`

Verify only the existing C-to-helper contract:

- C can reach the same intended compute/helper endpoint;
- helper health/status is good;
- C route launches normally from J;
- any C-specific local runtime setting still resolves correctly;
- no normal C runtime path requires `C:\dev\katachi-compute-helper-tray`;
- do not change compute semantics or endpoint design if existing parity already works.

If a local path/config change is genuinely required for the J-side runtime, keep it infrastructure-only and bounded. Do not alter Production/FIELD/Support semantics.

If C cannot connect after an otherwise healthy J-side helper cutover, STOP and report. Do not proceed to destructive cleanup.

# Phase 3 — historical workspace authority closeout

Read-only classify remaining historical C-side project workspaces, especially integration / CUDA / reinforcement / recovery variants not already moved or preserved.

For each remaining workspace, assign exactly one final category:

- `REMOTE_RECONSTRUCTABLE` — exact useful state is already reachable from GitHub and no local-only content matters;
- `PRESERVE_TO_J` — contains local-only source/artifact/config with plausible future value; preserve non-rebuildable bytes to a clearly named J location;
- `USER_OWNED` — user-controlled input/reference data; do not modify contents;
- `CACHE_REBUILDABLE` — node_modules/build/dist/cache/temp only;
- `DISCARD_CANDIDATE` — redundant local copy whose useful state is already protected on J/GitHub;
- `AUTHORITY_UNRESOLVED` — cannot safely decide; record exact reason and block final destructive cleanup for that item.

Do not treat names like CUDA/integration/reinforcement as proof of value or lack of value.

Do not commit historical dirty state merely to make migration easy.

For small clearly valuable local-only files, preserve them to J with verification. For large trees, use file count/size/copy verification instead of hashing every file.

User-owned samples:

- canonical path is `J:\dev\samples`;
- do not copy back to C;
- do not rename/reorganize/delete contents;
- if `C:\dev\samples` still exists, classify only after confirming the author-completed move and whether C is merely an old copy.

# Phase 4 — final cleanup readiness audit

After Phases 1–3, inventory remaining `C:\dev` content that is related to Katachi/FUKEI/Hikari/SKIN/HANA/ART/Viewer/compute.

For each remaining path, record:

- path
- owner / role
- whether authoritative state exists on J/GitHub
- whether local-only bytes remain
- whether any process still uses it
- cleanup disposition: KEEP / DELETE_CANDIDATE / BLOCKED

Specifically include:

- `C:\dev\katachi` primary repo
- linked C-side worktrees
- old HANA/C rollback worktrees
- C-side compute helper source
- historical independent repos/workspaces
- `docs/infrastructure/` user work
- node_modules/build/dist/cache trees
- `.tmp.driveupload` / `.tmp.drivedownload`

Important:

- `.tmp.driveupload` / `.tmp.drivedownload` remain non-project/DriveFS-sensitive until ownership and active-handle status are understood. Do not delete them merely because they are temporary-looking.
- do not delete `docs/infrastructure/` user work.
- do not prune/repair primary C Git worktree topology in this task.

# Phase 5 — cleanup recommendation only, not bulk deletion

This task does NOT bulk-delete `C:\dev`.

Return an exact deletion plan split into:

1. SAFE TO DELETE AFTER USER APPROVAL
2. KEEP AS ROLLBACK FOR NOW
3. BLOCKED / AUTHORITY UNRESOLVED
4. NON-PROJECT / HANDLE-OWNERSHIP REVIEW

Only clearly rebuildable cache/temp content may be marked safe. No deletion in this task unless an already-authorized subtask explicitly allows it.

## Hard prohibitions

Do not:

- start AB Performance v2;
- run G/H/J;
- implement Outside->Outside/body-anchored Support;
- modify Production/FIELD/HANA/ART/Viewer semantics;
- delete C primary repo/worktrees;
- delete C-side rollback copies;
- commit/delete `docs/infrastructure/` user work;
- delete/reorganize `J:\dev\samples`;
- force-push, reset, rebase, stash, prune, or repair worktrees;
- delete DriveFS temp data without ownership proof.

## Output

Return only:

```text
Overall SOL review用:

compute live cutover: <PASS/FAIL + C old runtime -> J runtime summary>
compute endpoint/health parity: <PASS/FAIL>
Team C J->compute connection: <PASS/FAIL + concise evidence>
old C compute path required by normal runtime?: <YES/NO>
historical workspaces REMOTE_RECONSTRUCTABLE: <summary>
historical workspaces PRESERVE_TO_J: <summary>
historical workspaces USER_OWNED: <summary>
historical workspaces CACHE_REBUILDABLE: <summary>
historical workspaces DISCARD_CANDIDATE: <summary>
historical workspaces AUTHORITY_UNRESOLVED: <summary>
user samples canonical path: <J path + verification>
C primary repo cleanup readiness: <READY/BLOCKED + reason>
C linked worktree cleanup readiness: <READY/BLOCKED + reason>
C-side rollback copies: <summary>
DriveFS temp ownership status: <summary>
SAFE TO DELETE AFTER USER APPROVAL: <summary>
KEEP AS ROLLBACK FOR NOW: <summary>
BLOCKED / AUTHORITY UNRESOLVED: <summary>
NON-PROJECT / HANDLE-OWNERSHIP REVIEW: <summary>
all migration-critical state protected on J/GitHub?: <YES/NO>
final destructive cleanup safe now?: <YES/NO>
blocker: <NONE or concise list>
```

STOP for Overall SOL review. Do not start Performance v2 or bulk-delete C:\dev.
