# Viewer Current Status

Last verified: 2026-09-07

## Authority
- repo: `satw-jp/katachi`
- implementation lane: FKEI Analysis Viewer v0
- branch: `agent/fkei-analysis-viewer-v0`
- base SHA: `2b64cebc09f8e11e5d9f78993d82f7239deb6823`
- reviewed HEAD: `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- remote checkpoint: RESOLVED / FETCHABLE
- merge: NO
- deploy: NO

## NOW / Current phase
Viewer v0 technical implementation remains PASS / CLOSED at `1972cd34627b82aa6bd203ea5cb3c229732e109e`. Author Review has produced useful observations: Graph reads as non-volumetric / tube-like, motifs make Surface less structurally generic, and Void reads as one simple mass rather than a spatially articulated retained-air structure. However, Surface is spatially misaligned relative to the other representations. That display inconsistency prevents a clean Graph → Surface comparison and is now the only active Viewer fix.

## Active task
- owner: V_LUNA / Viewer implementation worker
- task: `Surface representation spatial-alignment fix for Author Review`
- purpose: make Surface occupy the same canonical world-space position/orientation/scale as Geometry, Graph, and Void so representation switching compares the same artifact rather than a shifted presentation
- start point: `agent/fkei-analysis-viewer-v0` at `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- allowed scope: Viewer-only representation transform / renderer adapter / camera-preserving display logic, focused regression test or deterministic evidence for alignment, README/Browser Gate evidence if needed
- required diagnosis: identify whether mismatch comes from Surface mesh coordinates, Viewer transform, renderer object transform, bounds/centering logic, or camera framing; fix the earliest Viewer-only cause and do not use an arbitrary offset when canonical coordinates are available
- done when: same FKEI and unchanged camera show Geometry → Graph → Surface → Void in the same canonical artifact frame; existing tests/build, Browser Gate, console, read-only identity, and camera preservation pass; branch is pushed for Research SOL review

## Blocker
- Surface representation is visibly spatially misaligned relative to Geometry / Graph / Void in Author Review, so Graph → Surface materialization comparison is not yet trustworthy.

## Next gate
1. V_LUNA fixes only Surface spatial alignment and pushes the bounded checkpoint.
2. Research SOL reviews actual diff / tests / Browser evidence from GitHub.
3. If PASS, Author Review resumes with the same artifact and camera.
4. Author confirms whether Graph → Surface adds trustworthy materialization insight after alignment.
5. Existing Graph / Void observations remain valid; do not expand Viewer metrics before this display fix closes.

## Protected
- no SKIN Production integration or source/geometry semantics change
- no FKEI schema change
- no Production BODY generation change
- no Permanent Graph / Removable Support / Void analysis change
- no motif geometry change
- no new Void metrics
- no clearance / visibility / portal expansion
- no Field / State / History / Scenario expansion
- no Save / Export / Edit / Repair
- no split view / candidate comparison
- no shared analysis/Diagnostics refactor
- no merge to Production
- no deploy

## Required pointers
- task: this CURRENT's bounded Surface alignment instruction
- evidence: reviewed HEAD `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- dependencies: FKEI parser / Production BODY / shared renderer evidence below
- routing: `docs/TEAM_PROTOCOL_CORE.md` and `docs/protocol/CURRENT_FORMAT.md`

---

## Retained context / evidence pointers

### PASS / CLOSED
- Remote publication blocker: CLOSED.
- Viewer architecture / scope boundary: PASS.
- Read-only canonical FKEI parser / serialization reuse: PASS by code review.
- Canonical Production v0 BODY path reuse: PASS by code review.
- Permanent Graph / Removable Support separation: PASS by code review.
- Production SKIN source diff: 0 in reviewed Viewer implementation sequence.
- FKEI schema diff: 0 in reviewed Viewer implementation sequence.
- Representation scope limited to Geometry / Graph / Surface / Void: PASS.
- Existing `SkinRenderer` reuse and shared camera: PASS by code review; Browser Gate remains worker-reported.
- Void domain definition `V = Host/Base interior \ Final Production BODY`: PASS by code review.
- Final BODY out-of-domain warning: PASS by code review.
- Host/Base boundary-connected semantics: PASS at `1972cd34627b82aa6bd203ea5cb3c229732e109e`.
- Interior-Host regression fixture: PASS by code review.
- Viewer v0 technical implementation before Author Review: PASS / CLOSED.
- Author Review partial value evidence:
  - Graph exposes that the current Permanent Structure reads as tube-like / insufficiently volumetric.
  - Surface with motifs reads as less structurally generic than Graph alone.
  - Void reads as one simple retained-air mass rather than an articulated internal spatial structure.

### Relevant artifacts
- Reviewed initial implementation commit: `6a0e176cdb0bf54b5670d42b5a93bbe51a2f7f8e`
- Reviewed semantic-fix commit: `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- Accepted C0 checkpoint at reviewed HEAD before Surface display correction:
  - Graph: 253 nodes / 272 edges / 1 component / beta1 20
  - Surface: 143,448 triangles
  - Void: 1 component / largest 100.0%
  - Host/Base-boundary-connected: 1

### Evidence boundary
#### Proven / supported
- Remote branch resolves to reviewed HEAD before the new alignment task.
- Boundary-connected semantics and regression are accepted.
- Existing canonical parser / Production BODY / renderer reuse remain intact at the reviewed checkpoint.

#### Author observation
- Graph: current Permanent Graph does not read as a volumetric internal structure; it reads as tube-like.
- Surface: motifs reduce the impression of a simple generic structure, but the representation is spatially offset relative to the other views.
- Void: current retained air reads as a simple single mass; the author associates this with insufficient volumetric articulation in the Permanent Structure.

#### Not yet proven
- exact root cause of Surface spatial misalignment
- corrected Surface alignment
- trustworthy final Graph → Surface author comparison after correction
- any SKIN Diagnostics integration value
- value of any future shared analysis boundary / refactor
