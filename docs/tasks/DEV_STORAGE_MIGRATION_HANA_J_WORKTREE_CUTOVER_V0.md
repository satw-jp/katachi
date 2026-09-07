# DEV Storage Migration — HANA J: Worktree Cutover v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — HANA FIRST CUTOVER

## Purpose

Move HANA's active development workspace to J: before any further HANA hardware or interaction work begins.

HANA is a good first lane cutover because its current implementation is preserved remotely, no HANA worker is active, and the lane is waiting on an iPad / EasyCanvas Hardware Gate.

This task changes only local workspace location / reconstruction. It does not authorize HANA feature work.

## Required reading

1. this task
2. `docs/status/HANA_CURRENT.md` front section
3. `docs/tasks/DEV_STORAGE_MIGRATION_KATACHI_J_PRIMARY_STAGE_V0.md`
4. `docs/protocol/LOCAL_DIRTY_WORK.md`

Do not preload unrelated lane CURRENTs, old tasks, project philosophy, or broad architecture unless a concrete migration dependency appears.

## Current HANA authority to preserve

From `HANA_CURRENT.md`:

- branch: `agent/hana-viewport-context-topbar-v0`
- exact preserved HEAD: `e2456befce1467c9892f0fc772096368dedce151`
- parent Projection Redraw checkpoint: `99e9b9ad90f478c875a805513d7603f75e8ff0a7`
- current phase: iPad / EasyCanvas Hardware Gate
- no implementation worker active
- no Projection Redraw rewrite
- no LOCAL performance project
- no compute redesign
- no growth / branching / tropism expansion
- no Section Redraw implementation before the hardware gate closes

Re-read latest `main` before execution. If HANA_CURRENT has advanced, preserve the newer authority instead of blindly using the values above.

## Preconditions

Before changing local workspace topology:

1. confirm `J:\dev` is a normal local development filesystem and not Google Drive / DriveFS;
2. confirm the canonical J-side `katachi` clone exists at `J:\dev\katachi` or create/verify it only through the already-authorized primary-stage task;
3. verify HANA branch and exact current HEAD are remotely reachable;
4. verify there is no newer dirty/unpushed HANA state on C: that is not represented remotely;
5. verify no HANA process / dev server / editor task is actively writing to the old HANA worktree.

If a newer local-only HANA state exists, STOP and report it. Do not overwrite, stash, reset, or silently discard it.

## Target layout

Prefer a J-local HANA worktree associated with the J-side canonical clone.

Suggested location:

`J:\dev\worktrees\hana-viewport-context-topbar-v0`

If the project's established J-side worktree naming/layout is different, follow that existing local convention rather than inventing a conflicting one.

The target must not point back to `C:\dev\katachi\.git` or any C-side worktree metadata.

## Phase 1 — verify remote reconstructability

Record:

- remote branch ref
- exact branch HEAD
- parent Projection Redraw reachability
- current HANA_CURRENT authority
- C-side HANA source path if known
- C-side branch/HEAD/status

Require:

- exact current HANA checkpoint remotely reachable;
- no uncommitted/unpushed HANA state newer than remote authority.

If not, STOP.

## Phase 2 — create J-side HANA worktree

From `J:\dev\katachi`:

1. fetch remote refs;
2. create a new J-local worktree for the exact current HANA branch/HEAD;
3. do not reuse/copy the old worktree `.git` file;
4. do not run `git worktree repair/prune/remove` against C-side topology;
5. verify J worktree branch, HEAD, clean state, remote reachability, and `.git` linkage are entirely J-local;
6. do not copy old `node_modules`, dist/build outputs, browser caches, or temporary files.

If the branch is already checked out elsewhere and Git prevents creating the new worktree, do not force or detach arbitrarily. Report the exact conflict and use a safe J-local branch/worktree reconstruction method only if it preserves the same authoritative commit and future branch ownership unambiguously.

## Phase 3 — lightweight HANA smoke check on J

Install only normal dependencies from lockfiles if needed for a minimal smoke check.

Run a bounded verification sufficient to show the J-side HANA workspace is usable, preferably:

- expected branch/HEAD/clean status;
- existing HANA focused tests or the cheapest established HANA smoke set;
- TypeScript/build only if already standard and reasonably quick;
- app/dev-server launch only if it can be done without changing HANA semantics.

Do not start the iPad / EasyCanvas Hardware Gate inside this migration task.
Do not modify HANA code merely to make migration pass.

If a path assumption breaks because of C-specific absolute paths, record it as a migration blocker. Fix only local launcher/config pathing when clearly infrastructure-only and authorized; do not change HANA architecture.

## Phase 4 — preferred-workspace switch

After J-side smoke verification PASS:

- mark the J-side HANA worktree as the preferred location for all future HANA work;
- future HANA Hardware Gate / fixes must start from the J-side workspace;
- leave the C-side HANA workspace intact as rollback/evidence storage;
- do not delete, move, rename, prune, or clean the C-side HANA worktree in this task.

If any launcher/shortcut explicitly opens the old C-side HANA path, report it. Update only if ownership is clear and the change is local/infrastructure-only; otherwise leave a manual note.

## Relationship to HANA work

This migration must finish before the author resumes HANA.

After this task PASS:

1. HANA SOL re-reads latest `HANA_CURRENT.md` from main;
2. the author performs the iPad / EasyCanvas Hardware Gate from the J-side workspace/runtime;
3. only if that gate finds a concrete failure may HANA SOL define a bounded fix;
4. Section Redraw remains later work.

## Hard prohibitions

Do not:

- alter HANA source semantics;
- rewrite Projection Redraw;
- begin Section Redraw;
- start growth / branching / tropism work;
- change compute architecture;
- delete C-side HANA workspace;
- modify AB/C active worktrees;
- move/rename the primary C-side `katachi` repo;
- copy C-side `.git/worktrees` metadata into J;
- reset/rebase/stash/clean local HANA state for convenience;
- force-push.

## Output

Return only:

```text
Overall SOL review用:

HANA authority read from main: <branch + HEAD>
remote reconstructability: <PASS/FAIL>
C-side HANA path/state: <path + branch/HEAD/clean-dirty>
newer local-only HANA work found?: <NO/YES + summary>
J canonical clone: <path + main SHA>
J HANA worktree: <path>
J HANA branch/HEAD: <branch + SHA>
J worktree clean: <YES/NO>
C-linked git metadata remaining in J worktree?: <NO/YES>
smoke check: <PASS/FAIL + concise evidence>
future HANA preferred workspace: <J path / NOT SWITCHED>
C original retained?: YES
HANA J cutover complete?: <YES/NO>
blocker: <NONE or one line>
```

## Done when

HANA's exact current remote-authoritative state has been reconstructed as a clean J-local worktree, lightly smoke-verified, and designated as the preferred workspace for future HANA work, while the C-side original remains untouched for rollback.

STOP. Do not perform the HANA Hardware Gate in this migration task.
