# DEV Storage Migration — Compute Helper Controlled C:→J: Cutover v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY — CONTROLLED CUTOVER ONLY

## Purpose

Move the currently running but reportedly idle Katachi compute/helper runtime from the C: development area to `J:\dev` without disturbing active project work.

This task is specifically for the compute/helper runtime. It does not authorize moving the primary `C:\dev\katachi` repo or linked worktrees.

The previously discovered likely workspace is:

`C:\dev\katachi-compute-helper-tray`

However, the exact historical `katachi-compute` identity was not found during prior discovery. Therefore the first gate is to prove what process/workspace is actually running before any stop/start or path change.

## Read first

- `docs/tasks/DEV_STORAGE_MIGRATION_PARTIAL_SAFE_STAGE_C_TO_J_V0.md`
- `docs/tasks/DEV_STORAGE_MIGRATION_PRESERVATION_LEDGER_V0.md`
- latest `docs/status/AB_CURRENT.md`
- latest `docs/status/C_CURRENT.md`
- this task

## Hard boundaries

Do not touch:

- `C:\dev\katachi` primary working tree or its `.git` topology;
- any linked worktree owned by the primary Katachi `.git`;
- active AB/C/HANA implementation worktrees;
- A2 physical-print artifact or printer workflow;
- project source semantics, CUDA algorithms, Support algorithms, FKEI, HANA, ART, or Viewer.

Do not delete the C-side compute/helper source during this task.

No force-push, reset, rebase, stash, merge, worktree repair/prune, or cache cleanup.

## Gate 0 — identify the running compute runtime

Before stopping anything, record:

- process name / PID / command line / executable or script path;
- working directory if discoverable;
- listening localhost port(s) / endpoint(s);
- parent/child process relationship if relevant;
- launcher / tray / startup entry used to start it;
- whether the running process maps to `C:\dev\katachi-compute-helper-tray` or another workspace;
- whether any separate `katachi-compute` runtime exists.

If the running runtime cannot be confidently mapped to a known workspace, STOP before migration and report `IDENTITY UNKNOWN`.

Do not expose secret values from environment/config files.

## Gate 1 — prove the runtime is idle enough to restart

The author reports that the helper is running but no project workload is currently active.

Before stopping it, verify as far as the runtime supports:

- no active compute job / queue / task is running;
- no active project session depends on the helper for an in-progress operation;
- AB is at physical-print/manual gate and not using compute;
- C display task has not yet started or is not using this helper;
- no active client request is currently being processed.

Use the helper's own status/health/job information where available. If there is no reliable way to prove idle state and an active job cannot be excluded, STOP and report `IDLE STATE UNVERIFIED`.

Normal tray/background existence by itself is not a blocker once no workload is active.

## Gate 2 — classify source workspace

Inspect `C:\dev\katachi-compute-helper-tray` and any runtime workspace discovered in Gate 0:

- normal directory / independent Git repo / linked worktree;
- remote URL if Git;
- branch / HEAD;
- clean/dirty status;
- upstream / remote reachability;
- local-only config/runtime files needed to reproduce behavior;
- rebuildable files such as `node_modules`, build outputs, caches.

If it is a linked worktree sharing `C:\dev\katachi\.git`, STOP this cutover and return it to final primary migration planning.

If dirty source or unknown-authority local-only code exists, do not silently migrate it as canonical. Preserve/report it and STOP before cutover unless the exact state can be safely staged as an artifact under the existing preservation rules.

## Gate 3 — prepare J-side runtime before stopping C

Target:

`J:\dev\katachi-compute-helper-tray`

Use the exact discovered runtime name if different, but do not invent a new architecture.

Preferred method:

- clean origin-backed independent Git repo -> fresh clone / exact branch checkout on J;
- independent local-only workspace -> verified file staging according to preservation rules;
- do not copy `node_modules`, dist/build outputs or caches unless the runtime has no reproducible install path and SOL review explicitly allows it.

Preserve required non-secret local configuration. Do not print secret values in the report.

Before stopping C, verify the J-side source/state is complete enough to start.

## Gate 4 — controlled stop / start

Only after Gates 0–3 PASS:

1. stop **only** the identified compute/helper runtime and its direct helper children as required;
2. do not stop unrelated Node/Python/browser/CUDA processes;
3. start the runtime from the J-side workspace using the existing documented/project launcher method;
4. preserve the same intended localhost endpoint/port behavior unless the runtime itself requires a different generated path;
5. verify tray/launcher state if applicable.

If J-side startup fails:

- do not debug by changing project architecture;
- restart the original C-side runtime if safe;
- report rollback;
- leave both source copies intact.

## Gate 5 — smoke verification

Verify only the existing compute/helper contract, for example where supported:

- process stays running;
- expected localhost endpoint responds;
- health/status reports ready;
- CUDA/shadow adapter can initialize if that is part of the helper's normal lightweight self-check;
- no unexpected console/runtime error;
- no path lookup still requires `C:\dev\katachi-compute-helper-tray` except intentionally retained fallback/history.

Do not run a large A2/Production workload merely to test migration.

If there is a very small existing deterministic smoke request, it may be used only if it does not contend with the A2 physical print or active development work.

## Gate 6 — launcher / autostart switch

If a tray shortcut, startup entry, scheduled launcher, desktop shortcut, or script hard-codes the C path:

- update only that compute/helper launcher to the verified J path;
- record the changed launcher location;
- do not modify unrelated project launchers.

If autostart ownership is ambiguous, leave it unchanged and report the exact remaining manual step instead of guessing.

## C-side retention

Keep the C-side compute/helper directory unchanged after successful J startup.

This task does not delete or reclaim the C copy. Final deletion/cleanup belongs to the later full migration gate after sustained J-side verification.

## Relationship to today's work

Prefer to execute this cutover before starting new AB performance or C display implementation work, because the runtime is currently reported idle and A2 is at the physical-print gate.

If AB/C begin using the helper before this task reaches Gate 4, STOP at staging and defer the actual process switch until the next idle window.

## Output

Return only:

```text
Overall SOL review用:

running compute identity: <process/workspace>
source workspace type: <independent repo / directory / linked worktree / unknown>
source state: <branch/HEAD/clean-dirty/reconstructability>
idle gate: <PASS / UNVERIFIED / ACTIVE>
J-side prepared: <path + verification>
C runtime stopped?: <YES/NO>
J runtime started?: <YES/NO>
endpoint/health parity: <PASS/FAIL/NOT AVAILABLE>
launcher/autostart switched: <YES/NO/NOT NEEDED/DEFER>
rollback needed?: <NO/YES + result>
C original retained?: YES
compute helper cutover complete?: <YES/NO>
remaining compute migration risk: <summary>
```

## Done when

The exact running compute/helper identity is proven, the runtime is confirmed idle, a verified J-side copy is prepared, only that runtime is restarted from J, its existing contract is smoke-verified, and the C original remains available for rollback.

STOP. Do not proceed into primary Katachi repo/worktree migration from this task.
