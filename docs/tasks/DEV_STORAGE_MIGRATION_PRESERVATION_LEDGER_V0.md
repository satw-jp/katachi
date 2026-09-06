# DEV Storage Migration — Preservation Ledger v0

Date: 2026-09-06
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READ-ONLY CLASSIFICATION

## Purpose

Turn the discovery inventory into a finite preservation ledger for the later C:→J: migration.

This task does not migrate, clean, commit, push, fetch, repair, or modify project state. It classifies existing local refs/worktrees/artifacts into preservation categories so Overall SOL can later define an exact maintenance window.

AB Temporary SOL / A2 regeneration is ACTIVE and remains a hard migration blocker. Do not inspect expensive A2 internals or contend with its active path. Use `DEFER — AB ACTIVE` where necessary.

## Read first

- `docs/TEAM_REPORTING_RULES.md`
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/HANA_CURRENT.md`
- `docs/status/ART_CURRENT.md`
- `docs/tasks/DEV_STORAGE_MIGRATION_INVENTORY_C_TO_J_V0.md`
- `docs/tasks/DEV_STORAGE_MIGRATION_REPO_DISCOVERY_C_TO_J_V0.md`
- `docs/infrastructure/DEV_STORAGE_MIGRATION_C_TO_J_INVENTORY.md` if present locally
- this task

## Scope

Build one ledger covering every discovered relevant repo/worktree/ref/artifact/workspace that could matter to the later migration.

At minimum include:

- `C:\dev\katachi`
- all linked worktrees owned by its `.git`
- J-backed common Git repo and linked C: worktrees
- `katachi-c-checkpoint`
- `katachi-support-coverage`
- `hikari2`
- `katachi-compute-helper-tray`
- CUDA / integration / support / recovery workspaces found in discovery
- `astra-usagi`
- `samples`
- `field-vnext-checkpoint-recovery`
- HANA local refs
- C Field vNext dirty worktree
- C UI Fix2 untracked evidence
- `.tmp.driveupload` / `.tmp.drivedownload`
- any other discovered local-only generated artifacts or configs

## Classification categories

Assign each item exactly one primary category:

### A — ACTIVE / DEFER
Currently used by an active worker or task. Do not touch before that task reaches a clean checkpoint.

### B — PRESERVE REMOTELY
Clean committed unique ref that should be made reconstructable from GitHub before migration. Do not push in this task; only identify exact ref/SHA and why it needs preservation.

### C — PRESERVE AS FILE/ARTIFACT
Dirty source, untracked evidence, local-only generated artifact, recovery patch, config, or other data that cannot be reconstructed from confirmed remote state. Record exact path and preservation reason. Do not copy it in this task.

### D — ALREADY RECONSTRUCTABLE
Confirmed clean state reachable from a remote ref or reproducible from authoritative source. Record the evidence.

### E — CACHE / TEMP / REBUILDABLE
`node_modules`, build/dist output, package/build caches, temp data, etc. Record only when deletion could later reclaim meaningful space. Do not delete.

### F — AUTHORITY UNKNOWN / SOL REVIEW
State exists but its semantic authority is unclear (e.g. old C/CUDA/integration/recovery branch). Record exact branch/SHA/path and which SOL or project owner should decide KEEP vs DISCARD.

## Remote/reachability inspection

For no-upstream branches and local refs, determine without mutating local Git state:

- local ref name and exact SHA
- whether the exact commit is reachable from any confirmed remote ref
- whether a same-name remote branch exists
- whether the branch contains unique commits relative to confirmed remote refs

Prefer non-mutating inspection such as existing refs plus `git ls-remote` where needed. Do not run `git fetch` in this task.

Do not infer that "no upstream" means "not pushed"; prove reachability where possible.

## Dirty / untracked authority

For dirty/untracked items, record only:

- path
- file count / rough size
- branch/HEAD
- broad content type (source / tests / evidence / artifact / report / config)
- likely owning lane (AB/C/HANA/etc.)
- whether CURRENT/task evidence identifies it as active or expected

Do not diff or hash huge active artifacts if expensive. Do not modify anything.

Specifically keep separate:

- C Field vNext 11 dirty source changes
- J-backed task-a2 dirty `package.json` + untracked source/tests
- C UI IA Fix2 untracked evidence
- primary repo untracked inventory report

## HANA note

A separate preservation task exists:

`docs/tasks/HANA_MIGRATION_PRESERVATION_CHECKPOINT_V0.md`

If it has already run, record its result and classify HANA refs accordingly. If not, do not duplicate its push actions here; classify them as B or F as appropriate.

## Compute identity note

Exact historical `katachi-compute` path was NOT FOUND. Current discovered compute-related workspace is:

`C:\dev\katachi-compute-helper-tray`

Treat "historical katachi-compute identity" as non-blocking unless evidence shows an unresolved local-only dependency. Focus on the current observed workspace and its dependencies.

## Google Drive temp note

Red-X overlays observed by the author are Google Drive sync failures, not Git failures.

Classify `.tmp.driveupload` / `.tmp.drivedownload` as `AUTHORITY UNKNOWN` until ownership / active handles / sync meaning are understood. Do not delete or copy them merely because they look temporary.

## Output

Update the existing infrastructure report with a concise table:

| Item | Path/ref | Category | Exact SHA/state | Reconstructable? | Owner | Action before cutover |

Do not create multiple new reports.

Return only:

```text
Overall SOL review用:

A ACTIVE/DEFER:
B PRESERVE REMOTELY:
C PRESERVE FILE/ARTIFACT:
D ALREADY RECONSTRUCTABLE:
E CACHE/TEMP/REBUILDABLE:
F AUTHORITY UNKNOWN / SOL REVIEW:
HANA preservation status:
AB deferred state:
remaining blockers before migration window:
ledger complete enough for cutover planning?: YES/NO
```

## Protected scope

Do not:

- move/copy/delete/rename dev content
- clean caches
- commit/push/fetch
- checkout/switch/reset/rebase/merge/stash
- repair/prune worktrees
- run expensive recursive inspection on active AB paths
- change CURRENT/project code
- expose secret values

## Done when

Overall SOL can see a finite list of:

1. what must wait for active work;
2. what must be pushed later;
3. what must be backed up as files later;
4. what is already safely reconstructable;
5. what can eventually be discarded/rebuilt;
6. which ambiguous historical refs need Team SOL judgment before the migration window.

STOP. Actual preservation writes and migration remain separate authorized tasks.