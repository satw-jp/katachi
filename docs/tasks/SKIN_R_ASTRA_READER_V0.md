# SKIN_R — Astra Research Reader v0

Status: IMPLEMENTED — SOL review pending

## Scope

Research-only reader for the existing B-track Astra packages. This task reads
recorded data; it does not generate, edit, export, or promote geometry.

Authority:

- repository: `satw-jp/katachi`
- base: `origin/main` at `999b4eeb8e96c75dfe07cb9533a579399cb7e9f5`
- source packages: `DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY` and
  `FOUR_CANDIDATE_FABRICATION_D1_D2_ISLAND_RESOLUTION`
- source location: `J:\\My Drive\\codex\\2026-09-06\\files-pasted-by-the-user-research\\outputs`

## Done criteria

- Load B_OPEN and B_PARTICIPATING from machine-readable source JSON.
- Preserve camera while switching candidates.
- Toggle the eight independent reader layers; motifs support visible,
  transparent, and hidden states.
- Select a junction or member and show source-first metadata.
- Label every displayed fact as RECORDED, DERIVED, or NOT RECORDED.
- Verify source counts: B_OPEN 262 structure members / 167 attachments and
  B_PARTICIPATING 325 structure members / 212 attachments, with 96 source
  junction identities.
- Keep Production, C, FKEI, existing Viewer, Export, and 3MF semantics
  unchanged.
- Pass focused tests, typecheck, build, and browser smoke evidence.

## Explicit non-goals

No branch editing, regeneration, radius editing, attachment editing, junction
movement, Save/Export, Production conversion, G-code editing, print actions, or
changes to Production / FKEI / existing Viewer behavior.
