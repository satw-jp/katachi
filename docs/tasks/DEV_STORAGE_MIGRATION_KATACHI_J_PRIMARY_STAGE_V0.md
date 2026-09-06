# DEV Storage Migration — Katachi J: Primary Stage v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — STAGE ONLY WHILE AB/C ACTIVE

## Purpose

Prepare a new canonical local development clone at `J:\dev\katachi` today so that development can switch to J: from the next work session, without disturbing currently running AB/C work on C:.

This is a staged handover, not a destructive move.

## Core rule

Do **not** copy or move the active `C:\dev\katachi` directory wholesale.

The current C: workspace owns/participates in linked worktree metadata with absolute paths, so a raw directory copy is not a safe migration method.

Instead:

1. leave all active C: worktrees untouched today;
2. create a fresh clone of `satw-jp/katachi` at `J:\dev\katachi` from the remote;
3. verify the J: clone independently;
4. after AB/C workers finish and push their refs, fetch those exact refs into the J: clone;
5. recreate only the needed future worktrees on J: from pushed refs;
6. keep all C: originals until J: operation is verified over at least one real work session.

## Required reading

1. this task
2. `docs/tasks/DEV_STORAGE_MIGRATION_PARTIAL_SAFE_STAGE_C_TO_J_V0.md`
3. `docs/tasks/DEV_STORAGE_MIGRATION_PRESERVATION_LEDGER_V0.md`

Do not preload unrelated lane history unless a concrete migration dependency appears.

## Preconditions

Before any J-side write:

- confirm `J:\dev` is a normal local development filesystem and not inside Google Drive / DriveFS;
- confirm `J:\dev\katachi` does not already contain an unrelated or authoritative workspace;
- confirm AB and C active work remains on C: and must not be stopped, switched, reset, rebased, or cleaned by this task.

If `J:\dev\katachi` already exists, inspect and STOP rather than overwrite.

## Phase 1 — create fresh J: primary clone

While AB/C continue running on C::

1. record current remote `main` SHA;
2. create a fresh clone at `J:\dev\katachi`;
3. checkout/fetch `main` normally;
4. verify:
   - remote is the expected `satw-jp/katachi`;
   - `main` resolves to the recorded remote SHA;
   - working tree is clean;
   - no `.git/worktrees` metadata points back into `C:\dev` merely because of copying;
   - no Google Drive/DriveFS path is involved;
5. do not install/copy old `node_modules`; dependencies may be installed later as needed from lockfiles.

This phase may run while AB/C active because it reads from the remote, not from active local Git metadata.

## Phase 2 — prepare tomorrow's switch

Do not recreate AB/C worktrees yet if their current work is still active or not pushed.

Instead, record a switch checklist for the next session:

1. wait for each active worker to finish its bounded task and return branch + exact pushed commit;
2. verify each required commit is remotely reachable;
3. in `J:\dev\katachi`, fetch the remote refs;
4. recreate required lane worktrees under J: using new J-local paths;
5. verify each recreated worktree branch/HEAD/clean state;
6. start the next task only from the J: path.

Do not infer missing active work from C: if it has not been pushed. Dirty/unpushed state remains a migration blocker for that specific lane.

## Tomorrow-use policy

After Phase 1 PASS, `J:\dev\katachi` is the preferred base for **new work starting after current AB/C tasks close**, subject to exact branch/ref recreation.

Do not start a new task in the old C: workspace merely for convenience once its required branch has been safely recreated on J:.

Existing tasks already running on C: may finish there; do not mid-task switch them.

## C: retention

Do not delete, move, rename, clean, prune, or repurpose:

- `C:\dev\katachi`
- any linked C: worktree
- any AB/C active worktree
- old local-only preservation material

C: remains rollback/evidence storage until Overall SOL explicitly approves final cleanup after J-side verification.

## Verification / output

Return:

```text
Overall SOL review用:

J target: <PASS / STOP>
J primary clone path: <path>
remote: <url/name>
remote main SHA staged: <sha>
J working tree: <clean / other>
C active AB/C touched?: NO
raw C repo copied/moved?: NO
existing J target conflict?: <NONE / details>
ready to use J for new work after active tasks finish?: YES/NO
lanes still blocked by unpushed local work: <summary>
C originals retained?: YES
```

## Hard prohibitions

Do not:

- copy `C:\dev\katachi\.git` into J as migration;
- move/rename `C:\dev\katachi`;
- stop or modify AB/C active jobs;
- use `git worktree repair/prune/remove` on the C-side topology;
- reset/rebase/stash/clean active work;
- delete C originals;
- create new J worktrees from local-only refs that are not remotely preserved;
- place the new dev clone under `J:\My Drive` or another synced DriveFS namespace.

## Done when

A fresh, independently valid `J:\dev\katachi` clone exists and is verified, while current AB/C work remains untouched on C:, and the next-session procedure for recreating pushed lane refs/worktrees on J: is explicit.
