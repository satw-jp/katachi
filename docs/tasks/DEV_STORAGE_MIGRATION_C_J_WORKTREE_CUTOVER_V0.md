# DEV Storage Migration — C J: Worktree Cutover v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — C CUTOVER WHILE C IS STOPPED

## Purpose

Move Team C's preferred active development workspace from the retained C: topology to a J-local worktree while C is at a clean implementation boundary.

This task is infrastructure-only. It does not authorize new C feature work, Support redesign, durability work, Outside→Outside Support implementation, or Production changes.

## Current authority

Re-read latest `main:docs/status/C_CURRENT.md` before execution. At task creation, the accepted C state is:

- FIELD vNext Interaction Correctness v0: PASS / CLOSED
- accepted branch: `agent/skin-field-vnext-interaction-v0`
- accepted checkpoint: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- C work: STOPPED for 2026-09-07
- no active implementation instruction

If CURRENT has advanced, preserve the newer authority and STOP if the new state is active or ambiguous.

## Preconditions

1. `J:\dev\katachi` exists as the verified J-side canonical clone.
2. J primary working tree is clean enough for worktree creation/fetch.
3. The exact accepted C checkpoint is remotely reachable.
4. No newer dirty/unpushed C state exists in the C-side worktree that supersedes the accepted remote checkpoint.
5. No C worker/dev server/editor task is actively writing to the source worktree.
6. AB A2 Sparse Support Performance remains ACTIVE and must not be touched.

If any newer local-only C source state exists, STOP and report it. Do not stash, reset, commit, clean, or overwrite it for convenience.

## Target

Preferred J worktree path:

`J:\dev\worktrees\skin-field-vnext-interaction-v0`

If an established J naming convention clearly requires another path, follow that convention and report it.

The new worktree must be backed only by the J-side canonical clone. It must not point to `C:\dev\katachi\.git` or any C-side linked-worktree metadata.

## Phase 1 — verify source authority

Record:

- latest C CURRENT authority
- accepted branch / HEAD
- C-side source worktree path if present
- C-side branch / HEAD / clean-dirty status
- whether any local-only tracked or untracked source state exists beyond accepted authority
- remote reachability of the accepted branch / HEAD

Do not inspect or modify AB-active paths.

## Phase 2 — create J-local C worktree

From `J:\dev\katachi`:

1. refresh/fetch remote refs safely;
2. create a new J-local worktree at the exact accepted C branch / checkpoint;
3. do not raw-copy the C worktree or its `.git` file;
4. do not repair/prune/remove the C-side worktree topology;
5. verify branch / HEAD / clean status;
6. verify Git metadata resolves entirely through `J:\dev\katachi`;
7. do not copy `node_modules`, dist/build outputs, caches, browser data, temp files, or Drive temp state.

If Git prevents creating the branch because it is checked out on C, use a safe J-local reconstruction method that preserves the exact authoritative commit without modifying or detaching the C-side source. If ownership would become ambiguous, STOP and report the conflict.

## Phase 3 — bounded smoke verification

Run only cheap checks needed to prove the J-side C workspace is usable and semantically identical to the accepted checkpoint, preferably:

- branch / HEAD / clean verification;
- existing focused FIELD vNext interaction tests;
- the cheapest relevant typecheck/build only if already standard and reasonably quick;
- no full Production regeneration unless already required by an established cheap parity check.

Do not change C source merely to make migration pass.

Do not start:

- Outside→Outside Support
- durability audit
- Usagi strong-overhang work
- Permanent Structure redesign
- Production / Support / Export changes
- any new C implementation task

## Phase 4 — preferred workspace switch

After smoke PASS:

- designate the J-side C worktree as the preferred location for all future C work;
- future C SOL/LUNA implementation must begin from the J-side workspace;
- retain the C-side original unchanged as rollback/evidence storage;
- do not delete, rename, prune, repair, or clean the C-side original in this task.

Do not alter AB or compute runtime state.

## Relationship to Research / Support work

This migration intentionally occurs before any new C Support implementation.

Astra / Research may continue investigating integrated Permanent Structure + residual removable Support / Outside→Outside concepts independently. This task must not translate those ideas into C Production.

After C cutover PASS, C remains STOPPED until the author or C SOL explicitly authorizes a new bounded C task.

## Hard prohibitions

Do not:

- modify AB A2 active worktrees, artifacts, or performance state;
- stop/start the compute helper runtime;
- implement Outside→Outside Support;
- start C durability audit;
- modify Production geometry, Graph, Support, export, FKEI, or FIELD semantics;
- raw-copy/move the C primary repo or worktree Git metadata;
- reset/rebase/stash/clean/force-push;
- delete any C original.

## Output

Return only:

```text
Overall SOL review用:

C authority read from main: <branch + HEAD + phase>
remote reconstructability: <PASS/FAIL>
C-side source path/state: <path + branch/HEAD/clean-dirty>
newer local-only C work found?: <NO/YES + summary>
J canonical clone: <path + main SHA>
J C worktree: <path>
J C branch/HEAD: <branch + SHA>
J worktree clean: <YES/NO>
C-linked git metadata remaining in J worktree?: <NO/YES>
smoke check: <PASS/FAIL + concise evidence>
future C preferred workspace: <J path / NOT SWITCHED>
C original retained?: YES
AB active state touched?: NO
new C implementation started?: NO
C J cutover complete?: <YES/NO>
blocker: <NONE or one line>
```

## Done when

The exact accepted remote-authoritative C state has been reconstructed as a clean J-local worktree, smoke-verified, and designated as the preferred workspace for future C work while the C-side original and AB-active state remain untouched.

STOP. Do not begin new C implementation.
