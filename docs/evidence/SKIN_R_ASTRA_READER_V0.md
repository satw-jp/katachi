# SKIN_R Astra Research Reader v0 — Evidence

## Source / provenance

The reader uses the two user-designated Research packages recorded in
`src/studies/skin/astra-reader/data/source-manifest.json`. The package archives
remain outside the repository; only the small machine-readable adapter inputs
are committed.

## Verified

- B_OPEN loads 262 members, 167 attachments, 96 source junction identities.
- B_PARTICIPATING loads 325 members, 212 attachments, 96 source junction identities.
- The participating-only cross-link delta is 18 recorded member IDs.
- D1 and D2 rules are loaded from their candidate-specific JSON files.
- Snapshot test, existing study catalog test, source typecheck, and production
  build pass.
- Local browser smoke at `http://127.0.0.1:5185/astra-reader.html` showed
  B_OPEN, then B_PARTICIPATING with the same camera state, cross-links enabled,
  Surface Motifs set to Transparent, and Fabrication D1 enabled. The visible
  UI showed source counts `96 / 167`, then `members 325 / attachments 212 / D1
  353`.

## Evidence boundary

The in-app browser viewport used for this smoke was 315px wide, so the canvas
computed to zero width and a 3D visual comparison could not be honestly marked
PROVEN in this environment. Selection data and controls were present, but
canvas-level visual evidence remains `UNVERIFIED` and requires a normal-width
browser pass by SOL/Author.

## Production diff

No Production, C, FKEI, existing Viewer, Export, or 3MF files were changed.
