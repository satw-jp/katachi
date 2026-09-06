# Team C Current Status

Last verified: 2026-09-06

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
- UI IA v0A reviewed implementation checkpoint: `22ef22bcc327e048ed994c8fa8c3964ad20b324c`
- UI IA v0A final evidence checkpoint: `c64cf091b1c66294ca885759e5a5a9069eb398af`

## Current phase
First Physical Gate and SKIN Production UI IA v0A are PASS / CLOSED. Post-closure author runtime evidence shows FIELD vNext is present and can render the dense current state, but its interaction behavior is not yet acceptable: exact vNext rendering is slow during camera interaction, and switching from FIELD(vNext) to BEADS can leave the vNext fullscreen result visible. This is classified as a display/interactivity correctness issue, not a Production or FIELD-semantic failure.

Additional post-print handling evidence now identifies a localized Permanent Structure durability weakness: an appendage/subgraph that the author describes as supported by a single connection to the main artwork detached during casual play/handling. The detached subgraph remained substantially coherent while the root connection failed. A mirrored/opposite-side analogue is suspected to share the same weakness but has not been deliberately broken. This does not reopen the completed print/support-removal gate; it changes the durability evidence boundary and justifies a queued single-attachment graph audit.

Author observation also narrows the physical generalization claim: the successful First Physical Print had a predominantly vertical / linear overall shape, which likely reduced sustained overhang demand and lateral cantilever loading. Treat the closed First Physical Gate as shape-conditioned evidence for this near-vertical regime, not as proof that the same locked Production parameters will succeed on strongly overhanging hosts. Usagi therefore represents a materially different overhang/load regime and must be validated as such.

## Active implementation instruction
- owner: C SOL -> C LUNA
- task: `FIELD vNext Interaction Correctness v0`
- purpose: make top-level view switching authoritative and keep vNext camera interaction responsive without changing FIELD or Production semantics.
- start point: exact accepted UI/evidence checkpoint `c64cf091b1c66294ca885759e5a5a9069eb398af`
- preferred branch: `agent/skin-field-vnext-interaction-v0`
- allowed scope: renderer/view visibility authority, session-only backend presentation state, camera-interaction lightweight proxy, focused tests and evidence.
- protected scope: FIELD semantic shader/math and payload semantics; BODY / Permanent Graph / Local Relay / Graph Repair / Support / supportSource / Output Scale / FKEI / Export / External STL Host / Usagi / research algorithms.
- done when: FIELD(vNext) <-> BEADS/MESH/etc switching is correct, active camera interaction does not continuously render the expensive exact vNext path, exact vNext restores after interaction, tests/browser gate pass, and Production parity remains exact.
- instruction source: `docs/tasks/C_FIELD_VNEXT_INTERACTION_CORRECTNESS_V0.md`

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
- First Physical Gate for current print semantics PASS / CLOSED on 2026-09-06
- First Physical Print author-edited Bambu 3MF local archive verification PASS
- UI IA v0A structural implementation PASS at `22ef22bcc327e048ed994c8fa8c3964ad20b324c`
- UI IA v0A exact Production parity PASS at `c64cf091b1c66294ca885759e5a5a9069eb398af`
- UI IA v0A PASS / CLOSED on 2026-09-06

## Current blocker
- No Production geometry / support / export blocker for the proven near-vertical First Print regime.
- FIELD vNext runtime interaction correctness is ACTIVE: stale fullscreen visibility across View Layer switching and poor camera-interaction responsiveness were observed by the author on the dense current state.
- Permanent Structure durability: `FAIL / LOCALIZED` for at least one single-attachment appendage under casual handling. Global BODY collapse was not observed.
- Strong-overhang / cantilever generalization is UNVERIFIED; the First Physical Print must not be used as evidence that Usagi-like geometry will behave equivalently.
- External STL Host + FKEI persistence remain separate-architecture HOLD.
- SKIN-support-alone full printability remains UNVERIFIED; accepted First Physical Gate included limited manual supplemental support.
- First Physical Print 3MF Google Drive cloud visibility remains UNVERIFIED; local synced-drive copy/hash verification is PASS.

## Next gate
1. C LUNA implements `docs/tasks/C_FIELD_VNEXT_INTERACTION_CORRECTNESS_V0.md` from `c64cf091...` on a new bounded branch.
2. C SOL reviews visibility correctness, interaction proxy behavior, browser evidence, and exact Production parity.
3. After FIELD vNext interaction closes, run queued `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md` unless C SOL explicitly reprioritizes it earlier. The audit is diagnostic/evidence-only and must not change Permanent Structure.
4. C SOL then decides whether a separate bounded Permanent Structure reinforcement task is justified by bridge/articulation evidence.
5. Usagi + V6 parameter-locked validation remains eligible, but when scoped it must explicitly test a strong-overhang regime: support demand, cantilever/lateral load exposure, and single-attachment weakness must be treated as new validation dimensions rather than assuming the First Print result generalizes.

## HOLD / DO NOT CHANGE
- Motif-conditioned default seed
- Local Relay Permanent Network
- bounded Graph-only first repair
- Permanent BODY / member sizing / BODY field unless a separate post-audit reinforcement task is explicitly approved
- current Stage8 Removable Support semantics and `current-stage8:sparseResult.graph`
- source-to-mm / Output Scale contract
- FIELD vNext display-only / session-only semantics
- FIELD vNext semantic shader/math and sequential primitive semantics during the active interaction task
- legacy v088 compatibility semantics
- External STL Host / triangle-mesh Host architecture
- Co-evolution; Graph-conditioned default; D / F1 / F2 / F3 / C+D Hybrid
- new C research unless separately scoped
- bulk merge of historical feature branches

## Relevant artifacts
- UI IA v0A implementation: `22ef22bcc327e048ed994c8fa8c3964ad20b324c`
- UI IA v0A parity evidence: `c64cf091b1c66294ca885759e5a5a9069eb398af`
- parity report: `docs/evidence/skin-production-ui-ia-v0-fix2/PARITY_REPORT.md`
- FIELD vNext interaction task: `docs/tasks/C_FIELD_VNEXT_INTERACTION_CORRECTNESS_V0.md`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- post-print durability evidence: author photo on 2026-09-06 showing one detached appendage/subgraph after casual handling; opposite-side analogue retained intact for comparison
- First Physical Print author-edited Bambu 3MF local archive: `J:\My Drive\ChatGPT\SKIN\_C\Physical Evidence\2026-09-06_First_Physical_Print\3MF\SKIN-C-production-v0-support-fixed.3mf`
- archived 3MF size: `2,066,585 bytes`
- archived 3MF SHA-256: `a68f04638751c4cb91e905267d47eeb1593d7b776c287919a4d59ea69a41c41b`

## Evidence boundary
### Proven / supported
- locked Production architecture and current Stage8 Support/export semantics remain authoritative.
- First Physical Gate and UI IA v0A are closed.
- FIELD vNext capability is retained and can render the current dense state.
- current code directly forces vNext fullscreen visibility in backend/payload paths while top-level View Layer has a separate visibility authority; author evidence shows the resulting stale-view behavior in practice.
- current semantic vNext shader scans the full primitive set for each field query; this exact path is expensive at the observed dense primitive count.
- one physically printed terminal appendage/subgraph failed at its single attachment during casual handling while the larger artwork remained coherent.
- the detached subgraph itself remained substantially intact, supporting a localized root-connection weakness rather than a global print-collapse interpretation.
- the successful First Physical Print proves print/support-removal viability only for the observed predominantly vertical / linear shape regime with limited manual supplemental slicer support.

### Not yet proven
- whether every single-edge/bridge-only graph appendage is physically weak
- whether the mirrored/opposite-side analogue will fail under the same handling
- which exact Permanent Graph bridge/articulation candidate corresponds to the observed broken piece
- acceptable FIELD vNext camera-interaction responsiveness after correction
- correct repeated FIELD(vNext) <-> BEADS/MESH/etc switching after correction
- SKIN-support-alone full printability without supplemental slicer support
- strong-overhang / cantilever physical generalization of the locked Production parameters
- Usagi + V6 parameter-locked validation in the overhang regime
- generic External STL Host on current C architecture
- P0-B authoring-resource retention where not yet checked
