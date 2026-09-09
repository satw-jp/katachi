# SKIN_R Astra Research Reader v0 Fix 2 — Evidence

## Merge / authority

- branch: `agent/skin-r-astra-reader-v0`
- latest main merged normally: `74025cdec38786e99d40fcb82d0fa1c0cf6fa3e9`
- Fix 2 merge commit: `a2473887a01f78bcf36da3bd55445af487864e49`
- accepted Fix 1 checkpoint remains in history: `81a5325c39ec27af9bb11bc91d120513f9729990`
- task authority: `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX2_CONNECTIVITY_HIGHLIGHT.md`
- observation authority: `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_CONNECTIVITY_2026-09-09.md`

## Viewer-only connectivity behavior

- Permanent Reader members use bounded volumetric tube display for continuity readability; snapshot/member radius values are unchanged.
- A selected member receives a strong yellow overlay that is rendered above the normal scene.
- Connected junctions are emphasized with larger yellow markers.
- Directly adjacent members are calculated only from shared `connectedJunctions` identity and shown as `DERIVED ADJACENCY` with a cyan overlay.
- An attachment's source `parent_member_id` remains `RECORDED PARENT` and is shown separately with a magenta overlay when visible.
- No unique generation path, parent/child chain, geometry edit, or authoring operation is introduced.
- Hidden layers suppress both their pick targets and their connectivity overlays.

## Focused browser evidence

At `http://127.0.0.1:5185/astra-reader.html`:

1. B_OPEN, same camera: selected real internal member `E027`.
   - connected junctions: `J073`, `J080` (`RECORDED` source ancestry identity);
   - derived adjacent members: `E029`, `E030`, `E028`, `E090`, `E024` (`DERIVED ADJACENCY`);
   - selected branch rendered as a visibly thicker yellow overlay;
   - connected junctions rendered as strong markers.
2. B_OPEN attachment `B_OPEN-G095`:
   - `RECORDED PARENT`: `B_OPEN-G038`;
   - target: `surface component 126` (`RECORDED`);
   - recorded parent is visually distinct from derived adjacency context.
3. B_PARTICIPATING switched at the same camera:
   - loaded counts changed to `325 / 212`;
   - CROSS-LINKS layer was enabled and remained understandable as a layer, not a causal chain;
   - motifs switched to Transparent.

## Tests / build

- focused snapshot / provenance / connectivity test: PASS
- existing study tests: 19 passed
- typecheck: PASS
- production build: PASS

## Protected diff

No Production, C, FKEI, existing Viewer, Export, 3MF semantic, generator, or authoring files were changed.
