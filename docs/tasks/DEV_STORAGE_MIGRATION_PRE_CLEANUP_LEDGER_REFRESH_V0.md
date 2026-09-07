# DEV Storage Migration — Pre-Cleanup Ledger Refresh v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — READ-ONLY REFRESH WHILE AB / VIEWER ACTIVE

## Purpose

Refresh the C: -> J: migration preservation ledger after the successful J cutovers already completed, so Overall SOL has one current list of what is already safe on J, what still blocks final cleanup, and what the next migration action should be once active work reaches a clean checkpoint.

This task is classification / verification only. It does not authorize deletion, worktree removal, runtime switching, or feature work.

## Current migration facts to treat as known starting points

Re-read latest CURRENT / migration evidence before execution and preserve newer authority if state has advanced.

At task creation:

- canonical J clone exists at `J:\dev\katachi`;
- HANA J cutover is complete; preferred workspace is `J:\dev\worktrees\hana-viewport-context-topbar-v0`;
- C J cutover and J runtime bootstrap are complete; preferred workspace is `J:\dev\worktrees\skin-field-vnext-interaction-v0`;
- ART J cutover is complete; preferred workspace is `J:\dev\worktrees\skin-art-research-principles-r3`;
- `katachi-c-checkpoint`, `katachi-support-coverage`, and `hikari2` were already verified as clean J-side independent repos;
- `J:\dev\_preserve\astra-usagi` and field-vnext recovery preservation have completed;
- compute/helper source has been staged on J, but the live runtime cutover is still pending;
- AB A2 performance work remains active and must not be disturbed;
- Viewer Surface alignment work is active and must not be disturbed;
- `C:\dev\samples` remains NO-TOUCH / authority-ambiguous unless newer evidence resolves it;
- C-side originals are still intentionally retained.

## Required reading

1. this task
2. latest `docs/status/AB_CURRENT.md` front
3. latest `docs/status/C_CURRENT.md` front
4. latest `docs/status/HANA_CURRENT.md` front
5. latest `docs/status/ART_CURRENT.md` front
6. latest `docs/status/VIEWER_CURRENT.md` front
7. `docs/tasks/DEV_STORAGE_MIGRATION_PRESERVATION_LEDGER_V0.md`
8. `docs/tasks/DEV_STORAGE_MIGRATION_REMAINING_SAFE_STAGE_V1.md`
9. `docs/protocol/LOCAL_DIRTY_WORK.md`

Do not preload unrelated project philosophy or implementation history.

## Hard boundaries

Do not modify or interrupt:

- active AB worktree / process / benchmark / A2 artifacts;
- active Viewer worktree / process / Surface alignment task;
- compute/helper live runtime;
- C / HANA / ART J worktrees except cheap read-only verification;
- `C:\dev\samples` contents;
- primary C-side Git/worktree topology.

No delete, move, rename, prune, repair, reset, rebase, stash, checkout, install, build, push, force-push, process stop/start, or cache cleanup.

If ownership or activity is uncertain, classify as HOLD rather than probing aggressively.

## Phase 1 — refresh active blockers

Record current state for:

- AB active worktree/path/branch/HEAD/status if cheaply obtainable without contention;
- Viewer active worktree/path/branch/HEAD/status if cheaply obtainable without contention;
- compute/helper live runtime identity and whether cutover remains blocked by AB or unknown idle state;
- any newly active lane/process discovered since the previous migration stage.

Do not perform expensive recursive scans on active paths.

## Phase 2 — verify already migrated / preserved items

Cheaply verify the existence and intended role of:

- `J:\dev\katachi`;
- HANA J worktree;
- C J worktree;
- ART J worktree;
- `J:\dev\katachi-compute-helper-tray` staging clone;
- J-side `katachi-c-checkpoint`;
- J-side `katachi-support-coverage`;
- J-side `hikari2`;
- `J:\dev\_preserve\astra-usagi`;
- preserved field recovery package/workspace.

Do not rerun full builds/tests unless a cheap metadata check is insufficient to determine whether the item still exists in the intended place.

Classify these as `J VERIFIED` when the prior migration evidence remains coherent.

## Phase 3 — classify every meaningful remaining C-side item

Using the prior inventory/ledger plus a bounded current top-level inspection of `C:\dev`, assign every meaningful remaining item to exactly one of:

### A — ACTIVE / WAIT
Still used by AB, Viewer, compute runtime, or another active task/process. No action now.

### B — J VERIFIED / C RETAINED FOR ROLLBACK
Equivalent authoritative state already exists on J or GitHub and the C copy is retained only because final cleanup is not yet authorized.

### C — PRESERVED ON J / C RETAINED FOR ROLLBACK
Local-only source/artifact state has already been copied/preserved on J with prior verification.

### D — NEXT CUTOVER AFTER ACTIVE CHECKPOINT
A real runtime/worktree still on C that should move after its owning active task reaches a clean checkpoint. Record the exact next trigger, e.g. `AB performance clean checkpoint` or `Viewer alignment PASS`.

### E — OWNER / AUTHORITY REVIEW
Still ambiguous. Examples may include `C:\dev\samples`, historical workspaces, unknown configs, or old refs. Record the smallest owner decision needed.

### F — CACHE / TEMP / FUTURE CLEANUP
Rebuildable or temporary data that should not be migrated, but may later be deleted once final cleanup is authorized. Keep Google Drive temp ownership ambiguity explicit; do not assume `.tmp.driveupload` is safe to delete.

## Phase 4 — determine the next concrete migration order

Without performing the actions, produce the preferred next order after this refresh.

Expected logic:

1. if Viewer finishes before AB and has a clean remote checkpoint, Viewer J cutover may become the next lane cutover;
2. when AB reaches a clean performance checkpoint, decide whether AB J cutover should occur before compute live runtime cutover or whether compute can switch first in an idle window;
3. compute live runtime cutover must happen before C is told to adopt the J-side compute endpoint/runtime;
4. only after active work and runtime migration are closed should final C-side cleanup/deletion be scoped;
5. authority-ambiguous `samples` / Drive temp / historical local-only states remain HOLD until explicitly resolved.

Do not invent a migration for a lane that is still active or lacks a remote-authoritative checkpoint.

## Output

Return only:

```text
Overall SOL review用:

A ACTIVE / WAIT: <summary>
B J VERIFIED / C ROLLBACK: <summary>
C PRESERVED ON J / C ROLLBACK: <summary>
D NEXT CUTOVER AFTER ACTIVE CHECKPOINT: <summary>
E OWNER / AUTHORITY REVIEW: <summary>
F CACHE / TEMP / FUTURE CLEANUP: <summary>
compute live cutover status: <PENDING/READY + reason>
Viewer migration status: <ACTIVE/READY/ALREADY J + summary>
AB migration status: <ACTIVE/READY + summary>
remaining C-side authoritative-only state not yet protected on J/GitHub?: <NO/YES + summary>
next recommended migration action: <one concrete next action or WAIT FOR ...>
final C cleanup safe now?: NO
ledger refresh complete?: <YES/NO>
blocker: <NONE or one line>
```

## Done when

Overall SOL can answer, from one refreshed snapshot:

- what is already safely represented on J/GitHub;
- what C copies are rollback-only;
- what still depends on AB / Viewer / compute runtime;
- what remains authority-ambiguous;
- what the exact next migration action should be;
- and why final C-side deletion is still or no longer blocked.

STOP. Do not execute the next cutover or cleanup action from this task.
