# Team AB — Candidate Artifact Retention / Checkpoint v0

Date: 2026-09-07
Owner: Team AB / SKIN SOL -> LUNA
Status: ACTIVE — required before G/H/J execution

## Purpose

Close the comparison-lane artifact-loss risk without changing Candidate geometry, Sparse Support semantics, Rabbit policy, FKEI, export semantics, or A/G/H/J comparison conditions.

A valid 3MF must be durably written and verified on the filesystem **before** `RELEASE_CANDIDATE`.

This task is workflow reliability only. It does not implement Performance v2 or any new Support architecture.

## Authorized authority / workspace

- repo: `satw-jp/katachi`
- branch / base: `agent/skin-a2-sparse-support-performance-v1` / `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- canonical workspace: `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`
- canonical user-managed samples: `J:\dev\samples`
- `C:\dev\katachi` and `C:\dev\samples` are not current AB work/input authority

Do not modify, rename, reorganize, delete, or commit user-managed samples.

## Why this gate exists

The old browser path used download initiation (`link.click()`) and then released Candidate / Support state. Browser download initiation does not prove filesystem persistence. If the archive is missing after release, the pipeline has to regenerate Support.

Performance v1 reduced A2 Full Sparse Support to `528,025.4 ms` (~8m48s), but this does not remove the artifact-retention requirement. G/H/J must not run unattended under a download-initiation-only contract.

## v0 bounded design

### 1. Explicit output-directory authority

The large-candidate lab must require an explicit user-selected output directory before unattended/sequential archive execution.

Preferred Windows/Chrome implementation: File System Access API directory handle (`showDirectoryPicker`) or an equivalent browser-native writable filesystem handle.

- one user gesture may select/authorize the directory before a sequential run;
- A/G/H/J may then write deterministic filenames into that same authorized directory;
- do not hard-code a new user filesystem location in code;
- do not use `J:\dev\samples` as an output directory;
- if durable direct-file writing is unavailable, unattended G/H/J must fail closed rather than silently falling back to browser-download initiation.

Browser `link.click()` may remain only as an explicitly secondary/manual fallback if useful, but it cannot satisfy this gate.

### 2. Durable validated archive write

For each Candidate, after 3MF validation and before release:

1. obtain the final validated archive bytes;
2. write deterministic filename `ASTRA_<candidate>_candidate-print-lane.3mf` to the authorized output directory;
3. close/flush the writable handle;
4. reopen/reacquire the written file via the filesystem handle;
5. verify exact byte length;
6. compute SHA-256 from the persisted file bytes;
7. compare persisted SHA/bytes to the generated archive identity;
8. only then allow `RELEASE_CANDIDATE`.

Any write / reopen / bytes / SHA mismatch must fail closed and retain the Candidate in memory when practical for retry/recovery.

### 3. Durable evidence sidecar

Write a deterministic sidecar such as:

`ASTRA_<candidate>_candidate-print-lane.evidence.json`

The sidecar must record at least:

- schema/version
- Candidate id / source filename
- source SHA-256
- geometry fingerprint
- diagnostics fingerprint
- Support fingerprint / available deterministic semantic digest
- export fingerprint
- canonical Support counts
- BODY / Rabbit accepted collision counts
- Rabbit source SHA / repair fingerprint / transform authority
- locked Support settings
- package translation / placement parity
- BODY indexing retention facts
- validator PASS
- archive filename
- persisted archive exact byte length
- persisted archive SHA-256
- runtime/browser context already available from v1 evidence retention

The sidecar must exclude the binary 3MF archive itself.

### 4. Recovery requirement for v0

A separate serialized Support-state format is **not required** for this v0 if the exact validated archive is durably persisted and re-read/verified before release.

The verified final archive itself is the equivalent recovery path: a lost browser download no longer requires rebuilding Support because the canonical validated 3MF already exists on disk with exact identity evidence.

Do not invent a new checkpoint/container format unless durable archive retention proves insufficient.

## A2 verification gate

Before G/H/J can be resumed, test the new retention path on A2 using the canonical content identity:

- A2 SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`

Do not rerun Full Sparse Support merely to test UI plumbing if a bounded synthetic/archive fixture can prove write/reopen/SHA behavior first.

Final A2 gate may use an actual A2 run only when needed to prove end-to-end pre-release behavior. Preserve Performance v1 semantics and complete fingerprint parity.

## Protected architecture — DO NOT CHANGE

- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only Removable Support
- Support target / route / order / tie-breaking / spacing / coverage semantics
- Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume policy / signed-volume authority
- `contactPolicy = single-body`
- no internal removable-support rescue
- no remesh / decimation
- no hidden candidate-specific tuning
- A/G/H/J equal-condition physical comparison
- FKEI / authoring semantics
- Candidate Mesh must not become canonical authoring state
- no body-anchored Support implementation
- no Performance v2 / multi-core / CUDA / WebGPU / native work
- no winner selection
- no deploy

## G/H/J HOLD

G/H/J remain HOLD throughout this task.

Closing this retention gate does not itself authorize G/H/J; the author must explicitly resume the equal-condition comparison lane afterward.

## Validation

At minimum:

- focused filesystem persistence fixture: write -> close -> reopen -> bytes -> SHA exact
- mismatch/failure cases fail closed
- evidence sidecar schema/identity regression
- existing relevant large-candidate / 3MF tests
- TypeScript checks
- build
- `git diff --check`
- browser gate on Chrome/Windows for directory selection + durable write/verify
- no `RELEASE_CANDIDATE` before durable archive verification

## Done when

Return to Team AB / SKIN SOL only when:

- implementation starts from exact J authority `a3c3dbdb...`
- output directory must be explicitly authorized
- validated 3MF is directly persisted before release
- persisted file is reopened and exact bytes/SHA verified
- evidence JSON is durably persisted alongside it
- release is hard-gated on durable verification
- failure/mismatch is fail closed
- existing A2 geometry / Support / Rabbit / export semantics remain exact
- tests/build PASS
- G/H/J not run
- Performance v2 not started
- new Support architecture not implemented
- no merge/deploy

Return the standard compact SOL-review handoff with branch, commit, tests, browser persistence evidence, and exact changed files.