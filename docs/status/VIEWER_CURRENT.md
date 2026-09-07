# Viewer Current Status

Last verified: 2026-09-07

## Authority
- repo: `satw-jp/katachi`
- implementation lane: FKEI Analysis Viewer v0
- branch: `agent/fkei-analysis-viewer-v0`
- base SHA: `2b64cebc09f8e11e5d9f78993d82f7239deb6823`
- reviewed HEAD: `55cb6f8440a551ea3695bd4a9ba6a097a0558bac`
- parent reviewed HEAD: `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- remote checkpoint: RESOLVED / FETCHABLE
- merge: NO
- deploy: NO

## NOW / Current phase
Viewer v0 technical implementation is PASS / CLOSED at `55cb6f8440a551ea3695bd4a9ba6a097a0558bac`.

The bounded Surface spatial-alignment fix is PASS. The Viewer now reverses the explicitly recorded Production `plateShiftSourceZ` on a Viewer-only Surface copy so Geometry / Graph / Surface / Void occupy the same canonical FKEI frame without mutating the Production runtime mesh or canonical FKEI serialization.

Author Review may resume with the same artifact and camera. No new Viewer implementation is active.

## Active task
- NONE.
- next owner: Author / Research SOL for Viewer Author Review.
- do not start Viewer expansion before the Author Review gate is interpreted.

## Reviewed alignment fix
- reviewed commit: `55cb6f8440a551ea3695bd4a9ba6a097a0558bac`
- parent: `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- lineage: exactly one commit ahead of the previously reviewed Viewer checkpoint
- changed files only:
  - `src/studies/fkei-analysis-viewer/fkeiAdapter.ts`
  - `src/studies/fkei-analysis-viewer/analysis.test.ts`
- root cause: Production analysis mesh carries an explicit build-plate Z translation in `plateShiftSourceZ`; Geometry / Graph / Void are interpreted in canonical FKEI source space
- fix: subtract only the recorded `plateShiftSourceZ` from the Viewer Surface triangles and corresponding source/mm bounds; clear the pending shift on the Viewer copy
- no arbitrary offset, XY change, scale change, camera compensation, FKEI rewrite, or Production mesh mutation
- regression verifies a non-zero fixture shift, exact Z reversal, bounds transformation, and non-mutation of the Production mesh object

## Review judgment
`PASS — Surface spatial-alignment fix CLOSED.`

Reason:
- diagnosis matches the bounded CURRENT task;
- fix is at the earliest Viewer-only adapter boundary where the representation changes frame;
- the offset is derived from explicit Production metadata rather than visually tuned;
- canonical FKEI read-only identity remains protected;
- no Production / SKIN renderer / Permanent Graph / Removable Support / Void semantics change is present in the reviewed diff;
- scope is exactly one commit / two Viewer files.

Worker-reported gates: Viewer analysis tests, build, SKIN/FKEI/Production tests, Browser Gate, and console warning/error `0` all PASS. GitHub has no attached commit status checks for this checkpoint, so execution evidence remains worker-reported while source/diff scope is directly SOL-reviewed.

## Blocker
- NONE for Viewer technical implementation.
- Author interpretation of corrected Graph → Surface comparison remains pending.

## Next gate — Author Review
Using the same artifact and shared camera, review:

1. **Geometry → Graph**: does Graph reveal a useful structural abstraction?
2. **Graph → Surface**: after alignment, does materialization add trustworthy insight rather than a presentation offset?
3. **Graph → Void**: what new understanding comes from retained-air structure?
4. **Void as artwork space**: does Void read as the shape of air retained by the artwork, and what is missing?

Record author observations. Do not expand metrics or Viewer representations during this gate.

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
- current alignment task authority: previous bounded instruction in this CURRENT
- reviewed alignment commit: `55cb6f8440a551ea3695bd4a9ba6a097a0558bac`
- previous semantic-fix checkpoint: `1972cd34627b82aa6bd203ea5cb3c229732e109e`
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
- Existing `SkinRenderer` reuse and shared camera: PASS by code review.
- Void domain definition `V = Host/Base interior \\ Final Production BODY`: PASS by code review.
- Final BODY out-of-domain warning: PASS by code review.
- Host/Base boundary-connected semantics: PASS at `1972cd34627b82aa6bd203ea5cb3c229732e109e`.
- Interior-Host regression fixture: PASS by code review.
- Surface canonical-frame alignment: PASS at `55cb6f8440a551ea3695bd4a9ba6a097a0558bac`.
- Viewer v0 technical implementation: PASS / CLOSED.

### Author observations retained from pre-alignment review
These remain useful except where Surface spatial position could have affected interpretation:
- Graph exposes that the current Permanent Structure reads as tube-like / insufficiently volumetric.
- Void reads as one simple retained-air mass rather than an articulated internal spatial structure.
- Surface with motifs appeared less structurally generic than Graph alone, but the final Graph → Surface interpretation must now be repeated after alignment.

### Relevant artifacts
- Reviewed initial implementation commit: `6a0e176cdb0bf54b5670d42b5a93bbe51a2f7f8e`
- Reviewed semantic-fix commit: `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- Reviewed Surface-alignment commit: `55cb6f8440a551ea3695bd4a9ba6a097a0558bac`
- Accepted C0 diagnostic checkpoint remains:
  - Graph: 253 nodes / 272 edges / 1 component / beta1 20
  - Surface: 143,448 triangles
  - Void: 1 component / largest 100.0%
  - Host/Base-boundary-connected: 1

### Evidence boundary
#### Proven / supported
- reviewed branch is exactly one commit ahead of `1972cd...` for the alignment fix.
- alignment diff is limited to Viewer adapter + focused regression test.
- the Viewer Surface reverses the recorded Production build-plate Z shift without changing canonical FKEI or Production runtime geometry.
- previous Boundary-connected semantics and canonical parser / BODY / renderer reuse remain intact in reviewed scope.

#### Author observation
- Graph and Void pre-alignment observations remain retained.
- corrected Graph → Surface interpretation is pending Author Review.

#### Not yet proven
- final author judgment of corrected Graph → Surface materialization value
- any SKIN Diagnostics integration value
- value of any future shared analysis boundary / refactor
