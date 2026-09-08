# SKIN_R — Astra Research Reader v0

Date: 2026-09-08
Owner: Research SOL
Implementation worker: SKIN_R_LUNA
Status: READY TO START

## Goal
Implement a **Research-only read-only SKIN viewer** for existing Astra Research outputs.

The purpose is not to edit or regenerate geometry. The purpose is to let the author inspect a real branch / junction / motif / attachment from the physical work and understand:

- what it is;
- which stage added it;
- what it connects to;
- which information is explicitly recorded by Astra;
- which information is only reproducibly derived later;
- which explanation was never recorded.

Do not reimplement the Astra generator in v0.

## Authority / startup
Use:
- repo: `satw-jp/katachi`
- canonical clone: `J:\dev\katachi`
- base: latest fetched `origin/main`
- branch: `agent/skin-r-astra-reader-v0`
- worktree: `J:\dev\worktrees\skin-r-astra-reader-v0`
- shared samples authority: `J:\dev\samples`

Do not use `C:\dev\samples` as authority.

Before implementation:
1. verify `origin` is `satw-jp/katachi`;
2. fetch `origin`;
3. create the dedicated worktree from latest `origin/main`;
4. if branch/worktree already exists, do not overwrite/reset it; STOP and report;
5. report base SHA, branch, worktree path, and clean working-tree status.

Read first:
- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/SKIN_R_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/VIEWER_CURRENT.md`
- relevant Astra Research package README / handoff pointers named in `SKIN_R_CURRENT`.

## Source data / first candidates
Start with:
- `B_OPEN`
- `B_PARTICIPATING`

Existing Research packages include at least:
- `DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY`
- `FOUR_CANDIDATE_FABRICATION_D1_D2_ISLAND_RESOLUTION`
- `RESEARCH_HANDOFF_2026_09_08_PHYSICAL_PROGRESS`

Relevant Astra artifacts include `*_geometry.json`, `*_attachments.json`, fixed surface/motif data, parameter registers, and separated Blender artifacts.

Do not hard-code known counts. Read counts and IDs from authoritative source data.

## Import boundary
Do not spread Astra package-specific formats directly through SKIN UI code.

Create a thin adapter conceptually:

`Astra Research files -> AstraResearchSnapshot -> SKIN_R viewer`

The normalized snapshot should minimally represent, where actual source data supports them:
- junctions
- members
- motifs
- attachments
- fabrication additions
- removable supports
- source/provenance metadata

Design the minimal schema after inspecting real source files. Do not invent fields merely to make the model look complete.

Large Research packages should remain in Drive / external Research authority. Do not duplicate large source artifacts into GitHub. Small deterministic fixtures for tests are allowed.

If an OS-native picker is needed, do not open it automatically. Expose context first and require explicit user action per Team Protocol.

## v0 viewer layers
In one shared 3D viewport, independently show/hide:

1. `HOST`
2. `INTERNAL JUNCTIONS / CANDIDATES`
3. `OPEN CORE`
4. `CROSS-LINKS`
5. `SURFACE ATTACHMENTS`
6. `SURFACE MOTIFS`
7. `FABRICATION D1`
8. `REMOVABLE SUPPORT`

`SURFACE MOTIFS` must support:
- Visible
- Transparent
- Hidden

Switching between B_OPEN and B_PARTICIPATING must preserve the camera so the same viewpoint can be compared.

## Selection / information
v0 selection scope:
- junction
- member / branch

On selection, prioritize identity and causal context over dimensions. Show, when supported:
- ID
- role / stage
- parent branch
- connected junctions
- target surface component / motif
- added stage
- added reason
- diameter / length / relevant dimensions

Parent / target / stage / reason are higher priority than raw dimensions.

## Provenance rule — mandatory
Never mix historical recorded evidence with Reader-side explanation.

Every displayed explanatory field must be classifiable as:
- `RECORDED` — explicitly present in authoritative Astra data
- `DERIVED` — reproducibly calculated from authoritative source data
- `NOT RECORDED` — absent from source; do not invent a plausible reason

Examples:
- parent edge ID directly stored in source -> `RECORDED`
- membership in an OPEN core reproduced from authoritative graph rule -> `DERIVED`
- "added for durability" with no historical reason field -> `NOT RECORDED`

The Reader must prefer `NOT RECORDED` over a convincing but unsupported story.

## Explicitly out of scope
Do not implement:
- branch add
- branch delete
- branch generation
- radius editing
- attachment editing
- junction movement
- Astra generator reimplementation
- Save / Export
- Production translation
- G-code editing
- printing / hardware operations
- C Production changes
- FKEI schema changes
- FKEI Analysis Viewer changes

Authoring comes only after the author has used the Reader and Research SOL scopes the operations that were actually needed.

## Architecture preference
Reuse existing SKIN renderer / camera / selection infrastructure only if it can be done safely without mixing Research data into Production semantics.

Prefer an isolated Research route / study. Do not create a new large renderer or framework before checking existing infrastructure.

C Production and FKEI Analysis Viewer remain protected / closed lanes for this task.

## Done criteria for SOL review
v0 is ready for review when all are true:

- B_OPEN loads from real Astra data.
- B_PARTICIPATING loads from real Astra data.
- candidate switching preserves camera.
- all eight layer classes can be independently controlled.
- motifs support Visible / Transparent / Hidden.
- junction selection works.
- branch/member selection works.
- source-supported parent / target / stage metadata is displayed.
- `RECORDED / DERIVED / NOT RECORDED` is visible and correct.
- core / attachment / cross-link counts match source data rather than constants.
- focused tests pass.
- typecheck/build pass.
- browser evidence shows B_OPEN and B_PARTICIPATING from the same camera.
- Production / C / existing Viewer / FKEI / Export / 3MF semantic diff is zero.

The first practical acceptance question is:

> Can the author select one real B_OPEN branch and get an accurate, provenance-qualified explanation of what it is without the Reader inventing missing history?

## STOP
STOP after the bounded read-only v0 is complete.

Do not auto-expand into branch editing or generator work.

Return to Research SOL with a compact handoff containing:
- branch / commit
- base SHA
- task / CURRENT status
- Astra source package identities / hashes or stable provenance
- implemented layer coverage
- selection metadata coverage
- `RECORDED / DERIVED / NOT RECORDED` coverage
- tests / typecheck / build / browser evidence
- Production-protected diff result
- missing historical fields / blockers
