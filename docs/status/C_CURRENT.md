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

Author visual check on the J runtime after compute/helper startup found two remaining runtime presentation issues:

1. SKIN does not visibly expose whether katachi compute/helper is connected.
2. FIELD can be selected and labeled `current` while the viewport shows only the grid / no visible FIELD shape.

The second issue persists after starting the correct J-side helper, so compute/helper must not be assumed to be the cause. Current availability code can mark FIELD `current` from host availability alone; visible viewport content is now the required gate.

The author explicitly reopened C only for this bounded runtime presentation/correctness follow-up. Do not auto-start durability, Outside→Outside Support, Usagi, or new research work from this activation.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `Runtime Status + FIELD Visibility Correctness v0`
- task spec: `docs/tasks/C_RUNTIME_STATUS_FIELD_VISIBILITY_V0.md`
- start authority: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- preferred branch: `agent/skin-runtime-status-field-visibility-v0`
- execution: J-side only; create/use a clean J worktree from the accepted checkpoint
- purpose:
  - add a tiny truthful compute/helper status indicator;
  - make FIELD visible-content behavior truthful and usable instead of `current` + unexplained blank viewport.
- allowed scope: runtime/status presentation, existing compute probe presentation, FIELD display/source wiring, truthful FIELD empty/unavailable presentation, focused tests/evidence.
- protected scope: FIELD semantic shader/math and primitive semantics; Production BODY / Permanent Graph / Local Relay / Graph Repair / Removable Support / supportSource / Output Scale / FKEI / Export / compute endpoint configuration / External STL Host / Usagi / durability algorithm / research algorithms.
- done when:
  - tiny compute state truthfully shows healthy/CUDA, unavailable, or checking state using the existing probe;
  - known current authoring geometry visibly renders in FIELD Legacy and vNext, or a truthful explicit unavailable/empty reason is shown;
  - no `FIELD current` + unexplained blank viewport on the browser gate sample;
  - accepted vNext interaction behavior remains intact;
  - tests/typecheck/build/diff check pass;
  - Production parity remains exact;
  - branch is pushed for C SOL review.

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

## Current blocker / follow-up
- ACTIVE: FIELD visible-content correctness on the author-observed J runtime.
- ACTIVE: author-facing compute/helper connection status is missing.
- Permanent Structure durability remains `FAIL / LOCALIZED` for one observed single-attachment appendage, but its audit is QUEUED and not active.
- Strong-overhang / cantilever generalization remains UNVERIFIED; First Physical Print does not prove Usagi-like geometry.
- SKIN-support-alone full printability remains UNVERIFIED because the accepted print used limited manual supplemental slicer support.
- existing Workflow Guide-derived console `NotFoundError` remains a non-blocking separate follow-up.
- External STL Host + FKEI persistence remain separate-architecture HOLD.

## Next gate
1. C LUNA executes `docs/tasks/C_RUNTIME_STATUS_FIELD_VISIBILITY_V0.md` from `dad764ce...` on J.
2. C SOL reviews source scope, browser visible-content evidence, compute-status behavior, and exact Production parity.
3. Do not automatically continue to another C task after this review.
4. `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md` remains QUEUED for later explicit start.
5. Usagi / strong-overhang validation remains later explicit scope.

## HOLD / DO NOT CHANGE
- motif-conditioned default seed
- Local Relay Permanent Network
- bounded Graph-only first repair
- Permanent BODY / member sizing / BODY field unless separately approved after durability audit
- current Stage8 Removable Support semantics and `current-stage8:sparseResult.graph`
- source-to-mm / Output Scale contract
- FIELD vNext semantic shader/math and sequential primitive semantics
- verified compute endpoint / connection configuration
- legacy v088 compatibility semantics
- External STL Host / triangle-mesh Host architecture
- Co-evolution; Graph-conditioned default; D / F1 / F2 / F3 / C+D Hybrid
- new C research unless separately scoped
- Outside→Outside Support unless separately scoped
- bulk merge of historical feature branches
- retained C-side migration originals
- user-managed `J:\dev\samples` contents: do not commit, rename, reorganize, or delete without explicit instruction

## Relevant artifacts
- active task: `docs/tasks/C_RUNTIME_STATUS_FIELD_VISIBILITY_V0.md`
- previous FIELD interaction task: `docs/tasks/C_FIELD_VNEXT_INTERACTION_CORRECTNESS_V0.md`
- accepted FIELD interaction checkpoint: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- shared physical observation note: `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`

## Evidence boundary
### Proven / supported
- locked Production identities remain authoritative.
- FIELD vNext exists and its interaction proxy/switching behavior was previously accepted.
- J-side compute/helper runtime is healthy and connected through the existing configuration.
- author runtime evidence shows FIELD can still be visually blank while selected/marked current; this is not yet a closed gate.
- current FIELD availability status alone is insufficient as visible-content evidence.

### Not yet proven
- FIELD Legacy and vNext both visibly render the intended current authoring geometry on the newly observed runtime state after this follow-up fix
- truthful author-facing compute/helper indicator behavior across healthy/offline/checking states
- single-attachment durability generalization
- strong-overhang / cantilever physical generalization
- Usagi + V6 overhang-regime validation
- generic External STL Host on current C architecture
