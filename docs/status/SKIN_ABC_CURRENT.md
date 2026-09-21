# SKIN_ABC Current Status

Last verified: 2026-09-21 (overall routing; retained AB/C and D22.1 evidence preserved)

## Authority
- repo: `satw-jp/katachi`
- branch: `main`
- main checkpoint before this overall update: `7294f995b83883f5d14f1517b8b8f6c8192a0cb8`
- author-facing SKIN consultation authority: `SKIN_ABC_SOL`
- retained AB technical/evidence authority: `docs/status/AB_CURRENT.md` plus its accepted checkpoints
- retained C technical/evidence authority: `docs/status/C_CURRENT.md` plus its accepted checkpoints
- active Astra Research current: `docs/status/ASTRA_CURRENT.md`
- retained Large R4 / D22.1 A1 fabrication current: [R4_A1_FAB_CURRENT](R4_A1_FAB_CURRENT.md)
- active R5 execution-infrastructure current: [R5_SLICE_RUNNER_CURRENT](R5_SLICE_RUNNER_CURRENT.md)
- active A1 mini PETG+PLA physical current: [A1MINI_AMSLITE_PHYSICAL_CURRENT](A1MINI_AMSLITE_PHYSICAL_CURRENT.md)
- Astra Reader current: `docs/status/SKIN_R_CURRENT.md`

`SKIN_ABC_SOL` is the single author-facing consultation front for current SKIN priorities and future Research -> Production handoff decisions. It does not replace the accepted AB/C evidence or make their code one architecture.

## Current phase
- AB Performance v2 is `PASS / ACCEPT / CLOSED` at `87d5225a18dc7a1b8895cc44351db4c000be6261`.
- C View Representation Continuity v0 is `PASS / CLOSED` at `59ebb3cfb781442a1583509d5e8b5ea40120ff94`.
- Team AB has no active implementation task.
- Team C has no active implementation task.
- `SKIN_ABC_SOL` has no active implementation task.
- **Current author-directed execution focus:** A1 mini PETG+PLA bounded physical validation. PHYSICAL_01 actual-sent payload identity is COMPLETE from SD-card recovery; its quality is LOW; PHYSICAL_02 is a dry-only bounded comparison using the exact locked payload and is READY FOR AUTHOR EXECUTION / physical result pending. See `A1MINI_AMSLITE_PHYSICAL_CURRENT.md`.
- **R5 Slice Runner:** A1 single and A1 mini two-material execution routes are PASS. `REPRO_AUDIT_01` is classification C — minor toolpath nondeterminism / fabrication semantics equivalent for the compared runs. No Runner implementation is active. See `R5_SLICE_RUNNER_CURRENT.md`.
- **Large R4 / D22.1 lane:** retained separately under `R4_A1_FAB_CURRENT.md`; no new D22.1 completion evidence is asserted by this 2026-09-21 update. Its prior final-slice/audit HOLD remains whatever that lane's own CURRENT states.
- New author-facing SKIN consultation should normally enter through `SKIN_ABC_SOL`.

## Current purpose
Observe Research / Astra, SKIN_R, physical prints, and author review, then decide selectively what is worth preserving as reproducible SKIN capability.

Do not treat completion of old AB/C methods as the goal. Preserve what was actually proven, under the conditions where it was proven, and translate only what remains useful after artwork and physical review.

The retained [2026-09-18 Author direction](../observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md) remains authority for the separate Large R4 / D22.1 fabrication lane. Its **AUTHOR A1 PRINT PACKAGE GATE** is retained only for that lane. The current A1 mini dry-only physical test has its own gate in `A1MINI_AMSLITE_PHYSICAL_CURRENT.md`. Neither lane authorizes Production or generalization.

Reusable procedures and constraints now have a separate Playbook home: [A1 CLI Runbook](../fabrication/A1_BAMBU_CLI_RUNBOOK.md), [Toolpath Audit Rules](../fabrication/TOOLPATH_AUDIT_RULES.md), [Fabrication Principles](../fabrication/FABRICATION_PRINCIPLES.md). Documentation of a required check is not proof that it is implemented or validated. A future `skin fab slice` executor is proposed, not implemented by this update.

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

First secure Research reproducibility. After Author review, choose the first candidate and the bounded scope worth making SKIN-reproducible. Generalization comes later.

The current artwork/fabrication operating boundary remains:

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

Do not create or start a SKIN_ABC implementation task merely because Astra Research or A1 fabrication is active.

Current physical-test authority lives in `docs/status/A1MINI_AMSLITE_PHYSICAL_CURRENT.md`; R5 execution infrastructure lives in `docs/status/R5_SLICE_RUNNER_CURRENT.md`; the retained Large R4 / D22.1 lane remains in `docs/status/R4_A1_FAB_CURRENT.md`. Keep these authorities separate. Do not reinterpret the low-quality PHYSICAL_01 print as Runner failure, and do not use the dry-only test to reopen D22.1 geometry or Production.

## Blocker
None for SKIN_ABC. The lack of Production implementation is intentional. Fabrication blockers and uncertain external worker execution state belong to `R4_A1_FAB_CURRENT.md`, not a newly opened Production task.

## Next gate
1. PHYSICAL_02 executes only the locked V1-derived payload after the Author's drying treatment; no new slice, G-code edit, profile, geometry, Support, or Runner change.
2. Return drying record, actual manual-stop record and the defined photo sequence for **PHYSICAL_02 DRY-ONLY AUTHOR PHYSICAL REVIEW**.
3. Keep the retained Large R4 / D22.1 lane separate; resume it only from its own CURRENT and exact locks, not from the A1 mini experiment.
4. Keep R5 Slice Runner stopped unless a new execution-infrastructure defect or separately authorized validation appears.
5. Only after physical review should `SKIN_ABC_SOL` decide whether any bounded procedure/capability is worth `SKIN reproducible` translation. Generalization remains later.

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
- treating the current R4 GN study or fabrication Playbook itself as Production architecture.

## Required pointers
- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/ASTRA_CURRENT.md`
- `docs/status/R4_A1_FAB_CURRENT.md`
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

Old AB/C CURRENT files remain retained authority and must not be deleted or overwritten as part of the SKIN_ABC transition.
