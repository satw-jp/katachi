# DEV Storage Migration — Exhaustive Repo / Workspace Discovery C:→J: v0

Date: 2026-09-06
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READ-ONLY DISCOVERY ONLY

## Purpose

Close gaps in the first C:→J: migration inventory before any migration decision.

The first inventory did **not** account for the author's remembered `katachi-compute` environment and may have missed other Katachi/FUKEI-related repos, clones, worktrees, compute/server workspaces, or local-only project directories.

This task is discovery only. Do not move, delete, prune, repair, checkout, reset, commit, push, install, or rewrite anything.

## Current safety note

Per author, an AB Temporary SOL is currently active. Treat AB as ACTIVE regardless of stale/conflicting CURRENT wording until its active worker reaches a clean explicit checkpoint. Do not touch the primary repo or any path used by that worker.

Known primary repo from prior inventory:

- `C:\dev\katachi`
- primary `.git`: `C:\dev\katachi\.git`
- prior observed branch/HEAD: `agent/skin-astra-large-3mf-validator-v0` / `948c676fa966c9881d13971b4761636c5fe77d83`

Known additional locations from prior project history/inventory include:

- `C:\dev\worktrees\...`
- `C:\dev\astra-usagi`
- `C:\dev\astra-usagi\lane-c-skin-native`
- `C:\dev\samples`
- `katachi-c-checkpoint`
- `katachi-support-coverage`
- `hikari2`
- author-remembered `katachi-compute` (exact path unknown; must be found or explicitly reported NOT FOUND)

## Read first

- `docs/TEAM_REPORTING_RULES.md`
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/HANA_CURRENT.md`
- `docs/status/ART_CURRENT.md`
- `docs/tasks/DEV_STORAGE_MIGRATION_INVENTORY_C_TO_J_V0.md`
- this task

## Discovery scope

### 1. Enumerate Git repositories/worktrees

Read-only enumerate **all Git repositories and linked worktrees** under:

- `C:\dev`
- `J:\dev` if present

Do not limit discovery to names containing `katachi`.

For each repo/worktree, record:

- exact path
- repo/worktree vs ordinary directory
- primary clone vs linked worktree vs separate clone
- remote URL(s)
- branch / HEAD
- dirty/untracked state
- upstream configured or not
- whether it appears related to Katachi / Hikari / SKIN / HANA / ART / Astra / compute / server infrastructure

### 2. Find `katachi-compute`

Search read-only for directories/files named or clearly corresponding to:

- `katachi-compute`
- `katachi_compute`
- `katachi compute`
- likely compute/server variants of Katachi

Search `C:\dev` and `J:\dev` first.

If not found there, perform a bounded directory-name search on C: and J: excluding obvious system/application trees where practical. Do not traverse network/cloud drives unless already part of known dev paths.

If found, record:

- exact path
- whether it is a Git repo
- remote URL
- branch / HEAD / dirty state
- role (compute backend, server, build workspace, cache, etc.) based on evidence
- size
- whether anything points to it by absolute path
- whether migration/recreation is required

### 3. Non-Git project/workspace dependencies

Identify project-critical non-Git directories under the dev roots, especially:

- compute/server runtime data
- local databases
- model/assets/sample inputs
- generated-but-not-reconstructable artifacts
- environment/config files
- launch scripts
- local-only credentials references (do not print secret values)
- package/model caches only if project-specific

Distinguish PRESERVE vs RECONSTRUCTABLE vs CACHE/TEMP.

### 4. Relationship map

Produce a compact topology showing at least:

```text
primary katachi clone
├─ linked worktrees
├─ separate clones
├─ compute/server workspace(s)
├─ Astra/workspace(s)
├─ sample/input directories
└─ generated/cache/temp directories
```

Include cross-drive absolute-path dependencies where observed.

### 5. Active-worker collision check

Without interrupting or modifying active work, identify which discovered paths appear currently occupied by active workers/tasks.

At minimum:

- AB Temporary SOL: ACTIVE per author
- C LUNA / UI parity task: check CURRENT + local evidence
- HANA hardware-gate worktree: preserve any local-only/unpushed state
- any other visible active worker/process path

Do not stop processes. Report only.

## Output

Update the detailed report:

`docs/infrastructure/DEV_STORAGE_MIGRATION_C_TO_J_INVENTORY.md`

Append a section `Exhaustive repo/workspace discovery` rather than creating many reports.

Return only this compact handoff:

```text
Overall SOL review用:

katachi-compute: <FOUND path + role / NOT FOUND>
Git repos/worktrees discovered: <count + paths summary>
additional project workspaces: <summary>
previously missed items: <summary>
active-worker paths: <summary>
PRESERVE before migration: <summary>
RECONSTRUCTABLE/CACHE: <summary>
migration inventory now complete?: YES/NO
remaining unknowns: <summary>
```

## Protected scope

Do not:

- move/copy/rename dev trees
- delete/cache-clean
- checkout/switch branch
- commit/push/fetch unless separately authorized
- repair/prune worktrees
- modify CURRENT or project code
- interrupt AB Temporary SOL or any active worker
- expose secret values

## Done when

Overall SOL can answer with evidence:

1. where `katachi-compute` is or that it is genuinely absent;
2. every relevant Git repo/worktree under C:\dev/J:\dev;
3. important non-Git project workspaces that must survive;
4. which paths are active and therefore block cutover;
5. what must be preserved versus reconstructed on J:.
