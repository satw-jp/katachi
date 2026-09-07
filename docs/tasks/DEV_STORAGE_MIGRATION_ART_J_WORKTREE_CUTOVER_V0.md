# DEV Storage Migration — ART J Worktree Cutover v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — ART CUTOVER ONLY

## Purpose

Move the current ART review workspace to a J-local worktree while ART is stopped at the Author Review / Artistic Gate.

This is a storage/workspace migration only. It does not authorize Round 04 or any new ART implementation.

## Current authority to preserve

Read latest `docs/status/ART_CURRENT.md` from `main` before execution.

At task creation, remote ART checkpoints are:

- R1: `agent/skin-art-research-principles-r1` @ `e9932d05b701ee1bd2ae8e19501d7d7a33927b06`
- R2: `agent/skin-art-research-principles-r2` @ `592ab0123358c63fc75c1acc7e6df408be40b89c`
- R3 / latest review checkpoint: `agent/skin-art-research-principles-r3` @ `5edc19f310000354943ffb2e1fafc8eaff089e13`

ART is at AUTHOR REVIEW. Round 04 is not authorized.

If latest `ART_CURRENT.md` has advanced, preserve the newer authority instead of these embedded values.

## Required reading

1. this task
2. latest `docs/status/ART_CURRENT.md` front
3. `docs/protocol/LOCAL_DIRTY_WORK.md`

Do not preload AB/C/HANA history or broad project philosophy unless a concrete dependency appears.

## Hard boundaries

Do not touch:

- active AB performance worktree/process;
- active Viewer Surface-alignment worktree/process;
- J-side C or HANA worktrees;
- compute-helper runtime;
- Research/Astra active state;
- project source semantics.

Do not start ART R4, new morphology studies, SKIN/HANA integration, deploy, or merge.

Do not delete the C-side ART workspace in this task.

## Gate 0 — identify current local ART state

Determine whether a C-side ART worktree/workspace exists for R1/R2/R3 and record:

- path;
- branch / HEAD;
- clean/dirty state;
- whether any local-only commits or untracked/dirty ART evidence exist;
- whether any ART process/dev server is actively using it.

The current GitHub status explicitly says local working-tree state was not covered by remote verification, so do not assume remote state is complete until this check is done.

If newer local-only ART source/evidence exists that is not safely represented remotely, STOP and report it. Do not stash/reset/clean/commit for migration convenience.

## Gate 1 — verify remote reconstructability

Require the latest accepted ART review checkpoint to be remotely reachable at the exact authoritative SHA.

Also verify R1/R2/R3 historical checkpoint refs remain remotely reachable, but do not recreate all three worktrees unless needed. The J-side active review workspace should normally use the latest R3 review checkpoint.

If exact authority is not remotely reconstructable, STOP.

## Gate 2 — create J-side ART worktree

Use canonical clone:

`J:\dev\katachi`

Preferred target:

`J:\dev\worktrees\skin-art-research-principles-r3`

If latest authority or established J naming differs, follow the current authoritative branch/name instead.

Create a fresh J-local worktree from the exact remote-authoritative ART review branch/HEAD.

Require:

- branch/HEAD exact match;
- clean state;
- `.git` linkage entirely J-local;
- no link to `C:\dev\katachi\.git`;
- no copied C-side `.git` worktree metadata.

Do not copy node_modules, dist/build output, browser cache, or temp files.

## Gate 3 — lightweight ART smoke check

Install normal dependencies from lockfile only if required.

Run only bounded checks sufficient to prove the review workspace is usable, preferably:

- existing R3 focused tests if cheap;
- build/typecheck if already standard and reasonably quick;
- launch the existing R3 route only if safe and useful.

Do not modify ART code to make the migration pass.
Do not create new captures/studies as artistic work.

## Gate 4 — preferred-workspace switch

After PASS:

- designate the J-side ART R3 worktree as the preferred workspace for future ART review/work;
- leave C-side ART state intact as rollback/evidence;
- do not delete/prune/repair the C-side worktree;
- do not begin Round 04.

Future ART author review or bounded ART work must start from the J-side workspace.

## Output

Return only:

```text
Overall SOL review用:

ART authority read from main: <branch + HEAD + phase>
remote reconstructability: <PASS/FAIL>
C-side ART path/state: <path + branch/HEAD + clean/dirty or NOT FOUND>
newer local-only ART work found?: <NO/YES + summary>
active ART process found?: <NO/YES + summary>
J canonical clone: <path + main SHA>
J ART worktree: <path>
J ART branch/HEAD: <branch + SHA>
J worktree clean: <YES/NO>
C-linked git metadata remaining in J worktree?: <NO/YES>
smoke check: <PASS/FAIL + concise evidence>
future ART preferred workspace: <J path / NOT SWITCHED>
C original retained?: YES
AB/Viewer active state touched?: NO
new ART implementation started?: NO
ART J cutover complete?: <YES/NO>
blocker: <NONE or one line>
```

## Done when

The latest remote-authoritative ART review checkpoint has been reconstructed as a clean J-local worktree, lightly smoke-verified, and designated as the preferred workspace for future ART review/work, while C-side ART state remains untouched for rollback/evidence.

STOP. Do not start Round 04 or any new ART implementation.
