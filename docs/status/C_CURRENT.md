# Team C Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- Production Algorithm / Support authority: `2b64cebc09f8e11e5d9f78993d82f7239deb6823`
- current Production Capability Baseline: `349e1a854d7e3699ac29afd167fc22e8131406d7`
- geometry fidelity checkpoint: `73bba117c1d09bf14735b1ad71938b086b165cf8`
- Permanent BODY fingerprint: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`
- Permanent Graph: 253 nodes / 272 edges / `5cb659849d694beaae6443a4828031b5b6471b836bbe5e78aede5aece1c34435`
- Removable Support: 577 nodes / 395 edges / `ef1d3eaec4146e171316a81e441797526fef6c8921d88a7689b68ac9c5892121`
- support source: `current-stage8:sparseResult.graph`
- production 3MF SHA-256: `bbc0af54bb6f038e61f211666a7a4378785cf2b6b106f9771acbbe5c96587e1c`
- UI IA v0A final evidence checkpoint: `c64cf091b1c66294ca885759e5a5a9069eb398af`
- FIELD vNext Interaction Correctness accepted checkpoint: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- Progressive FIELD review checkpoint: `a1596883e9772da144f54ec29aa8dd0339e4bbf5` — STRUCTURAL PASS / DENSE GATE PENDING

## Local/runtime authority
- canonical C workspace: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J canonical clone: `J:\dev\katachi`
- shared user-managed samples: `J:\dev\samples`
- `C:\dev\samples` is not authority
- live compute/helper: `J:\dev\katachi-compute-helper-tray`
- verified compute capability endpoint: `127.0.0.1:47658/v1/capabilities`
- compute/helper cutover: PASS; CUDA available; existing C client probe previously reported `available:true`
- retained C-side worktree/helper paths are rollback/evidence only

## Current phase
First Physical Gate, UI IA v0A, FIELD vNext capability retention, and FIELD vNext Interaction Correctness are PASS / CLOSED.

C SOL reviewed `agent/skin-runtime-status-progressive-field-v0` at `a1596883e9772da144f54ec29aa8dd0339e4bbf5` directly on GitHub.

The implementation structure is acceptable:

- tiny runtime-only compute/helper status is implemented and healthy J helper was shown as `Compute ● CUDA`;
- FIELD presentation now has proxy -> coarse -> medium -> fine states;
- camera interaction invalidates/restarts progression;
- backend preference remains session-only;
- renderer visibility/scheduling changes remain presentation-side;
- Production BODY / Graph / Support / FKEI / export implementation paths are unchanged;
- FIELD SDF source/map semantics and primitive ordering/grouping remain unchanged. The shader change adds only a presentation march-step ceiling; fine remains the established 160-step endpoint.

However the task is NOT globally closed. The required dense real-state browser gate is missing. The worker validated the progressive path at only 152 primitives, while the motivating author failure occurred on a much denser current state. The branch README explicitly notes that large ~10,450 primitive performance was not re-proven.

The current implementation schedules `medium` after 220 ms and `fine` after 620 ms. This is only acceptable if the dense real state remains responsive. The task contract forbids an automatic refinement tier that causes a visibly multi-second UI stall.

Therefore C SOL verdict is:

- Compute status implementation: STRUCTURAL PASS / runtime offline-state evidence still required.
- Progressive FIELD implementation structure: PASS.
- Progressive FIELD v0 overall: HOLD — Fix 1 dense real-state gate required.

Do not auto-start durability, Outside->Outside Support, Usagi, or new research work from this activation.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `Runtime Status + Progressive FIELD v0 Fix 1 · Dense Real-State Gate`
- task spec: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- continue from branch/checkpoint: `agent/skin-runtime-status-progressive-field-v0` / `a1596883e9772da144f54ec29aa8dd0339e4bbf5`
- execution: J-side only
- mode: evidence-first; do not redesign renderer unless the dense gate proves current progression remains unusable
- mandatory first gate:
  - use the same/current dense real sample/state representative of the author's long wait;
  - record primitive count;
  - record time to immediate proxy and first recognizable coarse FIELD;
  - record medium/fine sequence and whether any automatic tier blocks interaction for seconds;
  - interrupt refinement with camera movement and verify stale progression is cancelled/restarted;
  - verify coarse/medium are recognizable previews rather than misleading missing geometry.
- if current behavior is responsive: record evidence only and return to C SOL.
- if medium/fine causes multi-second stall: make only a bounded adaptive stop/refine presentation correction; do not force a known-expensive fine pass automatically.
- compute status evidence still required: helper healthy -> offline/unavailable -> healthy restore, with no endpoint/config rewrite.
- protected scope: FIELD SDF/source/primitive semantics; Production BODY / Permanent Graph / Local Relay / Graph Repair / Removable Support / supportSource / Output Scale / FKEI / Export / compute endpoint configuration / External STL Host / Usagi / durability implementation / Outside->Outside Support / new research algorithms.

## PASS / CLOSED
- C Research closed enough for v0
- Production architecture PASS / LOCKED
- Geometry Fidelity PASS / CLOSED
- Research M/M-R -> SKIN-native replay PASS
- Author Visual Gate PASS
- Removable Support wiring PASS / CLOSED
- offset-bend support restored
- 3MF PASS
- FIELD vNext capability retention PASS at `349e1a854d7e3699ac29afd167fc22e8131406d7`
- Output Scale semantics PRESENT under current C mm contract
- current Stage8 Artifact Export authority confirmed: `exportCurrentSkinRebuildArtifact`
- legacy v088: `COMPATIBILITY_ONLY`
- First Physical Gate PASS / CLOSED for the accepted near-vertical print regime
- UI IA v0A PASS / CLOSED at `c64cf091b1c66294ca885759e5a5a9069eb398af`
- FIELD vNext Interaction Correctness PASS / CLOSED at `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- C J workspace/runtime bootstrap PASS
- compute/helper J live cutover and J-side C connection PASS

## Progressive FIELD review
- reviewed branch: `agent/skin-runtime-status-progressive-field-v0`
- reviewed checkpoint: `a1596883e9772da144f54ec29aa8dd0339e4bbf5`
- parent: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- remote branch HEAD matches reviewed checkpoint
- branch is exactly one commit ahead of accepted FIELD interaction base
- changed scope is presentation/runtime-oriented: compute status, progressive FIELD state/scheduling, renderer/UI presentation, focused tests/docs
- `fieldVNextGpuShader.ts` and legacy `shaders.ts` each add `uMarchSteps`; SDF map functions and primitive semantics are not rewritten
- quality ladder: proxy 48 / coarse 72 / medium 112 / fine 160 march-step ceiling
- progression currently auto-schedules medium at 220 ms and fine at 620 ms after interaction settles
- worker-reported tests/typecheck/build/diff check: PASS
- GitHub commit has no attached CI status checks; source/diff scope was reviewed directly by C SOL
- browser evidence at 152 primitives is insufficient for final task closure
- branch README explicitly says ~10,450 primitive performance was not re-proven

## Current blocker / follow-up
- ACTIVE: dense real-state progressive FIELD usability gate.
- ACTIVE evidence gap: compute helper offline/unavailable -> healthy restore presentation.
- Permanent Structure durability remains `FAIL / LOCALIZED` for one observed single-attachment appendage, but its audit is QUEUED and not active.
- Strong-overhang / cantilever generalization remains UNVERIFIED; First Physical Print does not prove Usagi-like geometry.
- SKIN-support-alone full printability remains UNVERIFIED because the accepted print used limited manual supplemental slicer support.
- existing Workflow Guide-derived console `NotFoundError` remains a non-blocking separate follow-up.
- External STL Host + FKEI persistence remain separate-architecture HOLD.

## Next gate
1. C LUNA runs `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md` from `a1596883...` on J.
2. C SOL reviews dense timing/interaction evidence and any bounded adaptive correction if required.
3. Close Progressive FIELD v0 only if no automatic tier causes the author's multi-second unusable stall.
4. Do not automatically continue to another C task after this review.
5. `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md` remains QUEUED for later explicit start.
6. Usagi / strong-overhang validation remains later explicit scope.

## HOLD / DO NOT CHANGE
- motif-conditioned default seed
- Local Relay Permanent Network
- bounded Graph-only first repair
- Permanent BODY / member sizing / BODY field unless separately approved after durability audit
- current Stage8 Removable Support semantics and `current-stage8:sparseResult.graph`
- source-to-mm / Output Scale contract
- FIELD SDF math, sequential smooth-min order, primitive grouping/filter semantics, fieldPrimitiveStore semantics, and payload packing semantics
- verified compute endpoint / connection configuration
- legacy v088 compatibility semantics
- External STL Host / triangle-mesh Host architecture
- Co-evolution; Graph-conditioned default; D / F1 / F2 / F3 / C+D Hybrid
- new C research unless separately scoped
- Outside->Outside Support unless separately scoped
- bulk merge of historical feature branches
- retained C-side migration originals
- user-managed `J:\dev\samples` contents: do not commit, rename, reorganize, or delete without explicit instruction

## Relevant artifacts
- active Fix 1 task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0_FIX1_DENSE_GATE.md`
- reviewed progressive task: `docs/tasks/C_RUNTIME_STATUS_PROGRESSIVE_FIELD_V0.md`
- superseded visibility-only task: `docs/tasks/C_RUNTIME_STATUS_FIELD_VISIBILITY_V0.md`
- previous FIELD interaction task: `docs/tasks/C_FIELD_VNEXT_INTERACTION_CORRECTNESS_V0.md`
- reviewed progressive checkpoint: `a1596883e9772da144f54ec29aa8dd0339e4bbf5`
- accepted FIELD interaction checkpoint: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- shared physical observation note: `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`

## Evidence boundary
### Proven / supported
- locked Production identities remain authoritative.
- FIELD vNext exists and its layer/backend interaction behavior was previously accepted.
- J-side compute/helper runtime is healthy and connected through the existing configuration.
- `a1596883...` introduces a bounded progressive presentation state machine and compute-status presentation without changing Production source paths.
- fine FIELD remains the established 160-step raymarch endpoint; coarse/medium are preview-only tiers.
- branch remote authority matches `a1596883...`.

### Not yet proven
- progressive FIELD usability on the dense real state that motivated this task
- absence of multi-second blocking automatic medium/fine passes at dense primitive counts
- coarse/medium visual recognizability on the dense real state
- truthful compute helper offline -> healthy restore indicator behavior
- single-attachment durability generalization
- strong-overhang / cantilever physical generalization
- Usagi + V6 overhang-regime validation
- generic External STL Host on current C architecture
