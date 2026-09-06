# Team AB Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- validator branch: `agent/skin-astra-large-3mf-validator-v0`
- remote validator HEAD: `1cf17eb7021a049269da76dc12f83524a52d2cf3`
- validator parent: `948c676fa966c9881d13971b4761636c5fe77d83`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`

## Current phase
The author has paused G/H/J until after an overnight break and wants to physically print A2 first. The previously generated `ASTRA_A_candidate-print-lane.3mf` cannot be found in local search and is not retained in ChatGPT files or GitHub. The previous run's measured A2 evidence remains valid, but the exact archive bytes are unavailable for printing or fix-commit revalidation.

The validator parity fix is pushed at `1cf17eb7021a049269da76dc12f83524a52d2cf3`. Implementation handoff reports comment / CDATA boundary safety, wrong-root report parity, 1-64-byte differential parity corpus, representative malformed parity, 538,792,408-byte synthetic validation, 24 related regressions and build PASS. Actual A2 archive revalidation on the fix commit is still pending only because the prior archive bytes are unavailable.

The Astra large-candidate worker does not persist Candidate / Support state. `SparseRemovableSupportResult` and `supportFingerprint` live only under the in-memory `activeCandidate`; `RELEASE_CANDIDATE` releases the Candidate query and sets `activeCandidate = null`. Therefore the lost 3MF cannot be regenerated from a persisted Support graph. A new exact-condition A2 execution through full Sparse Support is required to regenerate a printable archive.

The same artifact-retention risk applies to G/H/J because they use the same Candidate → Support → export → browser-download → release pattern. A dedicated queued checkpoint specification now exists at `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md` and must be satisfied before unattended / sequential G/H/J execution.

## Active implementation / execution instruction
- owner: Team AB / SKIN SOL -> Temporary AB Implementation SOL / LUNA
- task: `A2 archive regeneration + fix-commit validation + physical print package`
- purpose: regenerate the lost A2 3MF under the already-locked A2 conditions, validate it with validator fix HEAD `1cf17eb...`, preserve it as an identifiable physical artifact, then hand it to the author for the first print.
- allowed scope: A2 only; reload the exact A2 source and Rabbit; run the existing unchanged diagnostics / full Sparse Support / support mesh / 3MF export / validator path; save the resulting archive to a stable local path; compute and record archive SHA-256; no new geometry/support implementation.
- protected scope: Candidate geometry, source-space execution, exact-zero canonicalization, deferred placement, Outside-only Support, Rabbit policy, Support settings, exporter semantics, FKEI, production SKIN, A/G/H/J equal-condition contract.
- exact physical settings: overhang `45 deg`; shaft `1.6 mm`; neck `0.6 mm`; removal gap `0.35 mm`; Rabbit clearance `0 mm`.
- do not run G/H/J, merge, deploy, remesh, decimate, tune per-candidate, or add slicer-generated replacement support.
- instruction source: this `AB_CURRENT.md` plus `docs/tasks/AB_A2_LARGE_3MF_VALIDATOR_PARITY_CLOSURE_V0.md` for validator closure semantics.

## Queued before G/H/J
- task: `Team AB — Candidate Artifact Retention / Checkpoint v0`
- path: `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
- purpose: prevent a completed A/G/H/J Candidate from becoming unrecoverable after release merely because the browser download did not produce a durable local artifact.
- minimum gate: durable archive path, filesystem existence / byte verification, archive SHA-256, Candidate / geometry / diagnostics / support / export fingerprints, placement / validator / BODY indexing evidence before release.
- preferred recovery: persist a deterministic Support checkpoint sufficient for exact re-export without rebuilding full Sparse Support.
- this is infrastructure / artifact recovery only; it must not change Candidate geometry, Support semantics, Rabbit, FKEI or equal-condition comparison semantics.
- G/H/J should not be run unattended under the current release-after-browser-download behavior.

## Regeneration gate
The regenerated A2 run must preserve the known locked facts or stop for SOL review:
- source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- source triangles: `5,934,046`
- execution triangles: `5,934,044`
- exact-zero removed source faces: `750206`, `750207`
- Full Sparse Support targets: `4,561 / 4,561`
- supported / unsupported: `654 / 3,907`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY collision: `0`
- accepted Rabbit collision: `0`
- BODY faces in export: `5,934,044`
- support faces: `71,808`
- package translation Z: `48.029293060302734`
- BODY removed during indexing: `0`
- validator: PASS on `1cf17eb...`
- placement parity: PASS
- source / geometry / diagnostics / support currentness chain: PASS
- generated archive must be saved before release and its SHA-256 recorded.

The previous archive measured `75,491,879` bytes with `575,613,609` model XML bytes and `75,489,493` compressed model bytes. A deterministic rerun is expected to reproduce these export facts; any mismatch must be reported before physical-print evidence is claimed.

## PASS / CLOSED
- Candidate geometry / source-space execution
- exact-zero canonicalization
- A2 diagnostics / reachability
- Candidate packed BVH performance
- Rabbit signed-volume performance work
- prior A2 full Sparse Support: COMPLETE
- prior A2 Support mesh: PASS
- Large 3MF streaming serialization: PASS
- ZIP assembly: PASS
- prior actual A2 large streaming validation: PASS
- prior actual A2 package placement parity: PASS
- prior actual A2 BODY indexing retention: PASS (`0` removed)
- prior browser download initiation path: PASS; filesystem persistence: NOT PROVEN
- prior actual A2 candidate release: PASS
- validator parity fix small / synthetic regression evidence at `1cf17eb...`: SUPPORTED by implementation handoff; pending SOL exact-commit review with regenerated A2 artifact

## Current blocker
The exact previously generated A2 3MF archive is unavailable. The browser-side code proves that the download action was initiated, but not that Windows successfully persisted the file. Because Support state was intentionally released and not persisted, the archive cannot be reconstructed without rerunning A2 full Sparse Support under the locked settings.

This is an artifact-retention / regeneration cost, not a newly discovered geometry or Support correctness failure.

## Next gate
1. Regenerate A2 only under the locked equal-condition settings.
2. Save the resulting `ASTRA_A_candidate-print-lane.3mf` to a stable local path **before** release / cleanup.
3. Record archive SHA-256 and the known A2 comparison facts above.
4. Validate on `1cf17eb...`; placement and fingerprint/currentness continuity PASS.
5. Team AB / SKIN SOL reviews the compact handoff.
6. The author opens that exact saved archive in Bambu Studio and proceeds to the physical A2 print gate.
7. Before G/H/J sequential execution, satisfy `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`.

G/H/J remain HOLD until the author explicitly resumes them.

## Physical A2 print gate
For the first print:
- do not rescale or reposition the model
- do not regenerate or replace the authored printable-support geometry
- do not add candidate-specific hidden tuning
- do not alter Candidate geometry, Rabbit policy or Support geometry
- slicer preview / printer-material parameters may be inspected; any change that alters comparison geometry/support conditions must be reported before treating the print as comparison evidence

Record:
- slicer import / preview success or exact failure
- BODY and separate Support appearance
- first-layer / adhesion behavior
- print start / completion or exact failure point
- support/body collision or detachment
- support removal behavior and BODY damage
- obvious physical defects relevant to later A/G/H/J comparison

## HOLD / DO NOT CHANGE
- G/H/J execution until author explicitly resumes after overnight consideration
- Candidate geometry
- Support semantics / physical parameters
- Rabbit forbidden-volume policy
- A/G/H/J equal-condition comparison contract
- FKEI / authoring semantics
- no per-candidate hidden tuning
- no remesh / decimation
- no internal removable-support rescue
- no winner selection before physical comparison
- no Astra production implementation
- no deploy from this gate

## Relevant prior measured A2 evidence
- A2 execution triangles: 5,934,044 after exact-zero removal
- Full A2 Support: 4,561 / 4,561 targets
- Supported / unsupported: 654 / 3,907
- Full A2 Support graph: 2,150 nodes / 1,496 edges
- Accepted BODY collision: 0
- Accepted Rabbit collision: 0
- BODY vertices: 2,964,210
- BODY faces: 5,934,044
- Support faces: 71,808
- Validator total vertices: 3,001,180
- Validator total triangles: 6,005,852
- model XML: 575,613,609 bytes
- compressed model: 75,489,493 bytes
- archive: 75,491,879 bytes
- package translation Z: `48.029293060302734`
- prior actual A2 validator / placement / release: PASS
- browser download initiation: PASS; local file persistence: NOT PROVEN
- browser console errors / warnings: 0 / 0 at prior actual gate
- Full Sparse Support runtime was about 43m36s; regeneration therefore has a substantial but known execution cost.

## Evidence boundary
### Proven / supported
- Prior A2 geometry, diagnostics, full Sparse Support, export, validation, placement, browser download initiation and release reached the measured facts above.
- Validator parity fix exists remotely at `1cf17eb7021a049269da76dc12f83524a52d2cf3` and changes validator/parity-test behavior only according to the implementation handoff.
- The previous A2 archive bytes are unavailable; no claim is made that the exact prior file can still be printed.
- G/H/J were not run and no winner was selected.

### HOLD / not yet proven
- regenerated A2 archive identity / SHA-256
- actual A2 validation on validator fix `1cf17eb...`
- first A2 physical print
- canonical A2 software closure after regenerated-artifact review
- artifact-retention checkpoint implementation before G/H/J
- G/H/J execution
- physical comparison across A/G/H/J
- winner
