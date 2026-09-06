# Team AB — Support Indexing / Reporting Parity v0

Date: 2026-09-06
Owner: Team AB / SKIN SOL -> Temporary AB Implementation SOL / LUNA

## Purpose

Remove ambiguity between the printable Support triangle soup produced by `buildPrintSupportMesh()` and the exact indexed faces actually serialized into the 3MF archive.

This is a reporting / evidence task. It must not change Support geometry, routing, meshing, indexing, exporter schema/order, Candidate geometry, Rabbit policy, FKEI, or A/G/H/J comparison semantics.

## Review finding

The regenerated A2 physical-print package exposed two different counts that were previously both described as "Support faces":

- pre-index Support triangle soup: `71,808`
- exact indexed Support faces in saved 3MF: `71,728`
- exact degenerate Support triangles removed by indexing: `80`

The saved archive remains validator-valid and placement parity is PASS. BODY indexing removed `0` triangles.

The difference is explained by current code semantics:

- `astraLargeCandidate.worker.ts` currently publishes `supportTriangleCount: supportPositions.length / 9`, which is the pre-index triangle-soup count.
- `bambu3mf.ts` `indexTriangleSoup()` exact-welds equal Float32 coordinates and drops triangles whose indexed vertices collapse to repeated indices.
- `Bambu3mfStats.scaffoldFaces` already represents the post-index printable-support face count actually serialized in the archive.
- `Bambu3mfStats.removedDegenerateTriangles` / `bodyRemovedDegenerateTriangles` already expose indexing removal facts, but Astra reporting does not distinguish Support removal explicitly.

This is not remesh or decimation. The removed triangles have collapsed repeated indexed vertices and therefore carry no finite surface area in the serialized geometry.

## Required implementation

1. Keep the existing Support mesh and `indexTriangleSoup()` semantics unchanged.
2. Change Astra export/reporting terminology so the UI / compact summary cannot present the pre-index count as the archive face count.
3. Report both when useful:
   - generated / pre-index Support triangle count
   - indexed / serialized Support face count (`result.stats.scaffoldFaces`)
   - Support degenerate triangles removed during indexing
4. Keep BODY removal as an explicit hard gate at zero.
5. Add a small deterministic regression with a printable-support triangle soup containing at least one exact collapsed triangle and prove:
   - pre-index count is preserved as a generation fact;
   - indexed serialized count is lower by the exact removed count;
   - validator counts the indexed archive faces;
   - BODY count / geometry is unchanged.
6. Do not rerun A2 Full Sparse Support merely for this reporting fix.

## Canonical A2 facts after SOL review

Physical-print artifact:

- filename: `ASTRA_A_candidate-print-lane.3mf`
- archive SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`
- archive bytes: `75,491,879`
- BODY faces serialized: `5,934,044`
- BODY removed during indexing: `0`
- generated Support triangle soup: `71,808`
- Support degenerate triangles removed during indexing: `80`
- indexed Support faces serialized: `71,728`
- validator total triangles: `6,005,772`
- package translation Z: `48.029293060302734`
- validator on `1cf17eb7021a049269da76dc12f83524a52d2cf3`: PASS
- validator errors / warnings: `0 / 0`
- placement parity: PASS

The old `71,808 Support faces / 6,005,852 total` wording is superseded where it was intended to describe archive contents. `71,808` remains a valid pre-index Support-mesh generation count.

## Gate / priority

- This reporting fix does **not** block the first physical A2 print of the exact saved artifact above.
- It should be closed before G/H/J sequential execution so every candidate records both pre-index generation and exact serialized archive facts consistently.
- It may be implemented together with `docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md` if that keeps the change bounded.

## Protected scope

DO NOT CHANGE:

- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only Removable Support
- Support graph / routing decisions / physical parameters
- Rabbit forbidden volume / repair authority
- `indexTriangleSoup()` geometry semantics
- exporter schema / entry layout / ordering
- FKEI / authoring semantics
- A/G/H/J equal-condition comparison contract
- no remesh / decimation
- no hidden candidate-specific tuning
- no G/H/J execution as part of this task
- no winner selection
- no deploy

## Done when

- UI / compact evidence clearly distinguishes pre-index Support triangles from indexed archive Support faces
- exact removed-degenerate Support count is visible / recordable
- BODY removed count remains hard-gated at zero
- focused regression: PASS
- build: PASS
- Candidate / Support / Rabbit / exporter semantics changed: NO
- G/H/J run: NO
