# Team AB — Candidate Artifact Retention / Checkpoint v0

Date: 2026-09-07
Owner: Team AB / SKIN SOL -> LUNA
Status: **CLOSED / PASS**

## Purpose

Close the comparison-lane artifact-loss risk without changing Candidate geometry, Sparse Support semantics, Rabbit policy, FKEI, export semantics, or A/G/H/J comparison conditions.

A validated 3MF must be durably written and verified on the filesystem **before** `RELEASE_CANDIDATE`.

This task is workflow reliability only. It does not implement Performance v2 or any new Support architecture.

## Accepted authority

- repo: `satw-jp/katachi`
- canonical workspace: `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`
- branch: `agent/skin-a2-sparse-support-performance-v1`
- implementation commit: `d071a583c19fd811a534db1c8cbd039dbfdd99e3`
- docs/manifest closure commit: `2f0eb180fbe1ed0e9034ea2420628f4421f66d95`
- implementation base: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- canonical user-managed samples: `J:\dev\samples`
- `C:\dev\katachi` / `C:\dev\samples`: non-authoritative for future AB work

Do not modify, rename, reorganize, delete, or commit user-managed samples.

## Accepted implementation

The large-candidate lab now requires an explicitly authorized writable output directory before Candidate processing.

For each Candidate, after normal 3MF validation and before release:

1. write deterministic `ASTRA_<candidate>_candidate-print-lane.3mf`;
2. close the writable handle;
3. reacquire/reopen the persisted file;
4. verify exact byte length;
5. verify exact byte content;
6. verify SHA-256 against the generated archive;
7. write `ASTRA_<candidate>_candidate-print-lane.evidence.json` only after archive verification;
8. reopen/reread the sidecar and require exact content identity;
9. only then send `RELEASE_CANDIDATE`.

Any persistence mismatch fails closed before sidecar/release. The sidecar excludes the binary archive.

A separate serialized Support-state checkpoint is not required for v0 because the exact validated archive itself is the no-recompute recovery path.

## Exact code review

Implementation commit `d071a583...` was reviewed as one commit / seven files from `a3c3dbdb...`.

PASS:
- output-directory hard gate;
- write -> close -> reopen;
- exact bytes / SHA verification;
- sidecar persistence + reread;
- mismatch fail-closed before sidecar / release;
- `RELEASE_CANDIDATE` only after durable verification;
- no Candidate / Support / Rabbit / FKEI / export semantic expansion.

Focused fixture covers:
- durable write / close / reopen;
- exact bytes / SHA;
- evidence sidecar identity;
- corrupt persisted archive fail-closed before sidecar.

Validation reported PASS:
- focused retention test;
- both TypeScript checks;
- production build;
- `git diff --check`.

## Real Windows Chrome canonical A2 gate — PASS

Author-selected output directory:

`J:\My Drive\codex\2026-09-05\files-pasted-by-the-user-katachi\browser-retention-gate-20260907`

`J:\dev\samples` was not used.

Canonical A2 facts:
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Full Support: `4,561 / 4,561`
- accepted BODY / Rabbit collision: `0 / 0`
- 3MF validator: PASS
- Signed Volume: AVAILABLE
- Rabbit repair fingerprint: canonical match
- source / geometry / diagnostics / Support / export fingerprints: exact parity

Persisted artifact:
- filename: `ASTRA_A_candidate-print-lane.3mf`
- byte length: `75,491,874`
- SHA-256: `DE304365A3247487F7EC18DB1536D2234E9980A57576D6ACFFB0AA3C00460874`
- generated/persisted byte length: exact match
- generated/persisted SHA-256: exact match
- durable verification: PASS
- `.evidence.json`: persisted + reread PASS
- sidecar size observed: `7,971` bytes
- `RELEASE_CANDIDATE`: PASS after durable verification

The retained archive byte/SHA differs from an earlier A2 export. This does not fail this task: the contract is exact identity between the current validated generated archive and its persisted copy. Semantic/export identity is protected separately by source/fingerprint/Support evidence.

The Chrome page accumulated one earlier console error from the intentional bounded-fixture A2 SHA mismatch. The canonical A2 run did not add an error; no rerun was required solely to reset that counter.

## Docs/manifest closure — PASS

Commit `2f0eb180...` changed only:
- `src/studies/skin/README.md`
- `src/studies/skin/manifest.json`

It replaced stale UNVERIFIED metadata with the actual Browser A2 PASS evidence and reduced the duplicate Retention revisit to exactly one entry. JSON parse / `git diff --check` PASS.

## Protected architecture — unchanged

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
- Candidate Mesh is not canonical authoring state
- no body-anchored Support implementation
- no Performance v2 / multi-core / CUDA / WebGPU / native work in this task
- no winner selection
- no deploy

## Closure

**PASS / CLOSED.**

This closure removes the artifact-retention blocker that existed before G/H/J, but does **not** itself authorize G/H/J. The author must explicitly resume that comparison lane.

Performance v2 remains a separate future task.