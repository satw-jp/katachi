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
A2 has produced a real large 3MF that passes the new streaming validator, placement, download and release path. SOL review accepts that actual-scale execution evidence, but does **not** yet close the validator task or canonical A2 end-to-end gate because legacy/streaming XML-semantic parity has two bounded review findings that must be fixed before G/H/J execution.

## Active implementation instruction
- owner: Team AB / SKIN SOL -> Temporary AB Implementation SOL / LUNA
- task: `A2 Large 3MF Validator Parity Closure v0`
- purpose: close the remaining validator-semantic parity gap without rerunning or changing Candidate geometry / Support.
- allowed scope: validator and validator-parity tests; minimum read-only gate/assertion changes needed to expose fingerprint continuity.
- protected scope: Candidate Geometry, Support semantics/parameters, Rabbit, exporter semantics/schema/order, FKEI/authoring, production SKIN, A/G/H/J comparison contract.
- done when: legacy/streaming full-report parity is boundary-safe for the reviewed XML cases, bounded telemetry remains PASS, and the fix commit validates the existing actual A2 archive with placement and fingerprint continuity PASS.
- instruction source: `docs/tasks/AB_A2_LARGE_3MF_VALIDATOR_PARITY_CLOSURE_V0.md`

## Operating routing
- Team AB / SKIN SOL owns architecture, scope, next gate and acceptance.
- Implementation workers execute only the current bounded GitHub instruction and return evidence for SOL review; they do not self-approve global closure.
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

## SOL review finding / current blocker
Reviewed commit `948c676fa966c9881d13971b4761636c5fe77d83` is one fast-forward commit from the authorized base and stays within validator/test/progress/evidence scope.

Two validator-parity issues remain:

1. Incremental XML handling can reject a valid legacy-supported comment / CDATA opener when `<!...` is split before the complete opener is available. Streaming behavior must be independent of chunk boundaries.
2. A non-`model` submodel root can produce a different full error report between legacy and streaming because the streaming path wraps the model-root condition as malformed XML.

These do not invalidate the measured A2 archive PASS, because the generated A2 object-model XML passed the actual streaming gate. They do prevent claiming complete legacy-semantic parity and therefore keep canonical A2 end-to-end closure on HOLD until fixed.

## Next gate
- Implement and test `docs/tasks/AB_A2_LARGE_3MF_VALIDATOR_PARITY_CLOSURE_V0.md`.
- Revalidate the existing A2 archive on the fix commit; do not rerun full Sparse Support unless strictly necessary.
- Team AB / SKIN SOL reviews the exact fix commit.
- Only after canonical A2 end-to-end PASS: run G -> H -> J sequentially under equal conditions.

## HOLD / DO NOT CHANGE
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
- Candidate geometry, Support settings/semantics, Rabbit, FKEI and production SKIN were not changed by this commit.
- G/H/J were not run and no winner was selected.

### HOLD / not yet canonical PASS
- complete legacy/streaming report parity for all legacy-supported bounded XML cases
- boundary-safe comment / CDATA prefix handling
- non-model-root report parity
- canonical A2 end-to-end closure after the parity fix
- G/H/J execution
- physical comparison
- winner
