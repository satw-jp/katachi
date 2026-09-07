# DEV Storage Migration — Final C:\dev Cleanup Gate v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — FINAL DESTRUCTIVE CLEANUP PREP / USER APPROVAL REQUIRED

## Purpose

Close the C:\dev -> J:\dev migration by proving exactly which C-side development copies are redundant and safe to remove, while preserving user-owned data, unresolved DriveFS/temp ownership, and any rollback state that still has a concrete reason to remain.

This task is the final cleanup gate. It MUST NOT perform bulk deletion until the author explicitly approves the exact deletion set returned by this task.

## Current migration facts to re-verify

At task creation, the following are already reported PASS:

- J canonical clone: `J:\dev\katachi`
- HANA J cutover + smoke
- Team C J cutover + runtime bootstrap
- ART J cutover + smoke
- Viewer J cutover + smoke
- Team AB J cutover + smoke
- compute/helper live runtime cutover to `J:\dev\katachi-compute-helper-tray`
- Team C J -> compute connection/health
- user-owned samples canonical path: `J:\dev\samples`
- `astra-usagi` and FIELD recovery artifacts preserved on J
- independent repos `katachi-c-checkpoint`, `katachi-support-coverage`, `hikari2` verified on J
- historical repos below are REMOTE_RECONSTRUCTABLE at exact refs:
  - `katachi-cuda-shadow`
  - `katachi-current-integration`
  - `katachi-final-integration`
  - `katachi-sparse-support-v0`
  - `katachi-cuda-geometry`
  - `katachi-cuda-integration`
  - `katachi-permanent-reinforcement`
  - `katachi-stage6-performance`

Re-read latest `main` CURRENT fronts before final classification. If any lane has resumed from a C-side path, STOP and report it instead of deleting anything.

## Required reading

1. this task
2. latest `docs/status/AB_CURRENT.md`
3. latest `docs/status/C_CURRENT.md`
4. latest `docs/status/HANA_CURRENT.md`
5. latest `docs/status/ART_CURRENT.md`
6. latest `docs/status/VIEWER_CURRENT.md`
7. `docs/tasks/DEV_STORAGE_MIGRATION_HISTORICAL_AUTHORITY_RESOLUTION_V0.md`
8. `docs/protocol/LOCAL_DIRTY_WORK.md`

Do not preload unrelated project history.

## Hard safety rule

### NO DELETION before explicit author approval

This task may inspect, classify, stop obsolete C-side dev servers when clearly identified, and prepare an exact deletion manifest.

It must NOT delete, move, prune, clean, or remove any C-side path until the author has explicitly approved the returned deletion manifest.

After approval, execute only the approved set. Anything not listed remains untouched.

## Gate 0 — prove all normal development authority is on J/GitHub

Verify current preferred workspaces / runtime authority for:

- AB
- C
- HANA
- ART
- Viewer
- compute/helper
- `J:\dev\samples`

Require:

- no active worker/process uses a C-side project worktree as its current development authority;
- no normal runtime still requires the C compute-helper source path;
- all exact authoritative branch/HEAD values are remotely reachable;
- J worktrees expected to be clean are still clean or any newer J work is explicitly owned and not dependent on C rollback copies.

If any current lane has resumed on C, STOP.

## Gate 1 — active process / open-handle review

Identify project-relevant processes whose command line / cwd / executable points into `C:\dev`.

In particular inspect:

- Vite / Node dev servers
- compute/helper remnants
- Python / CUDA helper processes
- editors or watchers only where path ownership is discoverable

If an obsolete C-side Vite/dev server is clearly identified and no active task depends on it, it may be stopped as migration cleanup preparation.

Do not stop unrelated Node/Python/browser/GPU processes.

Record any C-side path that still has an active handle and exclude it from the deletion manifest.

## Gate 2 — protect user-owned / local-only material

Never delete or mutate in this task without separate explicit author approval:

- `J:\dev\samples` — canonical user-owned samples
- `C:\dev\samples` — old counterpart; classify separately as USER-OWNED OLD COPY, not generic cache
- C-side untracked `docs/infrastructure/` user work
- any newly discovered local-only source/config/artifact not already protected on J/GitHub
- DriveFS temp data whose ownership remains unclear

For C `docs/infrastructure/`:

- record exact source path, file count, rough size, and whether an equivalent copy exists on J/GitHub;
- if not protected, classify `USER-OWNED / PRESERVE FIRST` and exclude it from cleanup approval.

Do not commit it merely for cleanup convenience.

## Gate 3 — classify every remaining C:\dev project item

Every relevant remaining item must receive exactly one final class:

### DELETE_READY_REMOTE
Clean redundant repo/workspace whose exact authoritative/valuable commits are confirmed reachable remotely and whose runtime/worktree is no longer authoritative.

### DELETE_READY_J_VERIFIED
Redundant C copy whose intended J replacement has been smoke-verified and is now the preferred workspace/runtime.

### CACHE_DELETE_READY
Rebuildable `node_modules`, build, dist, package/browser caches with no active handle and no unique data.

### KEEP_USER_OWNED
User-managed inputs/work such as old samples counterpart or untracked infrastructure work, unless the author explicitly chooses deletion.

### KEEP_ROLLBACK_TEMPORARILY
A C rollback copy with a concrete short-term reason to retain despite J verification. State the reason. Do not use this as a generic default.

### HANDLE_BLOCKED
Path is otherwise redundant but is currently used by an active process/open handle.

### DRIVEFS_REVIEW
`.tmp.driveupload`, `.tmp.drivedownload`, or similar cloud-sync temp/state whose ownership/meaning is not sufficiently proven.

### UNKNOWN_STOP
Anything that cannot be confidently classified. One UNKNOWN blocks destructive bulk cleanup.

## Gate 4 — expected deletion candidates

Re-verify, do not assume, but likely candidates include:

- old C-side HANA rollback worktree after confirming no newer local-only state;
- old C-side Team C rollback worktree after confirming no newer local-only state;
- old C-side AB authoritative copy / historical primary working state after confirming exact J/remote authority and protecting `docs/infrastructure/`;
- C-side compute-helper source after sustained J runtime/health verification;
- remote-reconstructable historical repo copies;
- redundant caches/build outputs under otherwise redundant historical workspaces;
- primary `C:\dev\katachi` only if its remaining `.git`/linked-worktree topology contains no unique authority, no user-owned untracked work except separately preserved/excluded content, and no C-linked worktree still needed.

Do not delete the primary repo independently from its linked-worktree topology. Treat the topology as one controlled cleanup set.

## Gate 5 — linked-worktree topology check

Before approving removal of `C:\dev\katachi` or `C:\dev\worktrees`:

- enumerate all linked worktrees owned by the C primary `.git`;
- verify each one is either J-verified, remote-reconstructable, explicitly KEEP, or separately excluded;
- identify dirty/untracked state per worktree;
- prove no J worktree links back to the C `.git` metadata;
- do not run destructive prune/remove yet.

If any linked worktree contains unique dirty/untracked state, classify and preserve/exclude it first.

## Gate 6 — DriveFS/temp boundary

Inspect `.tmp.driveupload` / `.tmp.drivedownload` only enough to determine:

- whether they are actually under `C:\dev`;
- whether a Google Drive process currently owns/uses them;
- whether they are project data or DriveFS sync internals.

If ownership remains uncertain, classify `DRIVEFS_REVIEW` and exclude from the deletion manifest.

This does not block deletion of unrelated verified project repos if the deletion manifest is itemized.

## Output — approval manifest

Return only:

```text
Overall SOL review用:

all active project authority on J/GitHub?: <YES/NO>
C-side project processes still active: <NONE or list>
user-owned/local-only material excluded from deletion: <list>
DELETE_READY_REMOTE: <exact paths>
DELETE_READY_J_VERIFIED: <exact paths>
CACHE_DELETE_READY: <exact paths / grouped safe patterns>
KEEP_USER_OWNED: <exact paths>
KEEP_ROLLBACK_TEMPORARILY: <exact paths + reason>
HANDLE_BLOCKED: <exact paths/process>
DRIVEFS_REVIEW: <exact paths + status>
UNKNOWN_STOP: <NONE or exact items>
C primary + linked-worktree topology removable as one set?: <YES/NO + reason>
estimated reclaimable size if approved: <approx>
final destructive cleanup approval requested?: <YES/NO>
blocker before deletion: <NONE or summary>
```

## After explicit author approval

Only after the author explicitly approves the exact returned deletion set:

1. recheck no relevant process has restarted on a deletion target;
2. delete only approved `DELETE_READY_*` and `CACHE_DELETE_READY` items;
3. do not delete KEEP / HANDLE_BLOCKED / DRIVEFS_REVIEW / UNKNOWN items;
4. for primary repo / linked worktree topology, use safe Git-aware removal only if the approved manifest explicitly includes the whole set;
5. verify deleted paths are gone and J authoritative workspaces still function;
6. report reclaimed space and remaining C:\dev items;
7. STOP.

## Hard prohibitions

Do not:

- bulk delete `C:\dev` before approval;
- delete `C:\dev\samples` automatically;
- delete untracked `docs/infrastructure/` user work;
- delete DriveFS temp merely because it looks temporary;
- delete any C path with unique local-only state;
- delete or rewrite J workspaces;
- start Performance v2, G/H/J, new Support work, durability work, HANA/ART/Viewer expansion;
- force-push/reset/rebase/stash for cleanup convenience.

## Done when

Overall SOL receives a complete exact deletion manifest with no unresolved project authority, user-owned/local-only state is explicitly excluded or protected, active-handle/DriveFS boundaries are known, and the author can safely approve a bounded destructive cleanup set.

STOP for author approval before deletion.
