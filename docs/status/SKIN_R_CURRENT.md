# SKIN_R Current Status

Last verified: 2026-09-08

## Authority
- repo: `satw-jp/katachi`
- lane: SKIN_R / Research-only Astra Reader
- canonical clone: `J:\dev\katachi`
- planned worktree: `J:\dev\worktrees\skin-r-astra-reader-v0`
- planned branch: `agent/skin-r-astra-reader-v0`
- shared samples authority: `J:\dev\samples`
- `C:\dev\samples` is not authority

## Current phase
SKIN_R implementation is **NOT STARTED**.

The next bounded task is **Astra Research Reader v0**: read existing Astra Research outputs inside an isolated SKIN Research route without reimplementing the Astra generator and without changing Production semantics.

The immediate purpose is author understanding before authoring: when a physical branch, junction, motif, or attachment is inspected, the author should be able to see what it is, which stage added it, what it connects to, and whether that explanation is actually recorded in Astra data or only derived later.

## Planned v0 scope
Read existing Astra data for **B_OPEN** and **B_PARTICIPATING** and expose the same-camera comparison with these independently visible layers:

1. `HOST`
2. `INTERNAL JUNCTIONS / CANDIDATES`
3. `OPEN CORE`
4. `CROSS-LINKS`
5. `SURFACE ATTACHMENTS`
6. `SURFACE MOTIFS`
7. `FABRICATION D1`
8. `REMOVABLE SUPPORT`

`SURFACE MOTIFS` should support `Visible / Transparent / Hidden` so attachment and internal branches can be read behind the flowers.

v0 selection scope is junction + member/branch. The information panel should prioritize:
- ID
- role / stage
- parent branch
- connected junctions
- target surface component / motif when recorded
- added stage
- added reason when recorded
- diameter / length / relevant dimensions

## Provenance rule
Reader explanations must distinguish:
- `RECORDED` — explicitly present in authoritative Astra data
- `DERIVED` — reproducibly inferred by the Reader from authoritative geometry / graph data
- `NOT RECORDED` — unavailable in the source; do not invent a plausible explanation

This distinction is part of the v0 acceptance criteria. In particular, the UI must not fabricate a reason such as durability, visibility, or printability when the historical Astra data did not record that reason.

## Current Astra data basis
The existing Research packages already contain enough data to start the read-only v0:
- `DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY`
  - `*_geometry.json`
  - `*_attachments.json`
  - fixed surface / motif data
  - parameter register
  - separated `.blend` artifacts
- `FOUR_CANDIDATE_FABRICATION_D1_D2_ISLAND_RESOLUTION`
  - later Fabrication D1 and Removable Support state
- `RESEARCH_HANDOFF_2026_09_08_PHYSICAL_PROGRESS`
  - current physical / fabrication observations and source pointers

Known research history includes the 96-junction internal graph lineage; B_OPEN selects a 95-edge connected core from that lineage, while B_PARTICIPATING restores selected cross-links and additional surface participation. UI counts must be loaded from source data rather than hard-coded.

## Physical Research state relevant to SKIN_R
B_OPEN has progressed through physical printing and careful Support removal. The author reports that the successfully printed regions largely remain together after removal.

Current physical/fabrication direction:
- keep overall branch sizing / sparse artwork character protected;
- local diameter increase is allowed only in visually hidden areas such as behind a large flower when needed for durability;
- broad branch-thickening remains disallowed;
- distinguish `print-time lower-region failure` from `local breakage during Support removal`;
- observe the current USAGI lower-region improvement first;
- if that correction is useful, translate the principle to B_PARTICIPATING rather than copying coordinates blindly;
- regardless of eventual SKIN translation success, complete physical evaluation of the four candidates and then close the current generation-quality study as one bounded phase.

## Relationship to future authoring
The Reader must come before branch editing.

Intended sequence:

`Astra data -> readable SKIN_R -> physical observation -> only then scope the authoring operations actually needed`

Possible later operations such as branch add/delete, local radius changes, junction movement, or attachment editing are **DEFERRED** and are not v0 scope.

## Explicitly NOT in v0
- Astra generator reimplementation
- branch generation
- branch add / delete
- junction movement
- radius editing
- attachment editing
- Save / Export
- Production translation
- G-code editing
- print operation
- C Production modification
- FKEI schema modification
- existing FKEI Analysis Viewer modification

## Protected lanes
C Production is currently closed with no active implementation task; do not modify its Production BODY / Graph / Removable Support / FIELD / Export / 3MF semantics from SKIN_R.

FKEI Analysis Viewer v0 is PASS / CLOSED; do not reopen or expand that Viewer for this task.

SKIN_R should be isolated as a Research route / study and may reuse safe renderer / camera / selection infrastructure only where that does not mix Research data into Production semantics.

## Next gate
1. In `J:\dev\katachi`, verify `origin = satw-jp/katachi` and fetch latest `origin/main`.
2. Do not implement in the canonical clone. Create `J:\dev\worktrees\skin-r-astra-reader-v0` from latest `origin/main` on branch `agent/skin-r-astra-reader-v0`.
3. If the planned branch or worktree already exists, do not reset or overwrite it; STOP and report.
4. Report base SHA / branch / worktree / clean status.
5. Create the bounded implementation task `docs/tasks/SKIN_R_ASTRA_READER_V0.md` before implementation.
6. Implement only the read-only v0 and STOP for Research SOL / Author review.

## v0 acceptance direction
The first useful gate is deliberately small:

> Open B_OPEN, select one real branch, and accurately explain what that branch is using recorded/derived provenance without inventing missing history.

Then confirm B_OPEN / B_PARTICIPATING can be compared from the same camera with the eight layer classes above.

No automatic expansion into authoring after this gate.
