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
- UI IA v0A reviewed implementation checkpoint: `22ef22bcc327e048ed994c8fa8c3964ad20b324c`
- UI IA v0A final evidence checkpoint: `c64cf091b1c66294ca885759e5a5a9069eb398af`
- FIELD vNext Interaction Correctness v0 accepted checkpoint: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- preferred local workspace: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- J-side canonical clone: `J:\dev\katachi`
- user-managed shared samples authority: `J:\dev\samples`
- `C:\dev\samples` is not an authority for future C work
- J cutover status: PASS — accepted FIELD checkpoint reconstructed cleanly on J with no C-linked Git metadata
- J runtime bootstrap status: PASS — `npm ci`, FIELD focused tests 8/8, build PASS, J-side Vite dev launch and browser C/FIELD smoke PASS
- C-side original remains retained as rollback/evidence storage
- compute/helper runtime cutover: PENDING — current compute endpoint / connection settings remain authoritative until a separate cutover PASS
- staged future helper location: `J:\dev\katachi-compute-helper-tray` (staged only; not current runtime authority)

## Current phase
First Physical Gate and SKIN Production UI IA v0A are PASS / CLOSED. FIELD vNext Interaction Correctness v0 is also PASS / CLOSED after C SOL review at `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`.

The accepted FIELD interaction fix centralizes FIELD/BEADS/MESH visibility policy, prevents stale vNext fullscreen visibility outside FIELD, uses the existing beads presentation as a temporary camera-interaction proxy, and restores exact vNext after interaction. FIELD semantic shader/math and Production generation/support/export semantics were not changed.

Additional post-print handling evidence identifies a localized Permanent Structure durability weakness: an appendage/subgraph supported by a single connection to the main artwork detached during casual handling. The detached subgraph remained substantially coherent while the root connection failed. A mirrored/opposite-side analogue is suspected to share the same weakness but remains intact for comparison.

Author observation also narrows the physical generalization claim: the successful First Physical Print had a predominantly vertical / linear overall shape, which likely reduced sustained overhang demand and lateral cantilever loading. Treat the closed First Physical Gate as shape-conditioned evidence for this near-vertical regime, not as proof that the same locked Production parameters will succeed on strongly overhanging hosts. Usagi therefore represents a materially different overhang/load regime and must be validated as such.

C development workspace migration to J is PASS. Runtime bootstrap on J is also PASS: dependencies were rebuilt from the lockfile, FIELD focused tests and build passed, the C route launched from the J worktree, and FIELD vNext -> BEADS -> FIELD vNext browser switching was verified. Future C work must start from `J:\dev\worktrees\skin-field-vnext-interaction-v0`; the retained C-side worktree is rollback/evidence only.

Shared user-managed input data `samples` has also moved to `J:\dev\samples`. On the next C activation, any C task, launcher, script, or local setting that still assumes `C:\dev\samples` must be switched to the J path as part of that lane touch. Do not interrupt the current STOP state only for this path migration. The samples contents are user-managed input data and must not be committed, renamed, reorganized, or deleted by Team C without explicit user instruction.

Future C-specific runtime / local development environment maintenance is Team C ownership. Storage migration topology and deletion/cleanup of retained C-side originals remain Overall / Organization ownership.

The separate katachi compute/helper runtime has NOT yet cut over to J. `J:\dev\katachi-compute-helper-tray` is staged, but while AB performance work is active the live compute/helper runtime remains on the existing configuration. Team C must not change compute endpoint / connection settings before an explicit compute cutover PASS. After that PASS, Team C owns the J-side C connection check, helper health check, and any C-specific runtime settings verification.

For 2026-09-07, C work is STOPPED after closing the authorized FIELD vNext interaction task. Do not auto-start the queued durability audit or any other C implementation task today unless the author explicitly reopens C work.

## Active implementation instruction
- NONE for 2026-09-07.
- C is STOPPED for the day by author instruction.

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
- FIELD vNext Interaction Correctness v0 PASS / CLOSED at `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453` on 2026-09-07
- C J workspace cutover PASS — `J:\dev\worktrees\skin-field-vnext-interaction-v0` at accepted HEAD, clean, with no C-linked Git metadata
- J-side FIELD focused smoke test: 8/8 PASS
- C J runtime bootstrap PASS — Node `v24.15.0`, npm `11.12.1`, `npm ci` PASS, FIELD focused tests 8/8, build PASS, `http://127.0.0.1:5186/skin-rebuild.html` HTTP 200, browser C/FIELD switching smoke PASS

## FIELD vNext interaction review
- reviewed branch: `agent/skin-field-vnext-interaction-v0`
- accepted checkpoint: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- parent: `c64cf091b1c66294ca885759e5a5a9069eb398af`
- branch is exactly one commit ahead of the accepted base
- changed scope: `src/studies/skin/renderer.ts`, `src/studies/skin/fieldPreviewPresentation.ts`, focused test, and test registration only
- no FIELD semantic shader/math change
- no Production BODY / Graph / Support / Export implementation file change
- visibility authority: centralized through `fieldPreviewPresentationVisibility()` / `applyLayerVisibility()`
- camera interaction: vNext exact fullscreen preview hidden during active interaction when bead proxy exists; exact vNext restored on interaction end
- backend preference remains session-only and is not rewritten to Legacy by the interaction proxy
- worker-reported focused tests / typecheck / build / browser switching / Production parity: PASS
- GitHub commit has no attached status checks; test execution result is worker-reported, while source/diff scope was reviewed directly by C SOL
- merge/deploy: not performed by this review; accepted branch checkpoint is preserved remotely

## Current blocker / follow-up
- No Production geometry / support / export blocker for the proven near-vertical First Print regime.
- FIELD vNext interaction blocker is CLOSED at `dad764ce...`.
- J-side C runtime bootstrap blocker is CLOSED; normal C runtime no longer requires the old C-side path.
- compute/helper runtime cutover remains PENDING; existing compute endpoint / connection settings must not be changed before explicit cutover PASS.
- Permanent Structure durability: `FAIL / LOCALIZED` for at least one single-attachment appendage under casual handling. Global BODY collapse was not observed.
- Strong-overhang / cantilever generalization is UNVERIFIED; the First Physical Print must not be used as evidence that Usagi-like geometry will behave equivalently.
- Existing Workflow Guide-derived console `NotFoundError` was observed during the FIELD task. It predates / lies outside the accepted FIELD interaction scope and is a non-blocking follow-up; do not fix it implicitly today.
- External STL Host + FKEI persistence remain separate-architecture HOLD.
- SKIN-support-alone full printability remains UNVERIFIED; accepted First Physical Gate included limited manual supplemental support.
- First Physical Print 3MF Google Drive cloud visibility remains UNVERIFIED; local synced-drive copy/hash verification is PASS.

## Next gate
1. STOP C work for 2026-09-07.
2. Wait for an explicit compute/helper cutover PASS before touching compute endpoint / connection settings; after PASS, Team C verifies J-side C connection, helper health, and C-specific runtime settings.
3. On the next explicit C activation, use `J:\dev\samples` for shared user-managed samples and correct any C-local `C:\dev\samples` assumptions encountered in the touched task/launcher/script/local settings.
4. `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md` remains QUEUED for a later explicit C SOL start; it does not auto-start today.
5. A later durability audit may determine whether a separate bounded Permanent Structure reinforcement task is justified by bridge/articulation evidence.
6. Usagi + V6 parameter-locked validation remains eligible, but when scoped it must explicitly test a strong-overhang regime: support demand, cantilever/lateral load exposure, and single-attachment weakness are new validation dimensions rather than assuming the First Print result generalizes.
7. Workflow Guide console `NotFoundError` may be scoped separately later if it materially affects author workflow.

## HOLD / DO NOT CHANGE
- Motif-conditioned default seed
- Local Relay Permanent Network
- bounded Graph-only first repair
- Permanent BODY / member sizing / BODY field unless a separate post-audit reinforcement task is explicitly approved
- current Stage8 Removable Support semantics and `current-stage8:sparseResult.graph`
- source-to-mm / Output Scale contract
- FIELD vNext display-only / session-only semantics
- FIELD vNext semantic shader/math and sequential primitive semantics
- legacy v088 compatibility semantics
- External STL Host / triangle-mesh Host architecture
- Co-evolution; Graph-conditioned default; D / F1 / F2 / F3 / C+D Hybrid
- new C research unless separately scoped
- bulk merge of historical feature branches
- do not resume C work from the retained C-side worktree
- do not delete or clean retained C-side migration originals from Team C; that remains Overall / Organization scope
- do not change current compute endpoint / connection settings before explicit compute/helper cutover PASS
- `J:\dev\katachi-compute-helper-tray` is staged-only until cutover; do not treat it as the live helper runtime yet
- do not treat `C:\dev\samples` as authority for future C work
- do not commit, rename, reorganize, or delete user-managed `J:\dev\samples` contents without explicit user instruction

## Relevant artifacts
- UI IA v0A implementation: `22ef22bcc327e048ed994c8fa8c3964ad20b324c`
- UI IA v0A parity evidence: `c64cf091b1c66294ca885759e5a5a9069eb398af`
- parity report: `docs/evidence/skin-production-ui-ia-v0-fix2/PARITY_REPORT.md`
- FIELD vNext interaction task: `docs/tasks/C_FIELD_VNEXT_INTERACTION_CORRECTNESS_V0.md`
- FIELD vNext interaction accepted checkpoint: `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- queued durability audit: `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`
- shared post-print observation note: `docs/evidence/SKIN_FIRST_PHYSICAL_PRINT_AUTHOR_OBSERVATIONS_2026-09-06.md`
- First Physical Print author-edited Bambu 3MF local archive: `J:\My Drive\ChatGPT\SKIN\_C\Physical Evidence\2026-09-06_First_Physical_Print\3MF\SKIN-C-production-v0-support-fixed.3mf`
- archived 3MF size: `2,066,585 bytes`
- archived 3MF SHA-256: `a68f04638751c4cb91e905267d47eeb1593d7b776c287919a4d59ea69a41c41b`
- preferred J-side workspace: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- retained C-side workspace: `C:\dev\worktrees\skin-field-vnext-interaction-v0`
- shared user-managed samples: `J:\dev\samples`
- staged future compute/helper location: `J:\dev\katachi-compute-helper-tray`

## Evidence boundary
### Proven / supported
- locked Production architecture and current Stage8 Support/export semantics remain authoritative.
- First Physical Gate and UI IA v0A are closed.
- FIELD vNext capability is retained and can render the current dense state.
- FIELD/BEADS/etc fullscreen visibility now has a single reviewed presentation policy at `dad764ce...`; backend/payload refresh no longer directly forces fullscreen visibility.
- active camera interaction can temporarily show the existing bead proxy while exact vNext is hidden, and interaction end restores exact vNext.
- the accepted FIELD interaction diff does not modify the semantic vNext shader or Production BODY/Graph/Support/Export implementation paths.
- one physically printed terminal appendage/subgraph failed at its single attachment during casual handling while the larger artwork remained coherent.
- the detached subgraph itself remained substantially intact, supporting a localized root-connection weakness rather than a global print-collapse interpretation.
- the successful First Physical Print proves print/support-removal viability only for the observed predominantly vertical / linear shape regime with limited manual supplemental slicer support.
- J-side C worktree is reconstructed from remote authority at the accepted FIELD checkpoint, clean, and independent of C-side Git metadata.
- J-side FIELD focused smoke tests passed 8/8.
- J-side dependency bootstrap, build, dev launch, HTTP route, and browser FIELD/BEADS/FIELD smoke all passed; normal C runtime did not require the old C-side path.
- shared user-managed samples authority for future C work is `J:\dev\samples`.

### Not yet proven
- compute/helper runtime cutover from the current live setup to `J:\dev\katachi-compute-helper-tray`
- J-side C connection / helper health / C-specific runtime settings after compute cutover
- whether every single-edge/bridge-only graph appendage is physically weak
- whether the mirrored/opposite-side analogue will fail under the same handling
- which exact Permanent Graph bridge/articulation candidate corresponds to the observed broken piece
- SKIN-support-alone full printability without supplemental slicer support
- strong-overhang / cantilever physical generalization of the locked Production parameters
- Usagi + V6 parameter-locked validation in the overhang regime
- generic External STL Host on current C architecture
- P0-B authoring-resource retention where not yet checked
