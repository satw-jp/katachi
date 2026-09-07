# DEV Storage Migration — C J Runtime Bootstrap v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — RUNTIME BOOTSTRAP ONLY

## Purpose

Complete the practical C-side J: migration by proving that the accepted C worktree can be launched and used from the new J-local workspace, not merely reconstructed as a clean Git worktree.

This is an infrastructure/runtime bootstrap task. It does not authorize new C feature work.

## Authority

Read latest `main:docs/status/C_CURRENT.md` first.

Expected preferred workspace:

`J:\dev\worktrees\skin-field-vnext-interaction-v0`

Expected accepted C authority:

- branch: `agent/skin-field-vnext-interaction-v0`
- HEAD: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`

If latest main has advanced, preserve the newer authority instead.

## Hard boundaries

Do not:

- use the retained C-side worktree for new execution;
- modify Production BODY / Graph / Support / Export semantics;
- start durability audit;
- start Outside→Outside Support work;
- start any new C implementation task;
- touch AB active worktrees or A2 workflow;
- switch the compute-helper runtime while AB is active;
- copy old C-side `node_modules`, build output, browser cache, or `.git` metadata;
- reset/rebase/stash/merge/clean for convenience.

## Gate 0 — verify J authority

Confirm:

- workspace path exists;
- expected branch / accepted HEAD;
- worktree clean;
- Git metadata is J-local and not linked back to `C:\dev\katachi\.git`;
- latest `main` reporting/task docs are readable without altering C source state.

If authority differs or local-only work exists, STOP.

## Gate 1 — dependency bootstrap

The repo uses npm/Vite and contains `package-lock.json`.

From the J-side C worktree:

1. verify Node/npm are available;
2. install dependencies from the existing lockfile using the normal reproducible npm path (`npm ci` preferred when appropriate);
3. do not copy `node_modules` from C;
4. do not modify package manifests merely to make migration work;
5. record any native/path-specific install failure exactly.

If an existing J-side dependency install is already present and valid, verify rather than reinstall unnecessarily.

## Gate 2 — standard build/test smoke

Run only bounded established checks needed to prove the J workspace is usable:

- accepted FIELD focused tests;
- TypeScript/build only if reasonably quick and already standard;
- do not run expensive A2/support-generation workloads.

A migration bootstrap does not need to prove unrelated historical suites.

## Gate 3 — launch from J

Start the application from the J-side C worktree using the repository's normal dev command:

`npm run dev`

Record:

- exact J working directory used to launch;
- localhost URL / port selected by Vite;
- whether the process remains running;
- whether launch output contains a path dependency on the old C-side worktree.

Do not rewrite architecture to preserve an old port. If the preferred port is occupied, use the normal safe Vite fallback behavior or an explicitly supplied free port and report it.

## Gate 4 — browser runtime verification

Using the launched J-side app, verify enough of the accepted C checkpoint to show practical usability:

- app loads successfully;
- current SKIN/C route opens;
- FIELD vNext can be shown;
- switching FIELD -> BEADS/other relevant view does not leave stale FIELD fullscreen visibility;
- camera interaction proxy behavior works and exact FIELD view returns afterward;
- no new fatal console/runtime error attributable to J migration;
- current accepted Production state can be reached without modifying semantics.

Do not use this gate to fix unrelated pre-existing issues. The previously known Workflow Guide-derived `NotFoundError` remains outside scope unless it newly blocks basic launch from J.

## Gate 5 — local path dependency audit

Check only launch/runtime-critical local path assumptions.

Require that ordinary C execution no longer needs:

`C:\dev\worktrees\skin-field-vnext-interaction-v0`

or C-side Git metadata.

If a launcher/shortcut/script still points to C but ownership is clear and the change is infrastructure-only, update it to the J path and report the exact change. If ownership is ambiguous, leave it unchanged and report the manual step.

Do not change unrelated launchers.

## C-side retention

Keep the C-side original unchanged for rollback/evidence.

This task does not authorize cleanup or deletion.

## Output

Return only:

```text
Overall SOL review用:

C authority: <branch / HEAD>
J C workspace: <path>
J worktree clean before bootstrap?: <YES/NO>
Node/npm available?: <YES/NO + versions if cheap>
dependency bootstrap: <PASS/FAIL/ALREADY VALID>
focused tests/build: <PASS/FAIL + concise evidence>
J dev launch: <PASS/FAIL + URL/port>
browser C runtime: <PASS/FAIL + concise evidence>
old C path required for normal runtime?: <NO/YES + summary>
launcher/path updates made?: <NO/YES + summary>
C source semantics changed?: NO
AB active state touched?: NO
C original retained?: YES
C J runtime bootstrap complete?: <YES/NO>
blocker: <NONE or one line>
```

## Done when

The accepted C checkpoint is not only present as a clean J-local worktree, but dependencies are usable, the normal Vite app launches from J, the accepted FIELD interaction behavior is smoke-verified in the browser, and ordinary C execution no longer depends on the old C-side worktree.

STOP. Do not start new C implementation work.
