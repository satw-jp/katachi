# DEV Storage Migration — AB J Worktree Cutover v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — CUTOVER BEFORE PERFORMANCE V2

## Purpose

Move Team AB's accepted Performance v1 checkpoint to a clean J-local worktree before any Performance v2 work begins.

This is a workspace migration only. It does not authorize Performance v2, G/H/J, new Support architecture, compute architecture changes, or physical-comparison execution.

## Current AB authority to preserve

Re-read latest `main:docs/status/AB_CURRENT.md` before execution. At task creation the accepted authority is:

- branch: `agent/skin-a2-sparse-support-performance-v1`
- accepted HEAD: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- Performance v1: PASS / CLOSED
- focused tests: 37/37 PASS
- build / TypeScript / validation / exact parity: PASS
- accepted Full A2 runtime: `528,025.4 ms` (~8m48s)
- Performance v2: NOT STARTED
- G/H/J: HOLD
- new Support architecture: HOLD

If `AB_CURRENT.md` has advanced beyond this checkpoint, preserve the newer authority and STOP if the newer state is active or not yet clean.

## Required reading

1. this task
2. latest `docs/status/AB_CURRENT.md` front
3. `docs/protocol/LOCAL_DIRTY_WORK.md`
4. latest migration pre-cleanup ledger / relevant migration status only as needed

Do not preload unrelated project history.

## Hard boundaries

Do not:

- start Performance v2;
- run G/H/J;
- change Candidate / Support / Rabbit / FKEI semantics;
- modify compute/helper runtime or endpoint;
- change CUDA / WebGPU / native / worker architecture;
- delete or clean any C-side AB workspace;
- reset/rebase/stash/clean local state;
- force-push;
- repair/prune C-side worktree topology;
- touch unrelated untracked user work such as existing `docs/infrastructure/` merely because it is present on C.

## Gate 0 — confirm clean checkpoint

Before migration, verify:

- latest main still marks Performance v1 PASS / CLOSED;
- exact accepted AB branch / HEAD is remotely reachable;
- the C-side AB source worktree is at the accepted authority or otherwise clearly classified;
- no newer uncommitted/unpushed AB source work exists;
- no AB implementation worker / benchmark / dev process is actively writing to the source worktree;
- Performance v2 has not started.

If newer local-only AB work exists or an AB process is active, STOP and report it.

## Gate 1 — preserve unrelated C-side local work

The author has identified existing untracked `docs/infrastructure/` work on C which is not part of the accepted AB Performance v1 commit.

Treat it as separate user/local work:

- do not commit it into AB;
- do not delete/clean it;
- do not copy it into the J AB worktree as if it were AB authority;
- record its presence only if observed;
- leave preservation/migration decision for that local work to a separate cleanup task.

This local work must not block AB cutover if it is outside the AB source worktree / authority and can be left untouched.

## Gate 2 — create J-local AB worktree

Use the canonical J repo:

`J:\dev\katachi`

Preferred target:

`J:\dev\worktrees\skin-a2-sparse-support-performance-v1`

Steps:

1. fetch remote refs from the J canonical clone;
2. verify the accepted AB branch and exact HEAD;
3. create/reconstruct a J-local worktree for the exact authority branch/HEAD;
4. do not copy C-side `.git` / worktree metadata;
5. verify the J worktree's Git metadata is entirely J-local;
6. do not copy `node_modules`, dist/build/cache/temp from C;
7. verify branch, exact HEAD, clean state, remote reachability.

If target already exists, inspect it; do not overwrite blindly.

## Gate 3 — lightweight AB smoke verification on J

Bootstrap normal dependencies from lockfile only if needed.

Run bounded checks sufficient to prove the J workspace is ready for the next AB task without repeating the expensive full A2 benchmark solely for migration.

Preferred:

- accepted AB focused tests;
- TypeScript checks / build if standard and reasonably quick;
- `git diff --check`;
- lightweight route/dev-server smoke only if useful and non-invasive.

Do **not** rerun Full A2 (~8m48s) merely to prove migration unless the accepted task explicitly requires it. The purpose here is workspace reconstruction, not performance revalidation.

If path assumptions depend on C-specific absolute paths, report them. Fix only local infrastructure pathing when clearly bounded and non-semantic; otherwise STOP for SOL review.

## Gate 4 — preferred-workspace switch

After PASS:

- designate `J:\dev\worktrees\skin-a2-sparse-support-performance-v1` as the preferred workspace for future Team AB work;
- future Performance v2, if later authorized, must start from the J-side workspace / accepted checkpoint;
- retain C-side AB source as rollback/evidence storage for now;
- do not delete or prune the C-side original in this task.

## Relationship to compute cutover

AB Performance v1 closure removes the previous active-performance blocker, but this task does not automatically authorize compute/helper live-runtime cutover.

After AB J cutover PASS, Overall SOL may separately run the existing controlled compute/helper cutover task if idle/identity gates pass.

Do not change C or AB compute endpoint/connection settings inside this task.

## Output

Return only:

```text
Overall SOL review用:

AB authority read from main: <branch / HEAD / PASS-CLOSED>
remote reconstructability: <PASS/FAIL>
C-side AB path/state: <path + branch/HEAD/clean-dirty>
newer local-only AB work found?: <NO/YES + summary>
active AB process found?: <NO/YES + summary>
untracked docs/infrastructure touched?: NO
J canonical clone: <path + main SHA>
J AB worktree: <path>
J AB branch/HEAD: <branch + SHA>
J worktree clean: <YES/NO>
C-linked git metadata remaining in J worktree?: <NO/YES>
smoke check: <PASS/FAIL + concise evidence>
future AB preferred workspace: <J path / NOT SWITCHED>
C original retained?: YES
Performance v2 started?: NO
G/H/J started?: NO
AB J cutover complete?: <YES/NO>
blocker: <NONE or one line>
```

## Done when

The accepted Performance v1 checkpoint is reconstructed as a clean, exact-authority J-local AB worktree, lightly smoke-verified, and designated as the preferred Team AB workspace; C-side AB state and unrelated untracked user work remain untouched; Performance v2 and G/H/J remain unstarted.

STOP for Overall SOL review.
