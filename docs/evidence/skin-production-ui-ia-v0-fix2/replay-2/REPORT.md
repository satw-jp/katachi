# C Production v0 Removable Support Wiring Correction

Implementation evidence only. Print Approval, slicer tuning, support-removal quality, and physical viability remain unapproved.

## Root cause

Production Stage 6 copied the imported legacy `project.printSupport` into the rebuilt P3 project, while the correct offset-bend graph existed only as the later session-only `current-stage8:sparseResult.graph`. The Production runtime was not rebound when Stage 8 replaced the project. Direct Production artifact generation could therefore select the legacy nearly-vertical graph.

## Correction

Stage 6 now clears inherited removable support. Existing Stage 8 generation runs against the locked Production P3 BODY scale/field policy, and its exact project/graph identity is rebound into the Production runtime. No support algorithm, route heuristic, BODY policy, permanent graph, export encoder, or 3MF separation rule changed.

- Geometry checkpoint: 73bba117c1d09bf14735b1ad71938b086b165cf8
- Production BODY fingerprint before: c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501
- Production BODY fingerprint after: c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501
- BODY identity: PASS
- Support graph: 577 nodes / 395 edges / ef1d3eaec4146e171316a81e441797526fef6c8921d88a7689b68ac9c5892121
- Routes: vertical 61 / leaning 76 / offset-bend 76
- Expected route geometry: vertical shaft → bend → angled approach → short neck
- Route geometry verification: PASS
- Supported: 137
- Unsupported / unresolved: 15
- Accepted BODY collision: 0
- Inside-derived: 0
- 3MF validation: PASS (2 separate objects)
- Artwork BODY identity: PASS
- Support identity in 3MF: PASS
- Print Approval: NO
