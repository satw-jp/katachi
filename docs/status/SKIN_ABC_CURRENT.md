# SKIN_ABC Current Status

Last verified: 2026-09-21 (execution routing refreshed; retained AB/C evidence unchanged)

## Authority
- repo: `satw-jp/katachi`
- branch: `main`
- main base at CURRENT creation: `caf1350725fccfee7e06d9d21787bcfe302031fd`
- author-facing SKIN consultation authority: `SKIN_ABC_SOL`
- retained AB technical/evidence authority: `docs/status/AB_CURRENT.md` plus its accepted checkpoints
- retained C technical/evidence authority: `docs/status/C_CURRENT.md` plus its accepted checkpoints
- active Astra Research current: `docs/status/ASTRA_CURRENT.md`
- cross-lane execution entry: [SKIN_FUKEI_EXECUTION_CURRENT](SKIN_FUKEI_EXECUTION_CURRENT.md)
- active bounded A1 fabrication current: [R4_A1_FAB_CURRENT](R4_A1_FAB_CURRENT.md)
- R5 Slice Runner current: [R5_SLICE_RUNNER_CURRENT](R5_SLICE_RUNNER_CURRENT.md)
- Astra Reader current: `docs/status/SKIN_R_CURRENT.md`

`SKIN_ABC_SOL` is the single author-facing consultation front for current SKIN priorities and future Research -> Production handoff decisions. It does not replace the accepted AB/C evidence or make their code one architecture.

## Current phase
- AB Performance v2 is `PASS / ACCEPT / CLOSED` at `87d5225a18dc7a1b8895cc44351db4c000be6261`.
- C View Representation Continuity v0 is `PASS / CLOSED` at `59ebb3cfb781442a1583509d5e8b5ea40120ff94`.
- Team AB has no active implementation task.
- Team C has no active implementation task.
- `SKIN_ABC_SOL` has no active implementation task.
- Current execution routing is summarized in [SKIN_FUKEI_EXECUTION_CURRENT](SKIN_FUKEI_EXECUTION_CURRENT.md). R4 has progressed through D22.2 Plus4 native/integrity/full-audit completion and the Author has reported a bounded Plus4 physical experiment started; physical result remains pending. Additional10 has 38 locally adopted parts but no combined native. R5 Slice Runner REPRO_AUDIT_01 is complete at classification C and remains stopped. Lane CURRENT files own detailed identities, limits and restart pointers.
- New author-facing SKIN consultation should normally enter through `SKIN_ABC_SOL`.

## Current purpose
Observe Research / Astra, SKIN_R, physical prints, and author review, then decide selectively what is worth preserving as reproducible SKIN capability.

Do not treat completion of old AB/C methods as the goal. Preserve what was actually proven, under the conditions where it was proven, and translate only what remains useful after artwork and physical review.

The retained [2026-09-18 Author direction](../observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md) supersedes the old Artwork-only phase description only for the bounded A1 fabrication lane. It does **not** authorize Production, generalization, new Artwork Research or machine-send/printing. The active fabrication STOP is **AUTHOR A1 PRINT PACKAGE GATE**.

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

Current bounded fabrication execution authority lives in `docs/status/R4_A1_FAB_CURRENT.md`, reached through `ASTRA_CURRENT.md`. It must STOP at its Author gate. Do not redo completed contact repairs, duplicate a recorded active slice, or automatically translate the Playbook into SKIN code.

## Blocker
None for SKIN_ABC. The lack of Production implementation is intentional. Fabrication blockers and uncertain external worker execution state belong to `R4_A1_FAB_CURRENT.md`, not a newly opened Production task.

## Next gate
1. Keep GitHub CURRENT and reusable Playbooks aligned with actual artifact evidence; use the working D22.1 instead of reapplying its four repairs.
2. R4 A1 Fabrication Astra resolves existing execution, completes final native output/integrity and all-layer audit, and returns at **AUTHOR A1 PRINT PACKAGE GATE**.
3. Only explicit Author GO may authorize the physical print. Continue retaining physical/fabrication evidence and limitations.
4. `SKIN_ABC_SOL` then selects a bounded proven procedure/capability, if any, for `SKIN reproducible` translation, with a separate task and acceptance evidence.
5. Generalization and architecture integration are later decisions; a documented Playbook or a technical slice PASS does not pre-approve them.

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
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/SKIN_R_CURRENT.md`
- `docs/notes/AB_PERFORMANCE_V2_SKIN_ABC_HANDOFF_2026-09-08.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_ARTWORK_FABRICATION_TOOLPATH_ARCHITECTURE_2026-09-08.md`
- `docs/observations/AUTHOR_OBSERVATION_R4_LARGE_MOCOMOCO_GN_2026-09-13.md`
- `docs/observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md`
- `docs/fabrication/FABRICATION_PRINCIPLES.md`

Old AB/C CURRENT files remain retained authority and must not be deleted or overwritten as part of the SKIN_ABC transition.
