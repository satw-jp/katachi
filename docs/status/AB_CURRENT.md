# Team AB Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- branch: `agent/skin-astra-large-3mf-streaming-v0`
- HEAD: `4599d6a4ac7351633d7860d6e9f594803107e10f`
- working tree: clean at reported checkpoint
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`

## Current phase
A2 candidate physical-comparison lane is past geometry, reachability, full Sparse Support, support mesh, large 3MF streaming serialization, compression, and ZIP assembly. The active bounded blocker is validator scalability for the large object-model XML.

## Active implementation instruction
- owner: Team AB / SKIN SOL -> Temporary AB Implementation SOL
- task: `SKIN — Large 3MF Streaming Validator v0`
- purpose: close the last known A2 infrastructure blocker so the A2 archive can be independently validated end-to-end.
- allowed scope: validator scalability only; replace full inflate/string/DOM-style materialization with bounded streaming / incremental validation while preserving existing validation coverage.
- protected scope: Candidate Geometry, Support semantics/parameters, Rabbit policy, FKEI/authoring semantics, A/G/H/J comparison contract, and exporter semantics must not change.
- done when: small-fixture validation parity remains PASS and the actual A2 archive passes the locked validation semantics; then return evidence to Team AB / SKIN SOL for A2 end-to-end review.
- instruction source: current AB checkpoint plus `docs/TEAM_REPORTING_RULES.md`; implementation must not expand beyond the validator task.

## Operating routing
- Team AB / SKIN SOL owns architecture, scope, next gate, and the bounded instruction for Temporary AB Implementation SOL / LUNA.
- The author does not need to rewrite or relay SOL implementation instructions.
- Implementation workers execute only the current bounded instruction and return evidence for SOL review; they do not self-approve global closure.
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

## Current blocker
- `validateSkin3mf()` still materializes very large XML / object trees and fails at A2 scale.

## Next gate
- Implement bounded streaming validator semantics without reducing validation coverage.
- Then close A2 end-to-end: validator → placement parity → fingerprint parity → download → release.
- Only after A2 end-to-end PASS: G → H → J sequential comparison.

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

## Relevant artifacts
- A2 execution triangles: 5,934,044 after exact-zero removal
- Full A2 Support graph: 2,150 nodes / 1,496 edges
- Accepted supports: 654
- Accepted BODY collision: 0
- Accepted Rabbit collision: 0
- Full Sparse Support runtime remains about 43m36s; currently treated as performance cost, not correctness blocker.

## Evidence boundary
### Proven / supported
- A2 can complete full Sparse Support with locked semantics.
- Large 3MF serialization / compression can complete without the previous single-string failure.

### Not yet proven
- Large A2 archive validator PASS
- A2 end-to-end PASS
- G/H/J execution
- physical comparison
- winner
