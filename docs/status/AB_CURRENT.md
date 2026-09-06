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
