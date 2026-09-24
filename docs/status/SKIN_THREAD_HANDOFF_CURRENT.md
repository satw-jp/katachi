# SKIN Thread Handoff — CURRENT

Last verified: 2026-09-24 JST  
Repo: `satw-jp/katachi`  
Main checkpoint at publication: `6b81945c1041827469e5ac9631072e87c248c62c`

## New-chat one line

`satw-jp/katachi の docs/status/SKIN_THREAD_HANDOFF_CURRENT.md を最優先で読み、リンク先のCURRENT / Issue実物を確認して、この状態から再開してください。`

## Authority / operating rule

- GitHub CURRENT / active Issue / Drive artifact beats chat memory.
- Global mandatory SOL-advisor routing was removed at `70a4a7fbc9cdd5cdcaf5f8c9b05439a13f8e640b`. Use Author / declared decision owner / bounded worker.
- Keep technical PASS, fabrication review, Print GO, Physical PASS and Author ACCEPT separate.
- Do not infer printer/send/physical completion from package or GUI readiness.

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

### Required order

**First:** Issue #30  
https://github.com/satw-jp/katachi/issues/30

`[LUNA] FUKEI Slice Runner — Clean-Mesh Input Route v1`

One-line worker handoff:

`satw-jp/katachi Issue #30 をtask authorityとして読み、記載scope内で実装・テストし、STOP条件まで実行してください。`

Required terminal gate:

`FUKEI RUNNER CLEAN-MESH INPUT ROUTE PASS`

**Then only after #30 PASS:** Issue #31  
https://github.com/satw-jp/katachi/issues/31

`[LUNA] Large A1 — 3-Flower Clean-Mesh Resolution Comparison`

One-line Large worker handoff:

`satw-jp/katachi Issue #31 をtask authorityとして読み、Issue #30のPASSを確認後、記載scope内で実行し、STOP条件まで進めてください。`

Comparison remains:

- F1886 inclined
- F3147 up
- F3457 down
- 3 flowers / 18 petals
- resolution 0.012 -> 0.02 -> 0.03
- only resolution may differ
- no full Large slice until Author selects a resolution

Expected stop:

`LARGE RESOLUTION COMPARISON READY FOR AUTHOR REVIEW`

Router:

`docs/tasks/FUKEI_RUNNER_CLEAN_MESH_LARGE_RESOLUTION_ROUTER.md`

## 3. FUKEI automation / repetition-reduction lanes

### Issue #29 — Repro Packager v0

https://github.com/satw-jp/katachi/issues/29

Purpose: deterministic reference / identity / short handoff for already selected artifacts.  
No Runner change, no geometry change, no slice, no Print GO judgment.

### Issue #32 — Process Condition Resolver v0

https://github.com/satw-jp/katachi/issues/32

**Status in Issue: READY FOR LUNA / IMPLEMENTATION NOT STARTED.**

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

One-line worker handoff:

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

- To print MINIB: use the corrected package above; verify current AMS mapping + Auto Refill, then Author controls Send/Print/Start.
- To continue Large: run Issue #30 first; #31 is blocked until #30 PASS.
- To reduce repeated AI condition auditing: run Issue #32 independently.
- To reduce repeated artifact identity/handoff work: run Issue #29 independently.

Do not merge these lanes merely because they are all FUKEI/SKIN-related.
