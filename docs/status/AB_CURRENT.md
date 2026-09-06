# Team AB Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- reviewed implementation branch: `agent/skin-astra-large-3mf-validator-v0`
- reviewed implementation HEAD: `948c676fa966c9881d13971b4761636c5fe77d83`
- parent/base: `4599d6a4ac7351633d7860d6e9f594803107e10f`
- remote branch SHA confirmed equal to reviewed HEAD
- working tree: reported clean at implementation handoff
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`

## Current phase
Author has chosen to pause G/H/J until after an overnight break and prioritize the first physical A2 print. The reviewed A2 archive has already passed actual-scale streaming validation, placement parity, BODY indexing retention, download and candidate release. The remaining validator parity closure is a software-semantic cleanup and is not considered a blocker to physically printing this exact reviewed A2 archive.

## Active implementation instruction
- no implementation task is active while waiting on the author/manual A2 physical-print gate.
- queued software closure after the physical gate / author decision: `docs/tasks/AB_A2_LARGE_3MF_VALIDATOR_PARITY_CLOSURE_V0.md`.
- G/H/J execution remains HOLD until the author resumes the equal-condition comparison lane.

## Operating routing
- Team AB / SKIN SOL owns architecture, scope, next gate and acceptance.
- Implementation workers execute only an explicitly active bounded GitHub instruction and return evidence for SOL review; they do not self-approve global closure.
- Shared routing/reporting authority: `docs/TEAM_REPORTING_RULES.md` on `main`.

## PASS / CLOSED
- Candidate geometry / source-space execution
- exact-zero canonicalization
- A2 diagnostics / reachability
- Candidate packed BVH performance
- Rabbit signed-volume performance work
- A2 full Sparse Support: COMPLETE
- Support mesh: PASS
- Large 3MF streaming serialization: PASS
- ZIP assembly: PASS
- Actual A2 large streaming validation on reviewed commit: PASS
- Actual A2 package placement parity: PASS
- Actual A2 BODY indexing retention: PASS (`0` removed)
- Actual A2 download: PASS
- Actual A2 candidate release: PASS

## Queued software review finding
Reviewed commit `948c676fa966c9881d13971b4761636c5fe77d83` is one fast-forward commit from the authorized base and stays within validator/test/progress/evidence scope.

Two validator-parity issues remain queued for later closure:

1. Incremental XML handling can reject a valid legacy-supported comment / CDATA opener when `<!...` is split before the complete opener is available. Streaming behavior must be independent of chunk boundaries.
2. A non-`model` submodel root can produce a different full error report between legacy and streaming because the streaming path wraps the model-root condition as malformed XML.

These do not invalidate the measured A2 archive PASS and do not block printing the exact reviewed A2 archive. They do prevent claiming complete legacy-semantic parity and canonical software end-to-end closure until fixed.

## Next gate — author/manual physical A2 print
Print the exact downloaded reviewed artifact:
- `ASTRA_A_candidate-print-lane.3mf`
- measured archive size: `75,491,879` bytes
- package translation Z: `48.029293060302734`

For this first physical gate, preserve the candidate comparison state:
- do not rescale or reposition the model
- do not regenerate or replace the authored printable-support geometry
- do not add candidate-specific hidden tuning
- do not alter Candidate geometry, Rabbit policy or Support geometry as part of this gate

Before starting the print, the author may inspect slicer preview and printer/material settings. Any slicer-required change that would alter geometry/support/comparison conditions should be reported before treating the result as comparison evidence.

Record physical observations, especially:
- slicer import / preview succeeds or fails
- BODY and separate support appear as expected
- print starts successfully or exact failure point
- visible support/body collision or detachment
- first-layer / adhesion behavior
- completion or failure
- support removal behavior and resulting BODY damage
- any obvious physical defect relevant to the next A/G/H/J comparison decision

## HOLD / DO NOT CHANGE
- G/H/J execution until author resumes after overnight consideration
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

## Relevant artifacts / measured A2 evidence
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
- actual A2 validator / placement / download / release: PASS
- browser console errors / warnings: 0 / 0 at reported actual gate
- Full Sparse Support runtime remains about 43m36s; currently a performance cost, not a correctness blocker.

## Evidence boundary
### Proven / supported
- Remote implementation checkpoint exists at exact SHA `948c676fa966c9881d13971b4761636c5fe77d83` with authorized parent `4599d6a4ac7351633d7860d6e9f594803107e10f`.
- Change scope is limited to validator/tests/progress/evidence files.
- The actual A2 archive reached and passed streaming validation at the measured scale.
- Actual A2 placement parity, BODY indexing retention, download and release passed.
- Candidate geometry, Support settings/semantics, Rabbit, FKEI and production SKIN were not changed by the reviewed validator commit.
- G/H/J were not run and no winner was selected.

### HOLD / not yet proven
- A2 physical print
- complete legacy/streaming report parity for all legacy-supported bounded XML cases
- canonical software end-to-end closure after the queued parity fix
- G/H/J execution
- physical comparison across A/G/H/J
- winner
