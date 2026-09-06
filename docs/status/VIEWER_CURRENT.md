# Viewer Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- implementation lane: FKEI Analysis Viewer v0
- branch: `agent/fkei-analysis-viewer-v0`
- base SHA: `2b64cebc09f8e11e5d9f78993d82f7239deb6823`
- reviewed HEAD: `1972cd34627b82aa6bd203ea5cb3c229732e109e`
- remote checkpoint: RESOLVED / FETCHABLE
- merge: NO
- deploy: NO

## Current phase
Viewer v0 technical implementation is PASS / CLOSED at `1972cd34627b82aa6bd203ea5cb3c229732e109e`. The bounded `Boundary-connected` semantic fix has been reviewed from GitHub and accepted. The lane is now at Author Review. No implementation is active.

## Active implementation instruction
- owner: NONE — waiting on Author Review
- task: NONE
- purpose: do not expand Viewer v0 before the author decides whether the four representations reveal genuinely new understanding.
- protected scope: no FKEI schema change; no SKIN Production source/semantics change; no BODY/Graph/Support change; no new Void metrics; no clearance, visibility, portal, Field, State, History, Scenario, split view, candidate comparison, merge, or deploy.
- next implementation instruction: only after Author Review and a separate SOL decision.

## PASS / CLOSED
- Remote publication blocker: CLOSED.
- Viewer architecture / scope boundary: PASS.
- Read-only canonical FKEI parser / serialization reuse: PASS by code review.
- Canonical Production v0 BODY path reuse: PASS by code review.
- Permanent Graph / Removable Support separation: PASS by code review.
- Production SKIN source diff: 0 in reviewed Viewer implementation sequence.
- FKEI schema diff: 0 in reviewed Viewer implementation sequence.
- Representation scope limited to Geometry / Graph / Surface / Void: PASS.
- Existing `SkinRenderer` reuse and shared camera across representations: PASS by code review; Browser Gate remains worker-reported.
- Void domain definition `V = Host/Base interior \ Final Production BODY`: PASS by code review.
- Final BODY out-of-domain warning: PASS by code review.
- Host/Base boundary-connected semantics: PASS at `1972cd34627b82aa6bd203ea5cb3c229732e109e`.
- Interior-Host regression fixture: PASS by code review; the fixture places the Host boundary inside the sampling box so the old envelope-edge implementation would fail.
- Viewer v0 technical implementation: PASS / CLOSED.

## Current blocker
- No technical implementation blocker.
- Author value gate is pending: usefulness of Geometry / Graph / Surface / Void as a research instrument is not yet proven.

## Next gate
Author Review only:
1. Does Geometry → Graph reveal a new understanding of the artifact?
2. Does Graph → Surface reveal something about materialization that Graph alone does not?
3. Most importantly, does Graph → Void reveal something that Graph could not show?
4. Does Void read as the form of the air retained by the artwork, rather than only as a numeric porosity-style metric?

Do not expand v0 before this gate.

## HOLD / DO NOT CHANGE
- no SKIN Production integration
- no FKEI schema change
- no Save / Export / Edit / Repair
- no State / Field / History / Scenario expansion
- no Split View / candidate comparison expansion
- no Void metric expansion beyond the existing v0 metrics before Author Review
- no shared analysis/Diagnostics refactor before demonstrated value
- no merge to Production
- no deploy

## Relevant artifacts
Reviewed initial implementation commit: `6a0e176cdb0bf54b5670d42b5a93bbe51a2f7f8e`

Reviewed semantic-fix commit: `1972cd34627b82aa6bd203ea5cb3c229732e109e`

Reviewed semantic-fix scope:
- `src/studies/fkei-analysis-viewer/voidAnalysis.ts`
- `src/studies/fkei-analysis-viewer/analysis.test.ts`
- `src/studies/fkei-analysis-viewer/main.ts`
- `src/studies/fkei-analysis-viewer/README.md`

Accepted C0 checkpoint at reviewed HEAD:
- Graph: 253 nodes / 272 edges / 1 component / beta1 20
- Surface: 143,448 triangles
- Void: 1 component / largest 100.0%
- Host/Base-boundary-connected: 1

## Evidence boundary
### Proven / supported
- Remote branch `agent/fkei-analysis-viewer-v0` resolves to reviewed HEAD `1972cd34627b82aa6bd203ea5cb3c229732e109e`.
- The semantic-fix commit is a direct child of the initial Viewer checkpoint and changes only Viewer README/test/UI-label/Void-analysis files.
- `voidAnalysis.ts` now classifies a Void component as Host/Base-boundary-connected when a Void cell is 6-neighbour adjacent to outside-Host space, including an outside-grid neighbour evaluated through `insideHost`.
- The deterministic interior-Host regression fixture would distinguish the corrected definition from the old sampling-box-edge definition.
- UI wording now says `Host/Base-boundary-connected`.
- README records the corrected C0 value and defines the metric explicitly.
- Existing canonical parser / Production BODY / renderer reuse remains intact in the reviewed fix diff.

### Worker-reported / not independently rerun by SOL
- `npm run build`: PASS
- Viewer analysis tests: PASS
- existing FKEI / Production v0 tests: PASS
- Browser Gate: PASS
- console warning/error: 0
- read-only identity: PASS
- camera preservation: PASS
- no GitHub Actions / commit-status CI evidence is attached to the reviewed commit.

### Not yet proven
- author value gate: whether Geometry / Graph / Surface / Void actually reveal new understanding
- any SKIN Diagnostics integration value
- value of any future shared analysis boundary / refactor
