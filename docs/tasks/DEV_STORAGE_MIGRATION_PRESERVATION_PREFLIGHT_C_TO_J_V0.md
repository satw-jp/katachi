# DEV Storage Migration Preservation Preflight — C: to J: v0

Date: 2026-09-06
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READ-ONLY PREFLIGHT ONLY

## Purpose

Turn the completed storage inventory into an exact preservation checklist before any future move from `C:\dev` to `J:\dev`.

The preferred future migration method is currently:

**B. fresh primary clone on J: + recreate required linked worktrees from preserved/pushed refs**

Do not execute the migration in this task.

## Read first

- `docs/TEAM_REPORTING_RULES.md`
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/HANA_CURRENT.md`
- `docs/status/ART_CURRENT.md`
- `docs/tasks/DEV_STORAGE_MIGRATION_INVENTORY_C_TO_J_V0.md`
- local inventory report if present: `C:\dev\katachi\docs\infrastructure\DEV_STORAGE_MIGRATION_C_TO_J_INVENTORY.md`

## Known inventory findings to verify/classify

- `C:\dev` total around 28.33 GiB
- `C:\dev\worktrees` around 6.12 GiB
- `C:\dev\.tmp.driveupload` around 5.05 GiB
- `C:\dev\astra-usagi` around 3.62 GiB
- primary Katachi clone: `C:\dev\katachi`
- primary `.git`: `C:\dev\katachi\.git`
- primary branch observed: `agent/skin-astra-large-3mf-validator-v0`
- observed HEAD: `948c676fa966c9881d13971b4761636c5fe77d83`
- 11 linked worktrees share the primary `.git`
- separate clones include `katachi-c-checkpoint`, `katachi-support-coverage`, `hikari2`
- absolute-path worktree metadata exists across C:/J:
- dirty work observed in `C:\dev\worktrees\skin-c-field-vnext-restore-v0`
- dirty work observed in the primary validator worktree in `threeMfValidation.ts` / test
- multiple branches have no configured upstream

## Scope

Read-only classification of preservation risk. No project mutation.

### 1. Classify every dirty worktree

For every dirty Katachi repo/worktree, record:

- path
- branch
- HEAD
- `git status --short`
- concise `git diff --stat`
- concise semantic description of tracked diffs
- untracked files, including size where relevant
- whether the diff looks like source work, evidence/docs, generated output, cache, or accidental residue
- whether the corresponding HEAD exists remotely

Pay special attention to:

- `C:\dev\worktrees\skin-c-field-vnext-restore-v0`
- `C:\dev\katachi` on the A2 validator branch

Do not stage, restore, reset, commit, stash or clean anything.

### 2. Classify no-upstream branches

For every local branch without an upstream that is relevant to Katachi work:

- branch name
- HEAD
- which worktree uses it, if any
- whether an identical commit/ref already exists on origin under another branch
- whether it has commits not reachable from any remote ref
- whether it is clearly obsolete/reconstructable or must be preserved

Use read-only Git commands only. Do not create upstreams or push.

### 3. HANA preservation risk

Current canonical HANA status reports:

- branch `agent/hana-viewport-context-topbar-v0`
- HEAD `e2456befce1467c9892f0fc772096368dedce151`
- clean at reported checkpoint
- remote branch not yet pushed at reported checkpoint
- hardware gate pending

Determine where this local checkpoint lives and whether it is independently recoverable if `C:\dev` is removed. Do not push it; report the exact preservation action HANA SOL would need to authorize before migration.

### 4. Storage relief classification

For the largest consumers, especially:

- `C:\dev\.tmp.driveupload`
- `C:\dev\worktrees`
- `C:\dev\astra-usagi`

classify contents into:

- must preserve
- reconstructable from Git/lockfiles
- generated artifacts/evidence that need explicit archive
- temporary/cache data potentially removable later
- unknown / requires owner decision

For `.tmp.driveupload`, identify what owns/created it, age/last-write patterns, and whether there is evidence of an active process using it. Do not delete or move it.

### 5. Exact migration readiness matrix

Produce one table/list for all important repos/worktrees with:

- path
- branch/HEAD
- dirty? yes/no
- remote recoverable? yes/no/unknown
- active task/gate
- preservation action required before cutover
- migration-ready? yes/no

Compare against current GitHub CURRENT files.

## Recommended coordination gate

Assess whether the following proposed cutover is safe:

1. C finishes active `SKIN Production UI IA v0A Fix 2 · Current Production Parity Evidence` and C SOL closes/holds that bounded phase.
2. AB remains stopped at its author/manual A2 physical-print gate; no validator worker is writing into the primary repo.
3. HANA either closes its hardware gate and pushes the checkpoint, or HANA SOL explicitly creates an authorized preservation checkpoint before migration.
4. Every dirty/no-upstream local-only state is either committed+pushed by its owning lane or explicitly backed up with owner approval.
5. No implementation worker is running against affected C: paths.
6. Then perform a separately authorized migration task before starting the next C/AB/HANA implementation phase.

Report whether this is the preferred natural maintenance window or whether evidence suggests a different one.

## Protected scope

Do not:

- move/copy/rename repos or worktrees
- create the J: clone
- delete `.tmp.driveupload` or any cache/artifact
- stage/commit/push/stash/reset/rebase/merge
- run `git worktree repair` or `git worktree prune`
- run cleanup/GC
- modify project source or CURRENT files
- interrupt active workers

## Output

Return only a compact handoff:

```text
Overall SOL review用 — migration preservation preflight:

dirty states requiring preservation:
no-upstream unique refs:
HANA preservation requirement:
recoverable storage candidates:
non-recoverable storage/data:
recommended cutover window:
ready to migrate?: YES / NO
remaining blockers:
```

Put detailed read-only evidence in the existing local infrastructure report if available, or propose a path without committing it.

## Done when

Overall SOL can identify the exact finite list of actions that lane owners must complete before a separately authorized J: migration can begin.

STOP before any mutation or migration.