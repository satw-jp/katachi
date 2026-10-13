# MINIL authored Support adapter (Issue #64)

The Author's `MINIL_AUTHORED_SUPPORT_ADAPTER_COMPLETION` instruction expands the
original inspection scope to candidate design, generation and technical validation.
The default entry point now runs the MINIL V2 recipe, source/ownership gates,
MINIL-derived sections and demands, geometry generation, removal model and readback.
It does not invoke a slicer, generate manufacturing formats, Send or Print.

Use a fresh output directory. `RECIPE_MINIL_V2.json` is a candidate recipe, not
physical approval. READY requires nonempty generation, completed demand processing,
removal records for every generated object, readback and unchanged input hashes.
Known unhandled demands, brace needs, conservative escape blocks and real-tool
unknowns remain explicit. The completion is implementation validation, not an
independent review.

Historical V1 handoff below is retained for provenance and is superseded for this task.

This lane performs source binding and derives geometry inventories before a recipe gate.
It currently stops at `MINIL_SOL_AUTHORED_SUPPORT_ADAPTER_HOLD`.
**It does not generate removable Support yet.** Empty SUPPORT_GEOMETRY is an explicit non-candidate.

The inherited MINI_A program remains unchanged. JSON case renaming or supplying ad hoc values cannot
activate its historic V4/V5/V6/V7 rules. MINIL-specific dimensional, raft, repair-ownership and removal
bindings are listed in RECIPE_MINIL.json and RISK_LEDGER.json.

```powershell
python -B -m tools.authored_support.minil --case tools/authored_support/presets/minil_v1/CASE_MINIL.json --roots work/ROOTS_MINIL.local.json --out <new directory outside all inputs>
python -B -m unittest tools.authored_support.minil.test_adapter -v
```

Map ROOTS.local.example.json to verified inputs; the source lock must match. The pinned kernel is required.
No source reconstruction from G-code or held native mesh is performed. The native candidate is read
as bytes only to verify its identity. Source objects are never edited. The adapter reads actual NPZ
positions, template and members; every one of 2885 member mesh signatures is recomputed.

The 115 overlay is read from its original NPZ and exact source ledger, never adopted as B0.
The shown plate frame precedes native slicer raft lift. Do not interpret minimum CAD Z as Support
birth layer, raft adhesion or valid seating.

Astra handoff on HOLD is limited to source/recipe blockers, not physical certification.
