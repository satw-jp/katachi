# DEV Storage Migration — Historical Authority Resolution v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — FINAL AUTHORITY RESOLUTION BEFORE CLEANUP

## Purpose

Resolve the remaining four C-side historical repositories whose exact local HEADs are not currently proven reachable from remote refs, so final C:\dev cleanup can proceed without losing unique project state.

This task is read/compare/preserve only. It does not authorize deleting any C-side repository or starting new implementation work.

## Current migration state

Already PASS / protected:

- J canonical clone: `J:\dev\katachi`
- HANA J cutover
- Team C J cutover + runtime bootstrap
- ART J cutover
- Viewer J cutover
- Team AB J cutover at `agent/skin-a2-sparse-support-performance-v1` / `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- compute/helper live runtime cutover to `J:\dev\katachi-compute-helper-tray`
- Team C J-side compute connection / helper health PASS
- user-owned samples canonical path: `J:\dev\samples`
- `astra-usagi` and FIELD recovery preserved on J
- clean historical repos already proven remote-reconstructable: `katachi-cuda-shadow`, `katachi-current-integration`, `katachi-final-integration`, `katachi-sparse-support-v0`

Do not disturb any of those accepted states.

## Repositories to resolve

Exactly these four C-side historical repositories/workspaces:

1. `katachi-cuda-geometry`
2. `katachi-cuda-integration`
3. `katachi-permanent-reinforcement`
4. `katachi-stage6-performance`

Use the exact discovered C paths from the local inventory. Do not infer a path if discovery differs.

## Required reading

1. this task
2. latest `docs/status/AB_CURRENT.md` front
3. latest `docs/status/C_CURRENT.md` front
4. `docs/tasks/DEV_STORAGE_MIGRATION_PRESERVATION_LEDGER_V0.md`
5. `docs/protocol/LOCAL_DIRTY_WORK.md`
6. existing local migration inventory/report if present

Do not preload unrelated architecture or project history unless a concrete ownership question requires it.

## Gate 0 — prove each source state

For each of the four repositories, record without mutating source state:

- exact path
- repo type: independent repo / linked worktree / ordinary directory
- remote URL(s)
- branch / detached state
- exact HEAD SHA
- clean / dirty / untracked state
- upstream if any
- local refs pointing to the HEAD
- remote refs containing the exact HEAD, if any
- merge-base / ancestry relation to the closest relevant remote branch when useful

Use `git ls-remote`, `git branch --contains`, `git log`, `git merge-base`, and other non-destructive inspection as appropriate.

Do not fetch/reset/rebase/stash/clean merely to make inspection easier.

## Gate 1 — classify semantic ownership

For each repo, determine the strongest supported project role from path, branch names, commit messages, changed-file scope, existing CURRENT/task references, and migration inventory.

Classify one of:

- `REMOTE_RECONSTRUCTABLE` — exact state already reachable from remote; C copy is redundant after final approval.
- `PRESERVE_REMOTE` — clean committed unique state worth retaining; preserve the exact commit under a clearly archival/non-authoritative remote ref if no conflicting same-name remote exists.
- `PRESERVE_J_ARTIFACT` — dirty/local-only source or evidence that should be copied/package-preserved on J rather than promoted as code authority.
- `DISCARD_CANDIDATE` — no unique state beyond remote/J and no remaining project authority.
- `OWNER_REVIEW_REQUIRED` — meaning cannot be safely resolved from evidence.

Do not interpret an old experiment as current Production authority merely because it contains novel code.

## Gate 2 — preserve unique committed state when unambiguous

For items classified `PRESERVE_REMOTE`:

- require clean committed source state;
- require exact SHA known;
- ensure no conflicting remote ref would be overwritten;
- use a clearly archival branch/ref name if the original local branch name is ambiguous;
- never force-push;
- verify the exact SHA is remotely reachable after preservation.

This preservation does not promote the branch into CURRENT or Production authority.

If preservation ownership remains ambiguous, do not push; classify `OWNER_REVIEW_REQUIRED`.

## Gate 3 — preserve dirty/local-only bytes when needed

For `PRESERVE_J_ARTIFACT`:

- do not commit/stash/reset the source merely for migration;
- preserve a reproduction package under `J:\dev\_preserve\historical\<name>` containing, where applicable:
  - HEAD/branch/remote metadata;
  - status output;
  - binary-capable tracked patch;
  - required untracked files;
  - a short manifest with source path and likely owner;
- exclude clearly rebuildable `node_modules`, build/dist and generic caches unless they contain irreplaceable evidence;
- verify package existence / file counts / cheap hashes for small critical files.

## Gate 4 — cleanup eligibility report only

After resolution, report whether each original C-side repository is:

- safe to delete after explicit user approval;
- keep as rollback for now;
- blocked pending owner review.

Do not delete anything in this task.

Do not touch:

- C primary `katachi` repo or its `.git` topology;
- retained HANA/C rollback worktrees;
- C compute-helper source;
- `C:\dev\samples`;
- `.tmp.driveupload` / `.tmp.drivedownload`;
- J-side accepted worktrees;
- Performance v2 / G/H/J / new Support work.

## Output

Return only:

```text
Overall SOL review用:

katachi-cuda-geometry: <classification + exact SHA/state + preservation evidence>
katachi-cuda-integration: <classification + exact SHA/state + preservation evidence>
katachi-permanent-reinforcement: <classification + exact SHA/state + preservation evidence>
katachi-stage6-performance: <classification + exact SHA/state + preservation evidence>
new remote archival refs created: <summary / NONE>
new J preservation packages created: <summary / NONE>
remaining historical authority unresolved?: <YES/NO + items>
historical C copies safe to delete after explicit approval: <items / NONE>
all migration-critical historical state protected on J/GitHub?: <YES/NO>
blocker: <NONE or one line>
```

## Done when

The four previously unresolved historical repositories are each proven reconstructable, safely preserved, explicitly discardable, or isolated behind a precise owner-review blocker, with no destructive C-side action taken.

STOP for Overall SOL review. Final destructive cleanup remains a separate explicit approval gate.
