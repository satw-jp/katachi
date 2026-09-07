# DEV Storage Migration — Viewer J Worktree Cutover v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — VIEWER CUTOVER

## Purpose

Move the closed FKEI Analysis Viewer v0 development workspace to a J-local worktree now that the Surface spatial-alignment fix and Author Review are PASS / CLOSED.

This task changes only local workspace topology / reconstruction. It does not authorize any new Viewer implementation.

## Required reading

1. this task
2. latest `docs/status/VIEWER_CURRENT.md` front
3. `docs/protocol/LOCAL_DIRTY_WORK.md`

Do not preload unrelated lane history.

## Current Viewer authority to preserve

From latest `VIEWER_CURRENT.md`:

- branch: `agent/fkei-analysis-viewer-v0`
- reviewed HEAD: `55cb6f8440a551ea3695bd4a9ba6a097a0558bac`
- parent reviewed HEAD: `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- current phase: PASS / CLOSED
- active task: NONE
- Surface alignment blocker: CLOSED
- no Viewer expansion authorized

Re-read latest `main` before execution. If Viewer authority has advanced, preserve the newer authority instead.

## Preconditions

Before creating the J-side Viewer worktree:

1. confirm `J:\dev\katachi` exists and is the verified canonical J clone;
2. verify the exact Viewer branch/HEAD is remotely reachable;
3. inspect any existing C-side Viewer worktree if present;
4. verify no newer dirty/unpushed Viewer state exists locally;
5. verify no active Viewer process/editor task is writing to the old Viewer workspace.

If a newer local-only Viewer state exists, STOP and report it. Do not stash/reset/clean it.

## Target

Prefer:

`J:\dev\worktrees\fkei-analysis-viewer-v0`

If an existing J-side naming convention clearly differs, follow that convention.

The J worktree must be associated with `J:\dev\katachi` and must not point back to `C:\dev\katachi\.git` or any C-side worktree metadata.

## Phase 1 — remote reconstructability

Record:

- remote branch ref
- exact branch HEAD
- current Viewer authority from main
- C-side Viewer path/state if found
- whether any newer local-only Viewer work exists

Require exact current Viewer checkpoint remotely reachable and no newer local-only authority.

## Phase 2 — create J-side Viewer worktree

From `J:\dev\katachi`:

1. fetch remote refs;
2. create a J-local worktree for the exact current Viewer branch/HEAD;
3. do not copy/reuse an old worktree `.git` file;
4. do not run worktree repair/prune/remove against C-side topology;
5. verify J worktree branch, HEAD, clean state, and Git linkage are entirely J-local;
6. do not copy `node_modules`, dist/build outputs, browser cache, or temp files.

If Git refuses because the branch is already checked out elsewhere, do not force or detach arbitrarily. Use only a safe reconstruction preserving exact authority and unambiguous future branch ownership, or STOP and report.

## Phase 3 — lightweight Viewer smoke check

Install normal dependencies from lockfiles only if needed.

Run a bounded check sufficient to prove the J-side Viewer workspace is usable, preferably:

- expected branch/HEAD/clean status;
- Viewer focused tests;
- build if reasonably quick;
- Viewer route/dev-server HTTP check if already standard;
- console warning/error check if cheap.

Do not create new Viewer behavior merely to make migration pass.

## Phase 4 — preferred workspace switch

After J-side verification PASS:

- designate the J-side Viewer worktree as the preferred location for future Viewer work;
- leave any C-side Viewer workspace intact as rollback/evidence storage;
- do not delete/move/rename/prune/clean the C-side Viewer workspace in this task.

Future Viewer work requires a new explicit Research question, per `VIEWER_CURRENT.md`.

## Hard prohibitions

Do not:

- start any Viewer expansion;
- add new Void metrics or representations;
- change SKIN Production, FKEI schema, BODY, Permanent Graph, Removable Support, motif, or analysis semantics;
- touch AB active performance state;
- stop/switch compute runtime;
- alter C/HANA/ART worktrees;
- delete C originals;
- repair/prune C-side worktree topology;
- reset/rebase/stash/clean for convenience;
- force-push.

## Output

Return only:

```text
Overall SOL review用:

Viewer authority read from main: <branch + HEAD + phase>
remote reconstructability: <PASS/FAIL>
C-side Viewer path/state: <path/state or NOT FOUND>
newer local-only Viewer work found?: <NO/YES + summary>
active Viewer process found?: <NO/YES + summary>
J canonical clone: <path + main SHA>
J Viewer worktree: <path>
J Viewer branch/HEAD: <branch + SHA>
J worktree clean: <YES/NO>
C-linked git metadata remaining in J worktree?: <NO/YES>
smoke check: <PASS/FAIL + concise evidence>
future Viewer preferred workspace: <J path / NOT SWITCHED>
C original retained?: YES
AB/compute active state touched?: NO
new Viewer implementation started?: NO
Viewer J cutover complete?: <YES/NO>
blocker: <NONE or one line>
```

## Done when

The exact closed Viewer checkpoint has been reconstructed as a clean J-local worktree, lightly smoke-verified, and designated as the preferred future Viewer workspace while C originals remain untouched.

STOP. Do not begin any Viewer implementation.
