# MINIL adapter boundary — Issue #64
Pinned parent: 15a1487bf8f2704af2b62ff4cd9342770cd3f864 (PR #63 Draft unchanged).

New case dispatcher and geometry inspector: tools/authored_support/minil.
New preset: presets/minil_v1. No MINI_A preset, golden, registry or pipeline changes.

Implemented: immutable source locks; 2303 placement-array semantic identity; 2885 member semantic/mesh checks; 115 exact source-record/range/solid bindings; rotation/normal/scale validation; original float32 export plus cycle2 rigid frame; actual mesh bounds and downward-face inventory; member solid validation; B0/B115 identity comparison; explicit recipe/stage HOLD.

Not implemented: MINIL routing/Support meshing, contact selection, birth/load grids, brace sequencing and removal because MINIL dimensional/source policy is unbound. No legacy full builder is invoked. Changing a registry case ID alone cannot make its historical input data portable.

Null recipe values are deliberate missing authority, not defaults. Editing JSON alone cannot activate generation. SUPPORT_GEOMETRY.json has candidate_generated=false and no meshes. Physical validation is NOT_RUN_NO_CANDIDATE.

Pinned kernel verifies source solids only; this is not printability or removability proof. No slicer, profile editor, printer, native exporter, STL writer or manufacturing package used.

Command: python -B -m tools.authored_support.minil --case tools/authored_support/presets/minil_v1/CASE_MINIL.json --roots work/ROOTS_MINIL.local.json --out <new-output-outside-inputs>
Exit 2 means ADAPTER_HOLD. Do not label the result a Support candidate READY_FOR_ASTRA.
