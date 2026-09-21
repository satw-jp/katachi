# SKIN_ABC Current Status

Last verified: 2026-09-21 (physical-first routing + Author-authorized R5 reviewable-sliced-3MF Phase A validation; no Runner code change)

## Authority
- repo: `satw-jp/katachi`
- branch: `main`
- main checkpoint before this correction: `33e39167f8331fc55459e2e95a686b250d5d0291`
- author-facing SKIN consultation authority: `SKIN_ABC_SOL`
- retained AB technical/evidence authority: `docs/status/AB_CURRENT.md` plus its accepted checkpoints
- retained C technical/evidence authority: `docs/status/C_CURRENT.md` plus its accepted checkpoints
- active Astra Research current: `docs/status/ASTRA_CURRENT.md`
- **Large R4 fabrication exception:** [R4_A1_FAB_CURRENT](R4_A1_FAB_CURRENT.md) on main is a router to the exact PR #17 lane checkpoint. Do not resume from the superseded main D22.1 RUNNING description. Do not promote the entire PR branch to overall authority.
- active R5 execution-infrastructure current: [R5_SLICE_RUNNER_CURRENT](R5_SLICE_RUNNER_CURRENT.md)
- active A1 mini PETG+PLA physical current: [A1MINI_AMSLITE_PHYSICAL_CURRENT](A1MINI_AMSLITE_PHYSICAL_CURRENT.md)
- Astra Reader current: `docs/status/SKIN_R_CURRENT.md`

`SKIN_ABC_SOL` is the single author-facing consultation front for current SKIN priorities and future Research -> Production handoff decisions. It does not replace the accepted AB/C evidence or make their code one architecture.

## Current phase
- AB Performance v2 is `PASS / ACCEPT / CLOSED` at `87d5225a18dc7a1b8895cc44351db4c000be6261`.
- C View Representation Continuity v0 is `PASS / CLOSED` at `59ebb3cfb781442a1583509d5e8b5ea40120ff94`.
- Team AB, Team C and `SKIN_ABC_SOL` have no active implementation task.
- **Top artwork purpose:** R4 MOCOMOCO / LOEWE Craft Prize 2027 artwork completion. Software closure, reproducibility and architecture are means, not the completion target.
- **Large R4:** Plus4 native/integrity/profile PASS and own1,058-layer audit COMPLETE are retained; Author reported experiment start2026-09-20 23:35 JST. Physical result pending / live printer state UNVERIFIED. Additional10/38 parts are locally frozen but unsliced; Additional7 remains unmodified. See the R4 router for the exact branch CURRENT/task.
- **A1 mini PETG+PLA:** separate bounded physical lane. PHYSICAL_01 actual-sent payload binding COMPLETE, intentional early stop, quality LOW, no physical PASS. PHYSICAL_02 is READY FOR AUTHOR EXECUTION / result pending, using the same locked V1-derived payload with PETG drying as the only planned changed factor.
- **PLA mini / F2 comparison:** separate physical observations; exact recent F2 job machine/scale/payload/overrides are not canonically bound by this update. Do not label the A1-100% F2 package as the direct latest revision of the old mini candidate.
- **R5 Slice Runner:** A1 single and A1 mini two-material execution routes PASS. `REPRO_AUDIT_01` classification C — minor toolpath nondeterminism / fabrication semantics equivalent for compared runs. The Author has now authorized `R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0` Phase A: validate the existing Runner-produced native sliced 3MF as the final Bambu Studio review surface. Runner code remains frozen unless an actual reviewability gap is observed.

## Physical-first operating direction

The Author's September21 snapshot and documentation-correction request establish:

`concern -> bounded physical check -> repair only an observed problem within explicit scope`.

Use available low-cost physical evidence before escalating software closure. Preserve known risk evidence; do not convert mini survival into Large R4 physical PASS. A software flag is an observation target, not automatic authorization to repair another location. Keep native technical PASS, fabrication PASS, physical PASS, Author ACCEPT, Print GO and Production separate.

No Additional10 combined slice, Additional7 repair, Runner modification, new Artwork geometry, Production-wide architecture or A1-to-mini automation is active before the relevant physical review. Do not rerun completed native/full audits or bulk hashes merely to resume. A later changed-input review is bounded by the observed risk and explicit next task.

## Lane and physical identity boundaries

| Lane | Retained identity / condition distinction |
|---|---|
| Large R4 Plus4 | A1 master100%; PLA240°C;15% grid;raft0. Exact input/output locks and current branch are in the R4 router. |
| Old PLA mini | Author snapshot: source `R4_A1_MINI_INFILL100_220C_EDITABLE` stores220°C, but actual print was manually overridden to240°C. Do not call it a220°C physical result. Exact run binding beyond this Author statement is not created here. |
| F2 package | A1 Large100% package with lower Support updates; saved100% aligned rectilinear/raft2/240°C. Separate from the old mini candidate and Large R4 Plus4 locked profile. Recent physical job identity remains unverified. |
| Mini AMS | PHYSICAL_01/02 use locked V1 payload;38 material changes excluding initial selection. Runner smoke V0's46 events belong to a different payload, not a contradiction or a Runner-failure diagnosis. |

Each physical run must point unambiguously to its payload and actual conditions. The same G-code may legitimately be reused for several runs. Record source3MF settings, sent G-code, printer-side overrides and actual observations separately. Unknown values stay UNKNOWN; do not fill them from package names, elapsed time or a different run. Capture actual plate and overrides with the physical record rather than deferring them behind software closure.

A1-100% remains the Artwork master. Future mini preparation belongs before Runner: `A1 master -> MINI PREP -> mini editable3MF -> Runner`. Historical whole-model73.33333333333333% scaling is an experimental derivation, not automatically a validated F2 Support-thickness policy. No MINI PREP implementation is active.

## Current purpose
Observe Research / Astra, SKIN_R, physical prints, and author review, then decide selectively what is worth preserving as reproducible SKIN capability.

Do not treat completion of old AB/C methods as the goal. Preserve what was actually proven, under the conditions where it was proven, and translate only what remains useful after artwork and physical review.

The retained [2026-09-18 Author direction](../observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md) remains protected-scope authority for Large R4, subject to its later explicitly recorded bounded permissions and current physical-first ordering. General print-ready release HOLD is distinct from the specific Author-started Plus4 experiment. The mini dry-only test has its own gate in `A1MINI_AMSLITE_PHYSICAL_CURRENT.md`. Neither lane authorizes Production or generalization.

Reusable procedures and constraints have a separate Playbook home: [A1 CLI Runbook](../fabrication/A1_BAMBU_CLI_RUNBOOK.md), [Toolpath Audit Rules](../fabrication/TOOLPATH_AUDIT_RULES.md), [Fabrication Principles](../fabrication/FABRICATION_PRINCIPLES.md). Documentation of a required check is not proof that it is implemented or validated. A future `skin fab slice` executor remains proposed; it is not the Drive-staged Runner automatically promoted into repo source.

## Retained AB capability
Accepted AB evidence includes:
- Performance v2 exact capped Candidate BODY signed-distance execution for the bounded non-terminal keep-out use case;
- packed triangle BVH geometry queries;
- exact closest-surface distance and ray-parity sign authority;
- finite-cap execution with existing near-surface behavior preserved;
- fail-closed one-Lipschitz collision certification;
- deterministic query telemetry / bounded profiling;
- fingerprint / parity / validator / durable retention evidence.

AB Support placement itself is **not** the future SKIN standard by default. Any reuse must be justified by semantic correspondence and measured value in the future SKIN context.

## Retained C capability
Accepted C evidence includes:
- Production capability baseline;
- Permanent BODY / Permanent Graph authority separated from Removable Support;
- 3MF / Export capability;
- accepted author-facing representation continuum `BEADS · Fast -> MESH · Surface -> FIELD · Exact`;
- MESH caching / progressive preview behavior and corrected FIELD offscreen interaction framing;
- first physical-print evidence for the accepted near-vertical regime.

C unresolved evidence remains preserved rather than silently solved. In particular, the localized single-attachment durability failure remains physical evidence. Do not reinforce the old C Permanent Structure now merely to complete that architecture; reevaluate whether the issue is still relevant during future Research -> SKIN Structure translation.

## Research handoff direction
Research results do not automatically become Production.

Keep these completion levels separate:

1. `R reproducible` — Research source, generator/code, parameters, fabrication changes, Support, slicer/toolpath conditions, manual intervention, artifacts, and physical correspondence can be retraced.
2. `SKIN reproducible` — SKIN can reproduce the selected result through generation -> save -> reopen -> fabrication output.
3. `Generalizable` — the principle is shown to transfer beyond the selected SHAPE / MOTIF / candidate.

First secure Research reproducibility without making architecture closure a prerequisite for observing an already-authorized physical test. After Author review, choose the first candidate and the bounded scope worth making SKIN-reproducible. Generalization comes later.

The artwork/fabrication operating boundary remains:

`Artwork D0 -> Author Gate / Freeze -> Fabrication Analysis -> Fabrication D1 -> Authored Support D2 -> Toolpath -> Physical Record -> Selective Production Translation`

## Author / Technical gate separation
Technical evidence and Author evidence are separate gates.

- Technical `PASS` does not imply Author artistic `ACCEPT`.
- Author `ACCEPT` does not imply Production generalization.
- `SHAPE` and `MOTIF` are currently the primary artwork subjects.
- `STRUCTURE` is secondary in the artwork, but remains high-priority for AI / Research because it must support SHAPE / MOTIF, fabrication, strength, Void, depth, and visibility without unnecessarily becoming the visual subject.

Physical works and final value judgments remain Author gates.

## Active implementation instruction
**NONE for SKIN_ABC.**

Do not create or start a SKIN_ABC implementation task merely because Astra Research or a physical test is active. R4 uses its explicit branch exception; R5 and mini AMS use main. Do not reinterpret low-quality PHYSICAL_01 as Runner failure or use dry-only testing to reopen Large R4 geometry.

For any later authorized slice, use [R5's existing operation contract](R5_SLICE_RUNNER_CURRENT.md): Astra prepares a frozen job and STOPs; Author selects/starts it in Runner; Runner executes/records; Author reports job_id/run folder; Astra resumes from the actual result. Folder placement alone does not trigger the present GUI, and no permanent duplicate-job guarantee is asserted.

## Blocker
No Production implementation blocker is opened. Current missing decision evidence is the separate physical results and, for the PLA/F2 comparison, exact run binding. The prior main-only R4 misrouting is corrected through `R4_A1_FAB_CURRENT.md`; PR #16/#17 remain unmerged and integration is separate from physical review.

## Next gate
1. **Large R4 Plus4 physical review:** receive the result, record actual conditions and assess removal/finishing/artwork usability or an observed bounded repair need. Do not automatically consume Additional10 or reopen Additional7.
2. **PHYSICAL_02 DRY-ONLY AUTHOR PHYSICAL REVIEW:** preserve the locked V1 payload, drying-only change, actual stop/deviation and defined photos. No new slice or tuning. This remains an independent mini AMS lane.
3. **PLA mini/F2 observation:** bind the actual jobs and compare lower shafts, bed-side FLOWER, early braces, sag/stringing/surface/removal. Without matched conditions, report observed differences rather than single-factor causality.
4. **R5 reviewable sliced-3MF Phase A:** open the existing Runner-produced native sliced 3MF in Bambu Studio and verify Preview/material/layer/warning/AMS-mapping review without intentional reslice. Do not send in Phase A. Runner code stays frozen unless an observed gap justifies a separately reviewed implementation.
5. After physical review and the bounded R5 check, decide selectively whether a proven procedure merits finishing or later SKIN reproducibility. Generalization remains later.

## HOLD / do not pre-decide
- new final SKIN architecture;
- common kernel creation;
- AB/C code integration or source movement;
- Support-method unification;
- AB Support placement as the future standard;
- C Permanent Structure reinforcement as legacy completion work;
- full-function UI expansion;
- Production-wide rewrite;
- automatic Research -> Production translation;
- generalization before the first selected candidate is reproduced and reviewed;
- treating the current R4 GN study or fabrication Playbook itself as Production architecture;
- Additional10 combined slice, Additional7 repair, automated A1-to-mini conversion, or Runner code expansion without an observed Phase A gap and explicit next scope. The review-only R5 Phase A validation is authorized.

## Required pointers
- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/ASTRA_CURRENT.md`
- `docs/status/R4_A1_FAB_CURRENT.md` — main router to exact PR #17 lane checkpoint
- `docs/status/R5_SLICE_RUNNER_CURRENT.md`
- `docs/status/A1MINI_AMSLITE_PHYSICAL_CURRENT.md`
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/SKIN_R_CURRENT.md`
- `docs/notes/AB_PERFORMANCE_V2_SKIN_ABC_HANDOFF_2026-09-08.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_ARTWORK_FABRICATION_TOOLPATH_ARCHITECTURE_2026-09-08.md`
- `docs/observations/AUTHOR_OBSERVATION_R4_LARGE_MOCOMOCO_GN_2026-09-13.md`
- `docs/observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md`
- `docs/fabrication/FABRICATION_PRINCIPLES.md`

Old AB/C CURRENT files remain retained authority and must not be deleted or overwritten as part of the SKIN_ABC transition. This correction changes documentation only; no physical result, code deployment, geometry, slicer execution, printing or branch integration is implied.
