# Team AB Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- validator branch: `agent/skin-astra-large-3mf-validator-v0`
- validator HEAD: `1cf17eb7021a049269da76dc12f83524a52d2cf3`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- regenerated physical artifact: `ASTRA_A_candidate-print-lane.3mf`
- regenerated archive SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`
- regenerated archive bytes: `75,491,879`
- reported retained path: `J:/My Drive/codex/2026-09-06/files-pasted-by-the-user-team/outputs/ASTRA_A_candidate-print-lane.3mf`

## Current phase
A2 archive regeneration is complete under the locked A2 conditions. The regenerated archive is retained, independently inspected, validates on validator-fix HEAD `1cf17eb...`, and has placement parity PASS. Team AB / SKIN SOL accepts the regenerated archive for the first physical A2 print.

Bambu Studio preview of the exact retained A2 artifact shows many floating regions / islands that are not fully covered by the authored sparse removable Support. The author therefore identified that supplementary Bambu slicer-generated Support must be enabled for the first physical feasibility print.

This does **not** invalidate the authored Support result. It changes the physical-gate interpretation:
- first A2 print may use supplementary Bambu slicer Support to make the artifact physically printable;
- that print is evidence for A2 physical feasibility, not yet evidence that authored Support alone is sufficient;
- if later A/G/H/J physical comparison uses slicer-generated Support, the same Bambu Support policy/profile must be frozen and applied to every candidate under equal conditions.

G/H/J remain intentionally paused until the author resumes the equal-condition comparison lane.

## SOL review — validator parity closure
Commit `1cf17eb7021a049269da76dc12f83524a52d2cf3` is ACCEPTED for the bounded validator parity task.

Reviewed changes are limited to validator / validator tests:
- partial `<!--` / `<![CDATA[` opener handling is boundary-safe;
- wrong-root error reporting preserves legacy report semantics;
- comment / CDATA / entity / wrong-root and malformed corpus is differential-tested across compressed input chunk sizes 1..64;
- implementation handoff reports large 538,792,408-byte synthetic PASS, 24 related regressions PASS and build PASS;
- regenerated actual A2 archive validates with errors / warnings `0 / 0`.

`docs/tasks/AB_A2_LARGE_3MF_VALIDATOR_PARITY_CLOSURE_V0.md` is therefore CLOSED / PASS.

## SOL review — Support face-count discrepancy
The regeneration stop condition exposed a terminology / reporting mismatch, not a new Support correctness failure.

Canonical distinction:
- generated pre-index Support triangle soup: `71,808`
- Support degenerate triangles removed by exact Float32 indexing: `80`
- indexed / serialized Support faces in the 3MF archive: `71,728`
- BODY faces serialized: `5,934,044`
- BODY removed during indexing: `0`
- validator total archive triangles: `6,005,772`

Reason:
- Astra compact reporting currently uses `supportPositions.length / 9`, which counts the pre-index triangle soup;
- `bambu3mf.ts` intentionally drops triangles whose exact indexed Float32 vertices collapse to repeated indices;
- canonical archive face authority is the post-index 3MF / `Bambu3mfStats.scaffoldFaces`, not the pre-index Support triangle-soup count.

The removed Support triangles are zero-area collapsed faces. This is not remesh / decimation and does not subtract finite Support surface geometry. BODY removal remains zero and hard-gated.

The previous wording `Support 71,808 faces / total 6,005,852` is SUPERSEDED when used to describe archive contents. `71,808` remains a valid generated pre-index Support-mesh fact.

A bounded reporting task is queued at:
- `docs/tasks/AB_SUPPORT_INDEXING_REPORTING_PARITY_V0.md`

That task does not block the first A2 physical print, but should close before G/H/J so all candidates record pre-index and exact serialized counts consistently.

## A2 regenerated artifact — PASS / physical-print authority
- Full Sparse Support: `4,561 / 4,561` targets
- supported / unsupported: `654 / 3,907`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY collision: `0`
- accepted Rabbit collision: `0`
- BODY faces serialized: `5,934,044`
- BODY removed during indexing: `0`
- generated Support triangles: `71,808`
- Support degenerate removed during indexing: `80`
- indexed Support faces serialized: `71,728`
- validator total triangles: `6,005,772`
- archive bytes: `75,491,879`
- archive SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`
- package translation Z: `48.029293060302734`
- validator: PASS on `1cf17eb...`
- validator errors / warnings: `0 / 0`
- placement parity: PASS
- Bambu Studio import / slice preview: PASS
- Bambu slicer preview observation: many floating regions remain; supplementary slicer Support required for first feasibility print
- G/H/J: NOT RUN
- merge / deploy: NO

## Active implementation instruction
No implementation is required before the author proceeds with the A2 physical feasibility print using the exact retained artifact plus explicitly recorded supplementary Bambu slicer Support.

Queued before G/H/J:
1. `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
   - durable artifact / SHA / checkpoint retention before release
   - preferred Support checkpoint for exact re-export without Full Sparse Support rerun
2. `docs/tasks/AB_SUPPORT_INDEXING_REPORTING_PARITY_V0.md`
   - distinguish pre-index Support triangles from indexed archive Support faces
   - record role-specific indexing removal facts

These may be implemented together if the implementation remains bounded and does not change geometry / Support semantics.

## Next gate — author/manual physical A2 feasibility print
Open the exact saved artifact identified by SHA-256 above and enable supplementary Bambu Studio Support as required by the slicer preview.

For this first physical feasibility gate:
- do not rescale or reposition the A2 artifact;
- keep the authored printable-support geometry present and unchanged;
- supplementary slicer-generated Support is allowed and must be explicitly recorded;
- do not add candidate-specific hidden tuning;
- do not alter Candidate geometry, Rabbit policy or authored Support geometry;
- record the Bambu printer/profile, nozzle, layer profile and Support policy used before treating the result as reusable comparison evidence.

Physical evidence classification:
- `A2 + authored Support + Bambu supplementary Support` print success/failure = valid A2 physical-feasibility evidence;
- it is **not** proof that authored Support alone is sufficient;
- it is **not yet** A/G/H/J equal-condition comparison evidence unless the slicer Support policy is frozen and reused unchanged across all candidates.

Record:
- exact Bambu Support mode/settings used;
- post-support slicer preview and whether floating-region warning clears;
- BODY and authored Support appearance;
- first-layer / adhesion behavior;
- print start / completion or exact failure point;
- visible Support/BODY collision or detachment;
- slicer-Support removal behavior;
- authored-Support removal behavior and BODY damage;
- obvious physical defects relevant to later A/G/H/J comparison.

## HOLD / DO NOT CHANGE
- G/H/J execution until author explicitly resumes
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only Removable Support
- authored Support physical settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume policy
- A/G/H/J equal-condition comparison contract
- FKEI / authoring semantics
- no remesh / decimation
- no internal removable-support rescue
- no hidden candidate-specific tuning
- no winner selection before physical comparison
- no Astra production implementation
- no deploy from this gate

## Evidence boundary
### PASS / PROVEN
- A2 geometry / diagnostics / reachability / Full Sparse Support under locked conditions
- regenerated A2 archive retained with SHA-256 identity
- validator parity fix accepted at exact commit `1cf17eb...`
- regenerated actual A2 validator PASS
- placement parity PASS
- BODY indexing retention PASS (`0` removed)
- exact archive Support indexing facts recorded
- Bambu Studio imports/slices the exact A2 artifact
- slicer preview demonstrates authored Support alone is insufficient to cover all floating regions
- first A2 artifact is ready for supplementary-support physical feasibility print

### NOT YET PROVEN / HOLD
- A2 physical print completion
- authored Support alone as sufficient physical support
- frozen Bambu supplementary Support policy for equal-condition A/G/H/J comparison
- artifact-retention checkpoint implementation before G/H/J
- Support indexing reporting UI fix before G/H/J
- G/H/J execution
- A/G/H/J physical comparison
- winner
