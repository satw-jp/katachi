# DEV Storage Migration Inventory — C: to J: v0

Date: 2026-09-06
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READ-ONLY INVENTORY ONLY

## Purpose

Prepare a safe future migration of the Windows development area from `C:` to `J:` because `C:` storage consumption is growing faster than expected.

This task is **information collection only**. Do not move, delete, prune, reset, re-clone, repair, or rewrite any repository/worktree yet.

The main question is whether the current `C:\dev` layout contains the primary `satw-jp/katachi` clone that owns linked Git worktrees. If so, a simple folder move can break worktree metadata because linked worktrees may contain absolute path references.

## Read first

- `docs/TEAM_REPORTING_RULES.md`
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/HANA_CURRENT.md`
- `docs/status/ART_CURRENT.md`
- this task

GitHub CURRENT is the technical current-state SSOT, but local dirty/unpushed work can exist outside GitHub and must be inventoried explicitly.

## Scope

Inspect the Windows development storage rooted around `C:\dev` and determine what must be preserved or reconstructed for a future move to a proposed `J:\dev`.

Do not change active project state.

## Collect

### 1. Storage layout

Record:

- total used size of `C:\dev`;
- top-level directories and their sizes;
- largest subdirectories/files that explain current growth;
- distinguish source/history from reconstructable caches/artifacts such as `node_modules`, build output, temp files, browser caches, generated exports, logs, package caches, etc.;
- free space on `C:` and `J:`.

Do not delete anything during this task.

### 2. Git topology

For every Katachi-related repo/worktree under `C:\dev` or other nearby Windows dev paths, record:

- exact filesystem path;
- `git rev-parse --show-toplevel`;
- whether it is the primary/main worktree or a linked worktree;
- branch;
- HEAD SHA;
- upstream/remote branch if any;
- `git status --short --branch`;
- dirty/untracked state;
- whether the current HEAD/branch is pushed remotely;
- remote URLs.

From the primary Katachi clone, record the full output of:

`git worktree list --porcelain`

Also identify where the primary `.git` directory lives and whether linked worktrees point back to it through path-based metadata.

### 3. Active lane safety

Compare local findings with current GitHub CURRENT documents.

Specifically identify any local state that is:

- dirty;
- uncommitted;
- committed but unpushed;
- on a branch not reflected by GitHub CURRENT;
- waiting on a hardware/manual gate;
- actively used by a LUNA/SOL task.

Do not resolve the discrepancy in this inventory task; report it.

### 4. Hard-coded path dependencies

Search for dependencies on `C:\dev`, `C:/dev`, or the exact current Katachi/worktree locations in:

- repository scripts/config/docs;
- `.vscode` / editor workspace files;
- npm scripts or local launch scripts;
- PowerShell / batch files;
- environment files;
- shortcuts or task-runner configs that are reasonably visible from the dev workspace;
- local server launch instructions.

Separate:

- repo-tracked hard-coded paths;
- local-only configuration;
- documentation examples that do not affect execution.

Do not rewrite paths yet.

### 5. Migration options

Based on the observed topology, compare at least these future approaches:

A. move existing primary clone + repair/repoint linked worktrees;

B. create a fresh primary clone on `J:` and recreate linked worktrees from pushed branches;

C. keep the primary clone where it is but move/recreate only heavy linked worktrees/build/cache locations on `J:` if that removes most storage pressure.

For each, state:

- risk;
- what local-only state could be lost;
- downtime/coordination complexity qualitatively (`LOW` / `MEDIUM` / `HIGH`);
- whether all branches must be pushed first;
- whether Git worktree metadata requires repair/recreation.

Do not execute any option.

## Proposed migration gate

Recommend an exact migration gate from the evidence.

Default preference is to migrate only when:

- no relevant worktree is dirty;
- all checkpoints that must survive are committed and pushed or otherwise explicitly backed up;
- no active implementation worker is writing into the affected paths;
- active bounded tasks are at a clean checkpoint;
- the migration plan includes a post-move verification matrix.

If the primary clone is the parent of multiple linked worktrees, explicitly say whether moving it alone would break them.

## Post-move verification plan

Draft, but do not execute, a concise verification checklist covering:

- `git worktree list` consistency;
- every important branch/HEAD preserved;
- clean/expected status;
- remote fetch/push reachability;
- install/build/test smoke check where appropriate;
- local dev server startup;
- any path-sensitive tooling;
- old `C:` copy retained until the new `J:` setup is proven.

## Protected scope

Do not:

- move or rename `C:\dev`;
- create `J:\dev` migration copies unless separately authorized;
- delete caches or artifacts;
- run `git worktree prune`;
- run `git gc` for cleanup;
- reset/rebase/merge branches;
- commit or push project work;
- change CURRENT files;
- interrupt active SOL/LUNA work;
- alter Production semantics or project code.

## Output

Return a compact Overall SOL handoff:

```text
Overall SOL review用:

C:\dev total / main consumers:
primary katachi repo:
linked worktrees:
dirty/unpushed risk:
hard-coded path risk:
recommended migration method:
recommended migration gate:
blocker before move:
```

For detailed evidence, create or update one report file under:

`docs/infrastructure/DEV_STORAGE_MIGRATION_C_TO_J_INVENTORY.md`

If that directory/path is unsuitable in the current checkout, report the proposed path instead of inventing another location.

## Done when

Inventory is complete enough for Overall SOL to decide:

1. what exactly should move to `J:`;
2. whether the primary clone or only worktrees/caches should move;
3. when the cutover is safe;
4. which migration method is lowest-risk;
5. what verification proves the migration succeeded.

Stop before any actual migration.