# DEV Storage Migration — Remaining Safe Stage v1

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — SAFE REMAINING MIGRATION WHILE AB ACTIVE

## Purpose

Continue the C: -> J: development-environment migration after the successful J primary-clone stage and HANA cutover, while preserving the currently active AB performance task.

Current migration facts at task creation:

- `J:\dev\katachi` exists as the canonical J-side clone and was verified clean;
- HANA has completed J cutover to `J:\dev\worktrees\hana-viewport-context-topbar-v0`;
- C FIELD vNext Interaction Correctness is PASS / CLOSED and C is STOPPED for 2026-09-07;
- AB A2 Sparse Support Performance v0 is ACTIVE and must not be disturbed;
- C originals remain retained for rollback/evidence;
- no C-side deletion is authorized by this task.

Re-read latest CURRENT fronts before execution. If state has advanced, preserve the newer authority.

## Required reading

1. this task
2. latest `docs/status/AB_CURRENT.md` front
3. latest `docs/status/C_CURRENT.md` front
4. `docs/tasks/DEV_STORAGE_MIGRATION_COMPUTE_HELPER_CONTROLLED_CUTOVER_V0.md`
5. `docs/tasks/DEV_STORAGE_MIGRATION_PRESERVATION_LEDGER_V0.md`
6. `docs/protocol/LOCAL_DIRTY_WORK.md`

Do not preload unrelated project philosophy or lane history.

## Hard boundary — AB remains active

Do not touch, stop, switch, move, clean, reset, rebase, stash, prune, repair, or otherwise alter:

- the active AB performance worktree/process;
- A2 benchmark/runtime state;
- AB Candidate / Support / Rabbit / exporter/validator semantics;
- any branch/worktree whose ownership is uncertain but may be used by AB;
- the active A2 physical-print artifact/printer workflow.

If a path/process may be used by AB and this cannot be disproven cheaply, classify it `DEFER — AB ACTIVE`.

## Phase 0 — refresh J primary clone safely

If `J:\dev\katachi` is clean and no process is using its checked-out `main` for active work:

- fetch `origin`;
- fast-forward local `main` to latest `origin/main` only;
- verify remote, HEAD, clean state.

Do not rebase/reset/clean. If local main is not a clean fast-forward case, report and leave it unchanged.

Existing J-local worktrees such as HANA must not be rewritten merely because main advances.

## Phase 1 — compute helper controlled cutover or staging

Execute the gates from:

`docs/tasks/DEV_STORAGE_MIGRATION_COMPUTE_HELPER_CONTROLLED_CUTOVER_V0.md`

with one current-state clarification:

- AB performance is ACTIVE now.

Therefore:

1. identify the actual running compute/helper process/workspace;
2. determine whether AB performance currently depends on it;
3. if AB uses it, an active request exists, or idle state is uncertain: prepare a verified J-side source/runtime staging copy only, do **not** stop the C runtime, and report `CUTOVER DEFER — AB ACTIVE`;
4. only if helper identity is proven and no active AB/C/client workload depends on it may the controlled stop/start to J proceed;
5. keep the C source/runtime copy for rollback.

Do not run a large AB benchmark merely to test the migrated helper.

## Phase 2 — stage independent reconstructable repos on J

Inspect and stage only independent repos/workspaces that do not share `C:\dev\katachi\.git` and are not active.

Known candidates include:

- `C:\dev\katachi-c-checkpoint`
- `C:\dev\katachi-support-coverage`
- `C:\dev\hikari2`
- `C:\dev\katachi-compute-helper-tray` if Phase 1 proves it independent
- any other preservation-ledger category D/B independent repo that is clearly inactive and safe

For each candidate:

- record source repo type, remote, branch, HEAD, clean/dirty state;
- require clean state for a normal fresh-clone reconstruction;
- prefer fresh clone / exact remote ref recreation under `J:\dev\<name>`;
- if the J target already exists, inspect exact state and do not overwrite;
- verify intended HEAD/reachability and clean state after staging;
- do not copy `node_modules`, dist/build outputs, browser caches, or generic package caches;
- leave C original unchanged.

If a clean unique ref classified `PRESERVE REMOTELY` is still not remotely reachable and exact ownership is unambiguous, preserve it according to the existing ledger rules. Never force-push.

## Phase 3 — preserve independent local-only files/artifacts

C implementation is stopped today, so non-active local-only workspaces may be preserved if ownership is clear and they are not linked AB state.

Candidates include:

- `C:\dev\astra-usagi`
- `C:\dev\samples`
- `C:\dev\field-vnext-checkpoint-recovery`
- independent recovery artifacts/configs identified by the preservation ledger

For each:

1. classify normal directory / independent Git repo / linked worktree;
2. do not copy path-bound linked-worktree `.git` metadata as if canonical;
3. preserve non-reconstructable source/artifact/config bytes under `J:\dev\_preserve\<name>` or another clearly named J-local preservation path;
4. exclude clearly rebuildable `node_modules`, dist/build/cache/temp where safe;
5. record source/destination, broad contents, file count/size, and verification;
6. use hashes for small critical files where cheap; use copy verification/counts for large trees.

For historical dirty linked worktrees, do not move them. If ownership is clear and they are inactive, preserve only a non-mutating reproduction package (branch/HEAD/status, tracked patch, required untracked files, manifest). Otherwise leave them on C and report `DEFER / SOL REVIEW`.

## Phase 4 — do not clean/delete C yet

Do not delete, move, rename, clean, or prune any C original in this task.

In particular do not touch/delete:

- `C:\dev\katachi` primary repo or its linked-worktree topology;
- active AB worktree/process;
- retained C HANA workspace;
- `.tmp.driveupload` or unknown DriveFS staging/temp ownership;
- owner-ambiguous local-only states.

Rebuildable caches may be listed for a later cleanup gate but not deleted now.

## Output

Return only:

```text
Overall SOL review用:

J primary main refresh: <PASS / NOT NEEDED / DEFER + SHA>
compute helper identity: <summary>
compute J staging/cutover: <STAGED / CUTOVER PASS / DEFER + reason>
independent repos staged on J: <summary>
local-only workspaces preserved on J: <summary>
remote refs newly preserved: <summary>
items deferred due AB ACTIVE: <summary>
items deferred due dirty/authority ambiguity: <summary>
C originals deleted?: NO
remaining C-side items before final cutover: <summary>
remaining blockers for final cleanup: <summary>
remaining safe migration stage complete?: YES/NO
```

## Done when

Every currently safe, independent, non-AB item has either been verified as already reconstructable, staged/preserved on J, or explicitly classified as deferred with a reason; the active AB task remains untouched; and no C original has been deleted.

STOP for Overall SOL review. Do not proceed into AB worktree cutover or final C cleanup.