# Team AB Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- reviewed implementation branch: `agent/skin-astra-large-3mf-validator-v0`
- reviewed implementation HEAD: `0d6f176969c5e612f11623efb5423d21b6b3875b`
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- retained A2 artifact: `ASTRA_A_candidate-print-lane.3mf`
- archive SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`
- archive bytes: `75,491,879`
- retained path reported by implementation: `J:/My Drive/codex/2026-09-06/files-pasted-by-the-user-team/outputs/ASTRA_A_candidate-print-lane.3mf`
- shared author observation / Support hypothesis: `docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

## Current phase
A2 software/export gates are closed sufficiently for the first physical feasibility print. Bambu Studio preview shows many floating islands beyond the authored sparse removable Support, so the author selected supplementary Bambu Studio **automatic Tree Support at 45 deg** for this print.

This print is classified as:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

It is valid physical-feasibility evidence, but not proof that authored SKIN Support alone is sufficient.

The author's visual impression and the future Outside-only body-anchored removable Support hypothesis are preserved for cross-chat sharing in `docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`.

G/H/J remain HOLD until the author explicitly resumes the equal-condition comparison lane.

## Active implementation instruction
No implementation task is active while waiting on the author/manual A2 physical-print gate.

Queued before G/H/J:
- `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`
  - durable artifact identity / SHA before release
  - preferred persisted Support checkpoint for exact re-export without repeating Full Sparse Support

`docs/tasks/AB_SUPPORT_INDEXING_REPORTING_PARITY_V0.md` is CLOSED / PASS.

## PASS / CLOSED
- Candidate geometry / source-space Float32 execution
- exact-zero canonicalization
- A2 diagnostics / reachability
- Candidate packed BVH performance
- Rabbit forbidden-audit performance
- A2 Full Sparse Support: COMPLETE
- Support mesh generation
- large 3MF streaming serialization / compression / ZIP
- streaming validator scalability
- validator legacy/streaming XML parity at `1cf17eb7021a049269da76dc12f83524a52d2cf3`
- regenerated A2 archive retained with SHA-256 identity
- regenerated A2 validator PASS, errors/warnings `0/0`
- placement parity PASS; package Z `48.029293060302734`
- BODY indexing retention PASS (`0` removed)
- Support indexing reporting parity at `0d6f176969c5e612f11623efb5423d21b6b3875b`
  - generated / pre-index triangles explicitly reported
  - indexed / serialized faces explicitly reported
  - removed degenerate triangles explicitly reported
  - Support reporting mismatch fail-closed
  - focused regression reported `14/14 PASS`; build PASS

## Canonical A2 export facts
- Full Sparse Support targets: `4,561 / 4,561`
- supported / unsupported: `654 / 3,907`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY collision: `0`
- accepted Rabbit collision: `0`
- BODY serialized faces: `5,934,044`
- BODY removed during indexing: `0`
- generated Support pre-index triangles: `71,808`
- Support degenerate triangles removed during indexing: `80`
- indexed / serialized Support faces: `71,728`
- validator total archive triangles: `6,005,772`
- archive bytes: `75,491,879`
- archive SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`

The old wording `71,808 Support faces / 6,005,852 total` is SUPERSEDED when describing serialized archive contents. `71,808` remains the valid generated pre-index Support triangle count.

## Next gate — A2 physical feasibility print
Print the exact retained A2 archive with:
- no rescale / reposition
- authored SKIN Support unchanged and present
- supplementary Bambu automatic Tree Support at `45 deg`
- no candidate-specific hidden tuning

Record before/relevant to comparison reuse:
- printer / nozzle / process / material profile
- Bambu Support settings
- first-layer / adhesion behavior
- completion or exact failure point
- Bambu Tree Support removal behavior
- authored SKIN Support removal behavior / BODY damage
- visible physical defects

If supplementary slicer Support is later used for A/G/H/J comparison, freeze the same slicer Support policy/profile across all candidates.

## Future Support architecture hypothesis — HOLD / not active
Author observation: current SKIN removable Support appears easy to remove. A promising future direction is `Outside-only body-anchored removable Support`: allow a lower, already-printable exterior BODY region to act as an explicit removable-Support anchor for a higher Outside target.

Shared note: `docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

A future bounded design gate must preserve:
- Outside/exterior reachability for target and anchor
- lower anchor already has a valid printable load path
- layer-causal/buildable route from anchor to target
- no unsupported island anchoring another unsupported island
- no BODY-interior traversal
- explicit bounded removable contact zones only
- non-contact route outside BODY and Rabbit forbidden volume
- no Inside-derived target/anchor and no internal removable-support rescue
- Candidate BODY unchanged; Support remains separate/removable

This hypothesis does not change the current A/G/H/J baseline.

## HOLD / DO NOT CHANGE
- G/H/J execution until author explicitly resumes
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- current baseline: Outside-only Removable Support
- Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
- Rabbit forbidden-volume policy
- A/G/H/J equal-condition physical comparison contract
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- no winner before physical comparison
- no Astra production implementation
- no deploy from this gate

## Evidence boundary
### PASS / PROVEN
- A2 software geometry / diagnostics / Support / export / validation chain under locked conditions
- durable regenerated A2 archive identity
- exact pre-index vs serialized Support-count semantics
- Bambu Studio import / slice preview

### AUTHOR OBSERVATION
- A2 form is visually very attractive / promising; this is not winner selection.
- current SKIN removable Support appears easy to remove; Outside-only body-anchored removable Support is a future hypothesis, not a current baseline change.

### NOT YET PROVEN / HOLD
- A2 physical print completion
- authored Support alone as sufficient physical support
- full physical profile frozen for A/G/H/J
- artifact-retention checkpoint before G/H/J
- body-anchored removable Support hypothesis
- G/H/J execution
- A/G/H/J physical comparison
- winner
