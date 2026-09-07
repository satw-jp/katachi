# DEV Storage Migration — Final Wave v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — COMPLETE MIGRATION, DO NOT DELETE C YET

## Purpose

Finish the remaining C: -> J: development-environment migration now that the major Katachi lanes have reached clean J-side checkpoints.

This task is the final migration wave, not the destructive cleanup task.

Goal:

1. move the live compute/helper runtime authority to J;
2. preserve every remaining local-only / historical / infrastructure byte that could still matter;
3. verify the already-migrated J workspaces and user-owned samples authority;
4. classify the retained C-side development tree as either safe-to-retire or still blocked;
5. leave actual C-side deletion to a later explicit cleanup gate.

## Current known state

Re-read latest main before execution and preserve any newer authority.

### J-side lane workspaces already migrated

- HANA: `J:\dev\worktrees\hana-viewport-context-topbar-v0`
- C: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- ART: `J:\dev\worktrees\skin-art-research-principles-r3`
- Viewer: `J:\dev\worktrees\fkei-analysis-viewer-v0`
- AB: `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`

AB authority at task creation:

- branch: `agent/skin-a2-sparse-support-performance-v1`
- HEAD: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- Performance v1: PASS / CLOSED
- no performance implementation active
- Performance v2 NOT started
- G/H/J HOLD

### J-side shared / preserved items already present

- canonical clone: `J:\dev\katachi`
- staged compute source: `J:\dev\katachi-compute-helper-tray`
- independent repos already verified on J:
  - `katachi-c-checkpoint`
  - `katachi-support-coverage`
  - `hikari2`
- preserved local-only data:
  - `J:\dev\_preserve\astra-usagi`
  - FIELD recovery artifacts
- user-owned shared input data has been manually moved by the author to:
  - `J:\dev\samples`

Treat `J:\dev\samples` as the canonical samples path. Do not reorganize, rename, delete, or commit its contents.

### Important retained C-side state

- live compute/helper runtime may still be C-authoritative until this task proves J cutover;
- `C:\dev\katachi` may contain user-owned untracked `docs\infrastructure\` work;
- historical integration / CUDA / reinforcement / recovery workspaces may still require preservation classification;
- old C-side migrated worktrees remain rollback/evidence copies;
- C-side cache/temp data is not migration authority.

## Required reading

1. this task
2. latest `docs/status/AB_CURRENT.md` front
3. latest `docs/status/C_CURRENT.md` front
4. `docs/tasks/DEV_STORAGE_MIGRATION_COMPUTE_HELPER_CONTROLLED_CUTOVER_V0.md`
5. latest migration preservation / pre-cleanup ledger task or report if available
6. `docs/protocol/LOCAL_DIRTY_WORK.md`

Do not preload unrelated lane history.

# Phase 1 — compute/helper live runtime cutover

Execute the existing controlled-cutover gates from:

`docs/tasks/DEV_STORAGE_MIGRATION_COMPUTE_HELPER_CONTROLLED_CUTOVER_V0.md`

with the current-state clarification that AB Performance v1 is now CLOSED and AB has moved to J.

Before stop/start:

- prove the exact running helper identity;
- prove no active compute job/request is in progress;
- verify no active AB/C operation currently depends on the live request stream;
- verify `J:\dev\katachi-compute-helper-tray` is complete enough to start;
- preserve required non-secret local runtime config.

Then, only if the idle/identity gates PASS:

1. stop only the identified C-side compute/helper runtime;
2. start the same runtime contract from J;
3. preserve intended endpoint/port behavior where possible;
4. verify process stability, health/status, endpoint parity, and any lightweight existing CUDA/helper self-check;
5. update compute-specific launcher/autostart path only when ownership is clear;
6. keep the C source/runtime copy intact for rollback.

If identity or idle state cannot be proven, STOP Phase 1 and report the exact blocker. Do not guess.

# Phase 2 — J-side C client connection verification handoff

After compute cutover PASS, perform only the infrastructure-level handoff needed for Team C:

- record the verified J compute endpoint / health contract without exposing secrets;
- confirm the endpoint contract is the same or explicitly record any necessary local path/runtime change;
- do not modify C Production semantics.

Team C owns the actual C-specific connection / health / runtime-setting check from:

`J:\dev\worktrees\skin-field-vnext-interaction-v0`

If a Team C worker is available under the same maintenance window, it may perform only:

- connection check;
- helper health check;
- C-specific runtime configuration verification;
- lightweight smoke request if already established and safe.

Do not start durability audit, Outside->Outside Support, new Production work, or other C feature implementation.

If Team C is not available in this task context, return a precise handoff and continue the migration-preservation phases; do not block preservation work solely on the client check.

# Phase 3 — preserve remaining user/local-only infrastructure state

## 3A. `C:\dev\katachi\docs\infrastructure\`

This is user-owned / migration-owned untracked state and was intentionally excluded from AB migration.

Do not commit or delete it for convenience.

If it still exists and contains local-only bytes not represented on J/GitHub:

- copy/preserve it under a clearly named J preservation location, preferably:
  - `J:\dev\_preserve\c-katachi-docs-infrastructure`
- preserve file names and relative structure;
- record source/destination, file count, size, and cheap verification;
- do not mutate the source.

If equivalent content is already safely represented on J/GitHub, prove that before classifying the C copy as redundant.

## 3B. historical integration / CUDA / reinforcement / recovery workspaces

Re-enumerate only the known remaining historical workspaces under `C:\dev` that were previously authority-unclear.

For each item classify:

- clean + exact remote reachable -> `REMOTE RECONSTRUCTABLE`;
- already exact-equivalent on J -> `J VERIFIED`;
- local-only / dirty / authority-unclear but potentially meaningful -> `PRESERVE BYTES ON J`;
- obvious cache/build output only -> `REBUILDABLE / CLEANUP CANDIDATE`.

For `PRESERVE BYTES ON J` items:

- preserve under `J:\dev\_preserve\historical\<name>`;
- do not copy path-bound linked-worktree `.git` metadata as canonical;
- for dirty Git worktrees preserve reproduction material instead: branch/HEAD/status, tracked patch, required untracked files, short manifest;
- exclude `node_modules`, dist/build/cache when clearly rebuildable;
- do not make semantic KEEP/DISCARD decisions just to finish migration.

Migration completeness requires that no potentially meaningful local-only bytes remain solely on C; it does not require deciding whether historical research should ever be reused.

# Phase 4 — samples canonical-path verification

The author manually moved the shared input samples to:

`J:\dev\samples`

Verify only:

- target exists;
- it is readable;
- broad file count/size is plausible if the old C copy still exists;
- no migration-owned launcher/task is knowingly hard-coded to `C:\dev\samples`.

Do not alter sample contents.

If old path references exist, report them for the owning SOL/team to update on next use; do not interrupt unrelated work only to rewrite dormant references.

Canonical samples authority after this task is `J:\dev\samples`.

# Phase 5 — final J-side migration verification

Verify the migration topology without running expensive project workloads:

- canonical J clone exists and is healthy;
- HANA/C/ART/Viewer/AB preferred J worktrees exist at their accepted authority checkpoints or newer CURRENT-authorized checkpoints;
- no J worktree links Git metadata back to `C:\dev\katachi\.git`;
- compute live authority is J if Phase 1 PASS;
- user samples authority is J;
- independent repos / preserved local-only artifacts listed above exist on J;
- no known meaningful local-only development state remains solely on C except explicitly blocked items.

Do not rerun Full A2 merely to prove migration.

# Phase 6 — C-side retirement classification only

Do NOT delete anything in this task.

Classify every remaining significant `C:\dev` item into exactly one:

1. `SAFE TO RETIRE AFTER FINAL CLEANUP GATE`
2. `ROLLBACK RETAIN TEMPORARILY`
3. `BLOCKED — STILL C-AUTHORITATIVE`
4. `CACHE/TEMP — CLEANUP CANDIDATE`
5. `OWNER REVIEW OUTSIDE MIGRATION`

At minimum classify:

- `C:\dev\katachi` primary repo;
- linked C worktrees;
- old HANA/C rollback worktrees;
- old compute helper source/runtime directory;
- historical workspaces processed in Phase 3;
- old `C:\dev\samples` if still present;
- package/build caches;
- `.tmp.driveupload` / `.tmp.drivedownload`.

For DriveFS temp directories, do not call them safe-to-delete unless ownership/open-handle meaning is proven. They may remain `OWNER REVIEW OUTSIDE MIGRATION`.

# Hard prohibitions

Do not:

- start AB Performance v2;
- start G/H/J;
- start C durability / Outside->Outside / new Production work;
- start new Viewer/ART/HANA implementation;
- change geometry/support/FKEI semantics;
- commit user-owned `docs\infrastructure\` merely for migration;
- delete C originals;
- prune/repair C worktree topology;
- force-push/reset/rebase/stash for convenience;
- expose secret config values;
- delete DriveFS temp data based on name alone.

# Output

Return only:

```text
Overall SOL review用:

compute identity/idle gate: <PASS/FAIL + summary>
compute live authority after task: <J path / C retained authority>
compute endpoint/health parity: <PASS/FAIL/DEFER>
Team C connection verification: <PASS/DEFER + summary>
user docs/infrastructure preserved on J: <PASS/NOT NEEDED/FAIL + path>
historical workspaces: <count + REMOTE/J VERIFIED/PRESERVED/REBUILDABLE summary>
samples canonical path verification: <PASS/FAIL + J path>
major J lane workspaces verified: <summary>
J worktrees with C-linked git metadata remaining?: <NO/YES + paths>
meaningful local-only development state remaining solely on C?: <NO/YES + exact items>
C primary repo retirement classification: <classification + reason>
old C worktrees retirement classification: <summary>
compute C original retirement classification: <summary>
cache/temp classification: <summary>
final migration complete?: <YES/NO>
ready for separate destructive C cleanup gate?: <YES/NO>
blocker: <NONE or concise exact blocker>
```

# Done when

The live compute/runtime authority is moved to J or explicitly blocked with evidence; all potentially meaningful residual local-only development bytes are protected on J/GitHub; samples are recognized at the J canonical path; major J workspaces are verified independent of C Git metadata; and the remaining C-side development tree is fully classified for a separate destructive cleanup decision.

STOP. Do not delete C-side development content in this task.
