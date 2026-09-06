# Team AB — Candidate Artifact Retention / Checkpoint v0

Date: 2026-09-06
Owner: Team AB / SKIN SOL
Status: QUEUED — required before unattended / sequential G/H/J execution

## Why this exists

A2 proved that the large-candidate pipeline can complete diagnostics, full Sparse Support, support mesh, large 3MF streaming export, validation, placement parity and release. However the generated `ASTRA_A_candidate-print-lane.3mf` is no longer available on disk.

The current browser path proves that download initiation occurred, but it does not prove that Windows persisted the file. After `RELEASE_CANDIDATE`, the in-memory Candidate / Support state is intentionally discarded. `SparseRemovableSupportResult` and `supportFingerprint` are not persisted anywhere.

Therefore a missing downloaded archive currently forces the full A2 Support computation to be repeated. The prior A2 full Sparse Support runtime was about 43m36s.

This is an artifact-retention / workflow reliability issue, not a Candidate geometry or Support correctness failure.

## Shared A/G/H/J risk

A, G, H and J use the same large-candidate execution pattern. Without a retention gate, any Candidate can reach a valid final archive and then lose the only printable artifact after release.

The problem must therefore be treated as a Team AB comparison-lane infrastructure issue, not as an A2-only exception.

## Desired behavior

Before a Candidate is released, the pipeline should have a durable, identifiable checkpoint that allows the final 3MF to be recovered or regenerated without repeating full Sparse Support.

At minimum, one of the following must be durably retained:

1. the exact validated 3MF archive, or
2. enough deterministic Candidate + Support checkpoint state to regenerate the exact archive without rebuilding Support.

The preferred operational gate is to retain both the final archive identity and a lightweight Support checkpoint.

## Minimum artifact-retention gate

For every A/G/H/J Candidate, before `RELEASE_CANDIDATE`:

- the final validated 3MF must be written to an explicit stable local path;
- filesystem existence and exact byte length must be verified, not merely browser-download initiation;
- archive SHA-256 must be recorded;
- Candidate source SHA-256 must be recorded;
- geometry fingerprint must be recorded;
- diagnostics fingerprint must be recorded;
- support fingerprint must be recorded;
- export fingerprint must be recorded;
- package translation / placement parity must be recorded;
- validator PASS must be recorded;
- BODY indexing retention must be recorded;
- Support graph identity / counts must be recorded.

Only after those facts are durable may the in-memory Candidate be released.

## Support checkpoint direction

A future bounded implementation should persist a deterministic Support checkpoint sufficient for exact re-export.

Candidate checkpoint candidates include:

- Candidate source identity and locked placement facts;
- geometry fingerprint;
- diagnostics fingerprint;
- support fingerprint;
- accepted Support graph nodes / edges and route geometry;
- locked Support settings;
- Rabbit source / repair authority fingerprints;
- package/export contract version.

The checkpoint must not make Candidate Mesh a canonical authoring state and must not change FKEI semantics. It is execution / artifact-recovery infrastructure only.

Reloading a checkpoint must fail closed if any protected identity or settings differ.

## Performance consequence

There are two separate performance goals:

### Recovery speed

Checkpoint retention should reduce a lost-archive recovery from the current ~43m36s full Support rerun to only Support-mesh / 3MF export / validation work. Target order of magnitude: seconds to a few minutes rather than tens of minutes.

### Full Support generation speed

Independent future optimization may target the full Sparse Support builder itself. Current runtime should not be interpreted as an architectural requirement.

Planning targets, not promises:

- short term CPU / algorithmic optimization: under ~10–20 min;
- stronger multicore / batched query architecture: several minutes;
- native / CUDA-style batched distance-query research: potentially around 1–3 min, subject to preserving deterministic equal-condition semantics.

Performance work must not weaken collision, Rabbit, placement, or comparison correctness.

## Protected architecture

DO NOT CHANGE as part of artifact retention:

- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only Removable Support
- Rabbit forbidden volume / repair authority
- `contactPolicy = single-body`
- no internal removable-support rescue
- no remesh / decimation
- no hidden candidate-specific tuning
- A/G/H/J equal-condition physical comparison
- FKEI / authoring semantics
- Candidate Mesh must not become canonical authoring state
- winner must not be selected before physical comparison
- Astra production implementation must not be introduced

## Sequencing

Current priority remains:

1. regenerate and physically print A2;
2. preserve the regenerated A2 archive with SHA-256;
3. close A2 validator / artifact review;
4. before G/H/J sequential execution, implement or explicitly satisfy this artifact-retention gate;
5. only then run G → H → J under equal conditions.

G/H/J should not be run unattended under the current release-after-browser-download behavior.

## Done when for a future implementation

- validated archive is durably persisted before Candidate release;
- file existence / bytes / SHA-256 are explicitly verified;
- Candidate / geometry / diagnostics / support / export fingerprints are recorded;
- Support checkpoint or equivalent recovery path can regenerate the final archive without full Support recomputation;
- mismatch is fail-closed;
- A/G/H/J comparison semantics unchanged;
- no production / FKEI / geometry scope expansion.
