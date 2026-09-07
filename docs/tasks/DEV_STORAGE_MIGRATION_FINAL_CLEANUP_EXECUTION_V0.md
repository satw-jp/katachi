# DEV Storage Migration — Final Cleanup Execution v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — EXACT-PATH DESTRUCTIVE CLEANUP AFTER AUTHOR APPROVAL

## Purpose

Execute the final approved destructive cleanup of redundant C-side development copies now that all migration-critical project authority is protected on J: and/or GitHub.

This task is destructive. Delete only the exact approved paths/categories below. Do not broaden scope by pattern, parent-directory cleanup, worktree pruning, or convenience deletion.

## Preconditions

Before deleting anything, re-read:

1. latest `docs/status/AB_CURRENT.md`
2. latest `docs/status/C_CURRENT.md`
3. latest `docs/status/HANA_CURRENT.md`
4. latest `docs/status/ART_CURRENT.md`
5. latest `docs/status/VIEWER_CURRENT.md`
6. `docs/tasks/DEV_STORAGE_MIGRATION_FINAL_CLEANUP_GATE_V0.md`
7. `docs/tasks/DEV_STORAGE_MIGRATION_HISTORICAL_AUTHORITY_RESOLUTION_V0.md`

Require:

- no active project process using any approved-delete source path;
- J canonical clone and migrated worktrees remain present;
- compute helper live runtime remains healthy from J;
- no newer local-only state has appeared in an approved-delete repo since the cleanup manifest was produced.

If any approved-delete path became dirty, active, or contains newer local-only state, STOP that item and report it. Do not stash/commit/reset/clean to make deletion possible.

## Author-approved deletion scope

Overall SOL authorizes deletion of the exact redundant C-side items in these categories.

### A. DELETE_READY_REMOTE

These repositories were verified clean and exactly reconstructable from remote refs with no local-only state:

- `C:\dev\katachi-cuda-shadow`
- `C:\dev\katachi-current-integration`
- `C:\dev\katachi-final-integration`
- `C:\dev\katachi-sparse-support-v0`
- `C:\dev\katachi-cuda-geometry`
- `C:\dev\katachi-cuda-integration`
- `C:\dev\katachi-permanent-reinforcement`
- `C:\dev\katachi-stage6-performance`

Before deleting each repo, cheaply re-confirm clean state and exact remote reachability. If that check fails, skip that repo and report it.

### B. DELETE_READY_J_VERIFIED

These C-side copies have verified J replacements/preservation:

- `C:\dev\katachi-compute-helper-tray`
- `C:\dev\katachi-c-checkpoint`
- `C:\dev\katachi-support-coverage`
- `C:\dev\hikari2`
- `C:\dev\astra-usagi`
- `C:\dev\field-vnext-checkpoint-recovery`

For `katachi-compute-helper-tray`, first verify the live helper still runs from `J:\dev\katachi-compute-helper-tray` and `127.0.0.1:47658/v1/capabilities` still responds successfully. If not, do not delete the C copy.

### C. CACHE_DELETE_READY

Delete only the previously enumerated rebuildable `node_modules` and `dist` directories under retained C primary/worktree paths when they are not in use.

Do not infer additional cache paths from names. Use the exact 14-path cache manifest produced by the final cleanup gate. If that exact list is not available in execution context, STOP cache deletion rather than discovering and deleting broadly.

## Explicit KEEP / DO NOT DELETE

Do not delete, move, rename, prune, repair, clean, or mutate:

### USER_OWNED

- `C:\dev\samples`
- `C:\dev\katachi\docs\infrastructure\`

These are user-owned/local-only material. `J:\dev\samples` is the canonical future samples path, but this task does not delete the old C counterpart.

### KEEP_ROLLBACK_TEMPORARILY

- `C:\dev\katachi`
- `C:\dev\worktrees\hana-projection-redraw-v0`
- `C:\dev\worktrees\hana-viewport-context-topbar-v0`
- `C:\dev\worktrees\skin-c-external-stl-host-retention-v0`
- `C:\dev\worktrees\skin-c-field-vnext-restore-v0`
- `C:\dev\worktrees\skin-c-golden-baseline`
- `C:\dev\worktrees\skin-c-production-ui-ia-v0`

Reasons include retained rollback topology, dirty rollback evidence, and user-owned content inside the primary repo. Do not run `git worktree prune/remove/repair` in this task.

### DRIVEFS_REVIEW

- `C:\dev\.tmp.driveupload`
- `C:\dev\.tmp.drivedownload`

Ownership/handle semantics remain unresolved. Do not delete them here.

## Execution method

For each approved whole-directory deletion:

1. verify exact path;
2. verify it is not a symlink/junction unexpectedly targeting another location;
3. verify no relevant project process has that path open when cheaply detectable;
4. perform deletion of that exact path only;
5. verify the path no longer exists;
6. record reclaimed size from the pre-delete manifest, not by expensive post-delete inference.

Do not use wildcard parent deletion such as deleting all of `C:\dev\katachi-*`.
Do not delete `C:\dev\worktrees` as a whole.
Do not delete `C:\dev\katachi` primary repo.

## Post-delete verification

After approved deletion set completes:

- verify J canonical clone still exists and is clean;
- verify migrated HANA/C/ART/Viewer/AB worktrees remain present;
- verify J compute helper health remains PASS;
- verify `J:\dev\samples` exists;
- verify all KEEP paths above still exist unless they did not exist before execution;
- report any approved path that could not be deleted and why.

Do not start Performance v2, G/H/J, new Support work, C durability work, HANA hardware work, ART R4, or Viewer expansion from this task.

## Output

Return only:

```text
Overall SOL review用:

DELETE_READY_REMOTE deleted: <paths + PASS/SKIP>
DELETE_READY_J_VERIFIED deleted: <paths + PASS/SKIP>
CACHE_DELETE_READY deleted: <count/size or SKIPPED + reason>
user-owned paths untouched?: <YES/NO>
rollback paths untouched?: <YES/NO>
DriveFS temp untouched?: <YES/NO>
J canonical/worktrees healthy after cleanup?: <YES/NO + summary>
J compute helper health after cleanup?: <PASS/FAIL>
J samples present?: <YES/NO>
estimated reclaimed size: <summary>
approved paths remaining on C: <summary/NONE>
unexpected blocker: <NONE or one line>
final approved cleanup execution complete?: <YES/NO>
```

STOP. Any later cleanup of the retained C primary/worktree topology, user-owned material, or DriveFS temp requires a separate explicit Overall SOL task and author approval.
