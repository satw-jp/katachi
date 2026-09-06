# HANA — Migration Preservation Checkpoint v0

Date: 2026-09-06
Owner: Overall SOL / HANA SOL boundary
Implementation owner: Organization / maintenance LUNA or HANA LUNA
Status: ACTIVE FOR PRESERVATION ONLY

## Purpose

Preserve local-only HANA committed refs before the future C:→J: dev migration, without advancing HANA implementation or closing the pending iPad / EasyCanvas Hardware Gate.

This is not a feature task and not a migration task. It exists only to make the current committed HANA state reconstructable from GitHub before storage topology changes later.

## Current authoritative HANA state

Read:

- `docs/TEAM_REPORTING_RULES.md`
- `docs/status/HANA_CURRENT.md`
- this task

Current HANA CURRENT records:

- branch: `agent/hana-viewport-context-topbar-v0`
- HEAD: `e2456befce1467c9892f0fc772096368dedce151`
- working tree: clean at reported checkpoint
- remote branch: not yet pushed at reported checkpoint
- current gate: iPad / EasyCanvas Hardware Gate remains OPEN / pending

Migration preservation preflight also identified a second HANA local/no-upstream ref:

- `agent/hana-projection-redraw-v0`

Its exact local SHA and cleanliness must be inspected before any preservation action.

## Allowed actions

### A. Current viewport branch

1. Locate the existing local HANA worktree/ref without changing branch or files.
2. Verify exact branch and HEAD.
3. Verify `git status --short --branch` is clean.
4. Verify the intended remote is `satw-jp/katachi`.
5. Check whether remote branch `agent/hana-viewport-context-topbar-v0` exists.
6. Preserve the exact local committed ref remotely only when safe:
   - if remote ref is absent: push exact branch/ref;
   - if remote ref already equals `e2456bef...`: record already preserved;
   - if remote ref exists at a different SHA: STOP and report; do not force-push.
7. After push, verify remote SHA exactly equals local `e2456bef...`.

No new implementation commit is required merely for preservation.

### B. Projection Redraw local ref

Inspect `agent/hana-projection-redraw-v0` read-only:

- exact SHA
- whether its commit exists remotely under any ref
- whether its associated worktree, if any, is clean
- whether it contains unique commits not reachable from any confirmed remote ref

If it is a clean committed unique HANA ref and the corresponding remote branch is absent, preserve the exact existing ref by pushing that branch name.

If dirty state, ambiguous lineage, remote conflict, or an unsafe condition is found: do not alter it; report `HOLD` for HANA SOL review.

## Hard prohibitions

Do not:

- run the iPad / EasyCanvas Hardware Gate
- declare HANA phase PASS/CLOSED
- implement Projection Redraw or Section Redraw
- edit HANA source/tests/docs merely for this preservation
- commit dirty changes
- stash/reset/rebase/merge/cherry-pick
- force-push
- rename branches
- prune worktrees
- move/copy the HANA worktree as part of C:→J: migration
- change compute architecture or performance behavior
- touch AB active paths

## CURRENT semantics

Do not rewrite HANA CURRENT to claim Hardware Gate completion.

If exact preservation succeeds, it is acceptable to update only the factual remote-preservation field in `docs/status/HANA_CURRENT.md` if and only if this can be done without disturbing active branch lineage; otherwise simply report the remote SHA to Overall SOL / HANA SOL and let canonical CURRENT be corrected later.

Preservation != implementation acceptance != Hardware Gate closure.

## Output

Return only:

```text
Overall/HANA SOL review用:

viewport branch:
local HEAD:
local status:
remote preservation: <PUSHED / ALREADY PRESENT / HOLD>
remote SHA:
projection-redraw branch:
projection-redraw SHA:
projection-redraw preservation: <PUSHED / ALREADY REACHABLE / HOLD / NOT FOUND>
remaining HANA migration risk:
source/code changes: NONE
hardware gate status: STILL PENDING
```

## Done when

The current clean HANA committed state can be reconstructed from confirmed remote refs, or every remaining local-only HANA risk has been explicitly identified for HANA SOL review.

STOP after preservation. Do not begin any HANA implementation or actual C:→J: migration.
