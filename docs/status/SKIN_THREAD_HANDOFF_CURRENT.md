# SKIN Thread Handoff — CURRENT

Scoped audit/routing update: 2026-09-25 JST — Issue #35 only; not a fresh verification of every lane.  
Retained lane observations last verified: 2026-09-24 JST  
Repo: `satw-jp/katachi`  
Original main checkpoint at publication: `6b81945c1041827469e5ac9631072e87c248c62c`

## New-chat one line

`satw-jp/katachi の docs/status/SKIN_THREAD_HANDOFF_CURRENT.md を最優先で読み、リンク先のCURRENT / Issue実物を確認して、この状態から再開してください。`

## Authority / operating rule

- GitHub CURRENT / active Issue / Drive artifact beats chat memory.
- Global mandatory SOL-advisor routing was removed at `70a4a7fbc9cdd5cdcaf5f8c9b05439a13f8e640b`. Use Author / declared decision owner / bounded worker.
- Keep technical PASS, fabrication review, Print GO, Physical PASS and Author ACCEPT separate.
- Do not infer printer/send/physical completion from package or GUI readiness.

## 0. Current Large / reusable-tool routing — 2026-09-25 audit

**Issue #35 is the authorized continuation, not a new approval request.**

- [#34 Author decision](https://github.com/satw-jp/katachi/issues/34#issuecomment-5816871930) resolved the 3.0/2.2 mm choice: Large requires 2.2 mm. Do not ask again or fall back to printing 3.0 mm first.
- [#35](https://github.com/satw-jp/katachi/issues/35) retains the Large A-derived candidate, 4,241 target members, preservation/contact requirements and geometry-stage-only boundary.
- [SKIN Structure Resize v0 addendum](https://github.com/satw-jp/katachi/issues/35#issuecomment-5817299145) takes precedence for implementation method, deliverables and acceptance: fixed original source + saved recipe + one core, called by Author UI and LUNA CLI, produces real resized mesh, contact differences, comparison and replay. A one-off 2.2 mm file is insufficient.
- [Overall audit alignment](https://github.com/satw-jp/katachi/issues/35#issuecomment-5818833654) records cross-task boundaries and acceptance-evidence coverage. It adds no worker, approval gate or implementation task.

Existing Large LUNA continues from its preserved branch/HEAD/output/checkpoint. The same Fabrication Astra reviews the tool's reusability and Large geometry/contact, then controls any later route/slice handoff. Author retains Preview, Print GO and Send. Do not stop active work, rerun candidate discovery, or require another SOL/advisor/model session.

### Scope and dependencies

- #35 operates on **branch diameter in mm with fixed centerlines and flower placement**. Its Large preset range 2.2–3.0 mm is a software applicability range, not a physical safety range. The 3.0 mm restoration test does not reopen the rejected 3.0 mm print choice.
- #33 changes Host/flower scale and recomputes surface placement. It is separate; its completion/merge is not a #35 prerequisite. No automatic connection of #33 anchors to #35 branches is asserted.
- #26/#27 contain earlier authoring/composition work; reuse compatible parts without requiring full integration or replacing the actual Large structure with a demo graph.
- #29/#32 remain optional cross-cutting identity/condition tools, not mandatory new dependencies or duplicate implementation work.
- #30/Runner remain input-validation and EXECUTE/RECORD infrastructure. #34 records #31 completed with resolution **0.02 ACCEPT**; do not repeat the three-flower comparison. New candidate geometry/contact and later toolpath gates are not implied by that acceptance.
- Keep the rejected reduced-project 3MF route rejected. Any #34 full-source serialization reuse must preserve truthful provenance and cannot bypass Runner validation. No new slice or Runner change is authorized by #35's current stage.

### Acceptance evidence and current observation

Apply the addendum's existing tests, not a new reauthorization: actual Large 4,241-member 2.2 mm output through the same core; representative real-source 2.2/2.4 and non-cumulative 2.2→2.4→2.2→original restoration; UI/CLI normalized recipe and geometry identity; save/fresh-process replay with cold-vs-cache evidence; actual GUI evidence distinguished from controller tests; contact/patch/stale-state handling; bounded errors/cancel and measured rerun interventions.

A synced `tools/skin_structure_resize` folder with core, adapter, CLI, controller, UI, launcher and project entries was observed during this audit. File presence is not a completion or acceptance claim. This audit did not execute that code or verify a complete #35 run/replay/UI/contact evidence package; unobserved local work is not declared absent.

Report separately: `tool_core`, `recipe_replay`, `author_ui`, `large_2p2_geometry`, `contact_review`, `input_preparation`. These have no new acceptance verdict from this audit. Current-stage contract remains `slice=NOT_RUN`, `print_go=false`; no other-Host support, physical result, remote publication or main code integration is inferred.

Unresolved contacts may keep fabrication handoff HOLD while generated geometry/differences remain saveable and inspectable. Do not turn that into a new approval wait for every permitted diameter operation. The 2.2-only four-contact patch set is guarded by source/ID/diameter/local-geometry applicability and is not copied automatically to 2.4 mm.

**Existing STOP: `LARGE_A1_2P2_GEOMETRY_READY_FOR_ASTRA_REVIEW`.** It is not all-contact PASS, tool completion, Author ACCEPT or Print GO.

This section supersedes conflicting Large start/wait instructions in the retained historical sections below. Historical Issue-body NOT STARTED labels and old one-line handoffs are not permission to restart completed tasks. Physical-lane observations below retain their own dates and are not reverified by this scoped update.

## 1. MINIB R2 — current print state

**State: FABRICATION PRINT GO / actual Send-Print-Start not reported / Physical PASS pending.**

Corrected send-mapping package:

`J:/My Drive/codex/2026-09-23/minib-bounded-repack-prepare-only-minib/outputs/MINIB_R2_GCODE_PACKAGE_SEND_MAPPING_R1/plate_1.gcode.3mf`

Package SHA256:

`003AC25FCB9F8206F153C8EEF55A51E7FC9ADB0E5BF89F0CB5BFE583D7D8074A`

Protected embedded G-code:

- bytes: `616,230,367`
- SHA256: `AA693809FCF7F2E14071B50250FEDDB7068E625508AF93FF2E1C5D3282E4D11C`
- layers: `685`
- printer: A1 mini
- T0 = Generic PETG
- T1 = Generic PLA

Repair changed only:

- `Metadata/model_settings.config`
- `Metadata/slice_info.config`

Author GUI verification passed:

- Preview opens without re-slice
- A1 mini
- 685 layers
- PETG + PLA toolpaths
- Prime Tower visible
- Send screen shows 2 mapping rows
- current observed mapping: PETG -> A2 / PLA -> A3
- usage shown: 941.31 g
- Send button enabled

**Physical AMS slots are send-time choices; do not hard-code A2/A3 as permanent package truth.**

Before actual send, Author should verify current physical spool/material mapping and desired Auto Refill state. No later send or physical result is recorded by this handoff.

## 2. Large A1 — old reduced-3MF route rejected

The repeatedly repaired 3-flower Bambu project route is no longer the path forward.

Observed boundary:

- project/profile can open while plate is visually empty
- parser-only `--info Success` did not prove printable object recognition
- prior baseline attempts reached `-6` parse rejection and later `-50` empty-plate rejection
- Author GUI also showed the latest reduced fixture as an empty plate

Do not continue Bambu project-3MF component/XML/plate-binding surgery for this diagnostic fixture.

### Historical setup order — superseded as an execution instruction by section 0

The following preserves the original #30→#31 setup record. #34 now records resolution 0.02 ACCEPT; these old handoffs do not restart either task.

**First:** Issue #30  
https://github.com/satw-jp/katachi/issues/30

`[LUNA] FUKEI Slice Runner — Clean-Mesh Input Route v1`

Original one-line worker handoff (historical):

`satw-jp/katachi Issue #30 をtask authorityとして読み、記載scope内で実装・テストし、STOP条件まで実行してください。`

Required terminal gate:

`FUKEI RUNNER CLEAN-MESH INPUT ROUTE PASS`

**Then only after #30 PASS:** Issue #31  
https://github.com/satw-jp/katachi/issues/31

`[LUNA] Large A1 — 3-Flower Clean-Mesh Resolution Comparison`

Original one-line Large worker handoff (historical):

`satw-jp/katachi Issue #31 をtask authorityとして読み、Issue #30のPASSを確認後、記載scope内で実行し、STOP条件まで進めてください。`

Original comparison scope:

- F1886 inclined
- F3147 up
- F3457 down
- 3 flowers / 18 petals
- resolution 0.012 -> 0.02 -> 0.03
- only resolution may differ
- no full Large slice until Author selects a resolution

Expected stop in that original task:

`LARGE RESOLUTION COMPARISON READY FOR AUTHOR REVIEW`

Router:

`docs/tasks/FUKEI_RUNNER_CLEAN_MESH_LARGE_RESOLUTION_ROUTER.md`

## 3. FUKEI automation / repetition-reduction lanes

These are separate cross-cutting tools. Read each Issue's latest review/closure record before use; the historical start text below does not authorize reimplementation and neither tool is a #35 prerequisite.

### Issue #29 — Repro Packager v0

https://github.com/satw-jp/katachi/issues/29

Purpose: deterministic reference / identity / short handoff for already selected artifacts.  
No Runner change, no geometry change, no slice, no Print GO judgment.

### Issue #32 — Process Condition Resolver v0

https://github.com/satw-jp/katachi/issues/32

**Historical Issue-body status at the original handoff: READY FOR LUNA / IMPLEMENTATION NOT STARTED. Not the current acceptance state; consult the Issue's later review records.**

Purpose: bind process evidence without collapsing meanings:

- CONFIGURED
- PROFILE_OVERRIDE
- DERIVED_FROM_CONFIG_PRECEDENCE
- RESOLVED_SETTING
- GCODE_COMMANDED
- MANUAL_OVERRIDE_REPORTED
- TELEMETRY_OBSERVED
- UNKNOWN / NOT_SCANNED

Representative 3 acceptance cases are fixed in the Issue.

Scope excludes:

- Runner modification
- R4 geometry change
- slice
- printer send / print
- current-authority selection
- Print GO / Physical PASS judgment

Original one-line worker handoff (historical, not a restart order):

`satw-jp/katachi Issue #32 をtask authorityとして読み、記載scope内で実装・実ケース3件の受入試験まで行い、STOP条件で止めてください。`

## 4. Other retained physical lane facts

### MINIA PLA

Package path retained:

`J:/My Drive/codex/2026-09-23/files-pasted-by-the-user-fukei/outputs/R4_MINIA_TERMINAL_REVIEW_20260922/package_only/plate_1.gcode.3mf`

Embedded/standalone G-code SHA256:

`B90C9037BF38A63AC852D77E7326C5CC99B605F0091CCA19B1B68BA7DD561AD9`

A previous send was reported, but this handoff contains **no bound physical result**. Do not infer Physical PASS.

### 07_Lab organization

`J:/My Drive/07_Lab` was cleaned up for recent SKIN physical evidence.  
Index:

`J:/My Drive/07_Lab/PRINT_EVIDENCE_INDEX_20260923.md`

Recent folders were renamed to expose candidate/run identity; shortcuts/source pointers were added where identity was known. Unknown bindings were deliberately left `UNBOUND` instead of guessed.

## 5. Immediate resume choices

- For MINIB: retain the dated package observations above, check the lane's latest report and current AMS mapping/Auto Refill; Author alone controls Send/Print/Start. This scoped audit does not report a new physical result or give a new send order.
- To continue Large: existing Large LUNA follows Issue #35 plus its Structure Resize addendum from the current preserved checkpoint. The 2.2 mm decision is already fixed; do not restart #34's choice gate, #30 setup or #31 comparison. No slice in the current geometry stage.
- For surface-size Replay: keep Issue #33 in its own scope; it neither blocks nor supplies a proven new structure to #35.
- For repeated condition or identity work: use #32/#29 according to their latest accepted scope and actual available implementation. Do not reimplement or make them compulsory for #35.

Do not merge these lanes merely because they are all FUKEI/SKIN-related.
