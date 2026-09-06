# DEV Storage Migration — Partial Safe Stage C:→J: v0

Date: 2026-09-06
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: ACTIVE — PARTIAL SAFE MIGRATION ONLY

## Purpose

Move or stage only the parts of the Windows development environment that can be handled safely **now**, while AB Temporary SOL / A2 regeneration remains active.

This is not the final cutover. The active primary Katachi repo and any linked worktree sharing its Git metadata remain untouched until a later maintenance window.

## Read first

- `docs/TEAM_REPORTING_RULES.md`
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/HANA_CURRENT.md`
- `docs/tasks/DEV_STORAGE_MIGRATION_INVENTORY_C_TO_J_V0.md`
- `docs/tasks/DEV_STORAGE_MIGRATION_REPO_DISCOVERY_C_TO_J_V0.md`
- `docs/tasks/DEV_STORAGE_MIGRATION_PRESERVATION_LEDGER_V0.md`
- local `docs/infrastructure/DEV_STORAGE_MIGRATION_C_TO_J_INVENTORY.md` if present
- this task

## Hard boundary — AB ACTIVE

AB Temporary SOL / A2 regeneration is ACTIVE.

Do not touch:

- `C:\dev\katachi` working tree or its active AB files;
- any AB-active linked worktree;
- the J-backed task-a2 dirty worktree;
- active A2 generated artifact internals;
- the primary `.git` worktree metadata in a way that adds/removes/moves/prunes linked worktrees.

Do not stop processes, rename paths, run worktree repair/prune, checkout, reset, rebase, merge, stash, or clean.

If there is any uncertainty whether a path is used by AB, classify it `DEFER — AB ACTIVE`.

## Gate 0 — verify J: is suitable for development

Before creating `J:\dev` content, determine what `J:` actually is.

Record read-only evidence for:

- filesystem / volume type;
- whether J: is a local fixed volume, removable volume, network path, Cloud/DriveFS virtual volume, or a folder/drive actively managed by Google Drive for desktop;
- whether `J:\dev` itself is inside a Google Drive synced/virtual namespace;
- available free space.

`J:\My Drive\...` exists in current project evidence, so **do not assume J: is a normal local development disk**.

### Gate result

- If `J:\dev` is on a normal local filesystem suitable for Git/worktrees: continue.
- If J: is Google Drive / DriveFS / cloud virtual storage or otherwise unsuitable for high-churn Git/node_modules/worktree use: **STOP all J-side repo staging** and report `J DEV TARGET UNSUITABLE`. Remote-preservation actions that do not touch AB may still continue.
- Do not choose another drive automatically.

## Phase 1 — remote preservation that is already classified safe

Using the preservation ledger, process only category B items that are:

- clean committed refs;
- not AB-active;
- explicitly classified `PRESERVE REMOTELY`;
- exact local SHA known;
- no conflicting same-name remote SHA.

Expected category includes clean no-upstream CUDA / integration / support / performance refs and C golden baseline refs already classified by the ledger.

For each:

1. verify local exact SHA;
2. verify no dirty associated worktree is being treated as part of this preservation;
3. check remote reachability / same-name ref;
4. if same SHA already reachable: mark `ALREADY PRESERVED`;
5. if same-name remote absent and exact ref is authorized by the ledger: push exact existing branch/ref;
6. if remote same-name differs or ownership/authority is ambiguous: STOP that item and classify F / SOL REVIEW;
7. never force-push.

Do **not** push or modify the active AB validator/task refs merely as part of this task.

HANA viewport/projection refs are already preserved; verify only if cheap, do not repeat unnecessary writes.

## Phase 2 — stage independent reconstructable repos on J:\dev

Only if Gate 0 PASS.

Consider only **separate clones / independent repos** that do not share `C:\dev\katachi\.git` and are not currently active.

Known candidates from inventory include:

- `C:\dev\katachi-c-checkpoint`
- `C:\dev\katachi-support-coverage`
- `C:\dev\hikari2`
- `C:\dev\katachi-compute-helper-tray` if it is an independent clean origin-backed repo/workspace and not active

For each candidate:

1. inspect exact repo type, remote, branch, HEAD, status;
2. require clean state and confirmed remote reconstructability;
3. if target `J:\dev\<name>` already exists, do not overwrite — inspect and report;
4. prefer a fresh clone / exact branch checkout on J rather than moving the C directory;
5. verify exact intended HEAD/reachability after recreation;
6. run only lightweight smoke checks that do not require large installs or builds unless already available;
7. keep the C copy unchanged.

Do not copy `node_modules`, `dist`, build cache, browser cache, or temp data into the new clone.

This phase is **staging**, not destructive cutover. C copies remain until final migration verification.

## Phase 3 — preserve independent local-only file/artifact workspaces to J

Only if Gate 0 PASS and the source path is not active.

From category C, consider independent non-AB items such as:

- `C:\dev\astra-usagi`
- `C:\dev\samples`
- `C:\dev\field-vnext-checkpoint-recovery`
- other recovery artifacts / local-only configs identified by the ledger

Do not blindly copy an entire dirty linked Git worktree with path-bound `.git` metadata and call that migrated.

For each item:

- first classify whether it is a normal directory, independent repo, or linked worktree;
- exclude clearly rebuildable `node_modules`, dist/build/cache/temp where safe;
- preserve local-only source/artifact/config bytes to a clearly named staging location such as `J:\dev\_preserve\<name>`;
- record source path, destination path, file count / size, and verification evidence;
- for small critical files, use hashes where cheap;
- for large trees, use copy tool verification / counts rather than expensive hashing of every file.

### Dirty linked worktrees

For dirty linked worktrees such as historical C Field vNext, do not "move" the worktree while the primary Git metadata remains on C.

Instead, if not active and owner classification permits preservation, create a non-mutating preservation package on J containing:

- branch / HEAD metadata;
- `git status --short --branch` output;
- a binary-capable patch of tracked changes where practical;
- copies of untracked files needed to reproduce the local state;
- a short manifest explaining the source path and intended owner.

Do not commit/stash/reset the source worktree.

If the dirty state is too large or authority is unclear, leave it on C and report `DEFER / SOL REVIEW`.

## Phase 4 — do NOT move cache/temp yet unless ownership is proven

Do not migrate or delete:

- `C:\dev\.tmp.driveupload` until ownership / active Google Drive handling is understood;
- active Drive staging data;
- unknown temp directories with open handles.

`.tmp.drivedownload`, `node_modules`, build/dist and clearly rebuildable caches may be recorded as future cleanup candidates, but this task does not need to copy them to J.

## C task boundary

Current C task `FIELD vNext Interaction Correctness v0` is intentionally **not started** by this migration task.

Preserve the accepted C baseline/evidence and leave new C implementation until after the future main dev cutover unless C SOL explicitly reprioritizes it.

## Verification

For every item actually staged/preserved now, record:

- source path/ref;
- destination path/ref;
- category (B/C/D);
- exact branch/HEAD where applicable;
- clean/dirty source status;
- verification result;
- whether original C copy remains intact.

No item counts as migrated merely because copy/clone command returned success.

## Output

Update the local infrastructure inventory report if practical, but do not require a Git commit from an active/dirty primary worktree.

Return only:

```text
Overall SOL review用:

J: suitability: <PASS local dev volume / UNSUITABLE / UNKNOWN>
remote refs preserved now: <summary>
independent repos staged on J: <summary>
file/artifact workspaces preserved on J: <summary>
items skipped due AB ACTIVE: <summary>
items skipped due authority/dirty ambiguity: <summary>
C originals deleted?: NO
partial migration completed safely?: YES/NO
remaining blockers for final cutover: <summary>
```

## Hard prohibitions

Do not:

- delete any C original;
- move/rename `C:\dev\katachi`;
- move/remove/repair/prune primary linked worktrees;
- touch AB-active paths beyond cheap safe metadata reads;
- clean caches from C in this task;
- force-push;
- commit dirty source merely for migration convenience;
- start C FIELD vNext Interaction Correctness implementation;
- change Production / Support / HANA / ART semantics;
- place new dev repos inside Google Drive / DriveFS if J: is a cloud virtual volume.

## Done when

The safe independent subset is remotely preserved and/or staged on J without changing active project state, and Overall SOL has a precise list of what still must wait for the final maintenance window.
