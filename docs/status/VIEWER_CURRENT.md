# Viewer Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- implementation lane: FKEI Analysis Viewer v0
- branch: `agent/fkei-analysis-viewer-v0`
- base SHA: `2b64cebc09f8e11e5d9f78993d82f7239deb6823`
- reviewed HEAD: `6a0e176cdb0bf54b5670d42b5a93bbe51a2f7f8e`
- remote checkpoint: RESOLVED / FETCHABLE
- merge: NO
- deploy: NO

## Current phase
Viewer v0 architecture and implementation boundary have passed SOL review with one bounded metric correction required before Author Review. Geometry / Graph / Surface / Void, read-only FKEI handling, canonical Production reuse, and Production isolation are accepted. The only active fix is the meaning of the Void `Boundary-connected` metric.

## Active implementation instruction
- owner: V_LUNA / Viewer implementation worker
- task: correct the Void boundary-connected component definition without expanding v0 scope
- purpose: current code marks a Void component boundary-connected only when it touches the outer 64^3 sampling-box cells; the Viewer label/intent is connection to the Host / Base envelope boundary. These are not equivalent for an implicit Host inside its bounding box.
- allowed scope: in Viewer-only Void analysis/tests/UI/README as needed, classify a component as Host/Base-boundary-connected when a Void cell is adjacent through the 6-neighbour grid to outside-Host space, including leaving the analysis grid; update the C0 reported value if it changes; add a deterministic analytic regression fixture where the Host boundary lies inside the sampling box so the old implementation would fail.
- protected scope: no FKEI schema change; no SKIN Production source/semantics change; no BODY/Graph/Support change; no new Void metrics; no clearance, visibility, portal, Field, State, History, Scenario, split view, candidate comparison, merge, or deploy.
- done when: Viewer tests prove Host/Base-boundary connectivity semantics (including the interior-Host regression), existing Viewer/FKEI/Production tests and build remain PASS, Browser Gate remains clean, read-only identity and camera preservation remain PASS, and the branch is pushed for SOL review.
- instruction source: this CURRENT file; shared routing authority is `docs/TEAM_REPORTING_RULES.md` on `main`.

## PASS / CLOSED
- Remote publication blocker: CLOSED.
- Viewer architecture / scope boundary: PASS.
- Read-only canonical FKEI parser / serialization reuse: PASS by code review.
- Canonical Production v0 BODY path reuse: PASS by code review.
- Permanent Graph / Removable Support separation: PASS by code review.
- Production SKIN source diff: 0 in base→HEAD compare.
- FKEI schema diff: 0 in base→HEAD compare.
- Representation scope limited to Geometry / Graph / Surface / Void: PASS.
- Existing `SkinRenderer` reuse and shared camera across representations: PASS by code review; Browser Gate remains worker-reported.
- Void domain definition `V = Host/Base interior \ Final Production BODY`: PASS by code review.
- Final BODY out-of-domain warning: PASS by code review.

## Current blocker
- `Boundary-connected` is semantically inaccurate in reviewed HEAD `6a0e176...`: `voidAnalysis.ts` currently checks only whether a component reaches x/y/z index 0 or resolution-1. It does not detect adjacency to the implicit Host/Base boundary located inside the sampling bounding box.

## Next gate
1. V_LUNA implements only the boundary-connectivity correction and regression test above.
2. V_LUNA pushes the fix and returns the compact SOL-review handoff.
3. Viewer SOL verifies the fix from GitHub.
4. If PASS: Viewer v0 implementation closes and proceeds to Author Review.
5. Author Review asks whether Geometry→Graph, Graph→Surface, and especially Graph→Void reveal genuinely new understanding. Do not expand v0 before that gate.

## HOLD / DO NOT CHANGE
- no SKIN Production integration
- no FKEI schema change
- no Save / Export / Edit / Repair
- no State / Field / History / Scenario expansion
- no Split View / candidate comparison expansion
- no Void metric expansion beyond the existing v0 metrics before Author Review
- no merge to Production
- no deploy

## Relevant artifacts
Reviewed implementation commit: `6a0e176cdb0bf54b5670d42b5a93bbe51a2f7f8e`

Reviewed scope:
- Geometry / Graph / Surface / Void
- canonical existing FKEI parser / Production v0 BODY builder / `runtime.project.finalGraph` / `runtime.project.base`
- Viewer-specific read-only adapter, representation switching, graph metrics, 64^3 Void analysis, out-of-envelope notice

Reported C0 checkpoint at reviewed HEAD:
- Graph: 253 nodes / 272 edges / 1 component / beta1 20
- Surface: 143,448 triangles
- Void: 1 component / largest 100.0%
- reported `Boundary-connected: 0` is NOT ACCEPTED until corrected semantics are rerun

## Evidence boundary
### Proven / supported
- Branch/commit are remotely fetchable and base→HEAD is one Viewer commit.
- Compare shows no `src/studies/skin/*` Production modifications.
- Adapter directly reuses canonical FKEI parse/project/serialize and `buildSkinProductionV0FromProject`.
- Viewer BODY SDF parameters match Production v0 BODY/SDF contract (`plate`, current settings, coinBulge 0, Production quad join width, finalGraph).
- Viewer writes no analysis result back into FKEI.

### Worker-reported / not independently rerun by SOL
- `npm run build`: PASS
- studies catalog: 19 PASS
- Viewer analysis tests: PASS
- existing FKEI / Production v0 tests: PASS
- `git diff --check`: PASS
- Browser Gate: PASS with real-coordinate interaction and console warning/error 0

### Not yet proven
- corrected Host/Base boundary-connected metric
- final Viewer v0 SOL acceptance after the bounded fix
- author value gate: whether Graph / Surface / Void actually reveal new understanding
- any SKIN Diagnostics integration value
