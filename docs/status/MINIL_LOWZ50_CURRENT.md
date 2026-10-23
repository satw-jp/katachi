# MINIL LOWZ50 current — 2026-10-23

Authority: Issue #66, PR #67 review, Author task MINIL_LOWZ50_SECTION_READER_REPAIR.

**HOLD — UNKNOWN_SOURCE_SECTIONS / GENERATOR_NECK_SECTION_UNVERIFIED.** LOWZ now reconstructs closed rings and checks every accepted raster against GEOS. The shared V2 default and construction/selection rules are unchanged. The old cache, eight branches and improvement counts remain quarantined.

Fresh LIGHT audit: 53 parts, 444,891 scheduled component-sections, 422,986 known and 21,905 UNKNOWN. Zero out-of-section known cells; all known masks agree with the independent reference. Original SHA unchanged. UNKNOWN is not empty or supported; no new real MINIL candidate/comparison was generated.

59 regression tests PASS, including the original 16. The separate synthetic generation replay is HOLD at sub-tolerance neck sections, not PASS. Two bounded correction cycles complete; no threshold relaxation or source repair.

First traced ghost-fill cause: FLOWERS_00 component 189, Z0.66/Y120.67, source open/nonmanifold edges producing three crossings. Other UNKNOWN causes remain individually recorded. This is not a diagnosis of physical print failure.

Evidence: [section-reader report](../evidence/MINIL_LOWZ50_SECTION_READER_20261023.md). Full data: [Drive review folder](https://drive.google.com/drive/folders/1otmjyn6N61IPNoyMxKyy9Qap91IKOzHx).

Next decision: a verified evidence source for LIGHT's unclosed sections, plus bounded near-plane classification validation. No silent substitution of precise C or mesh repair.

Current print remains AUTHOR_CONTINUES_OBSERVATION; new candidate print_go=false. Native slice / Send / Print = 0. PR65 unchanged; PR67 Draft, no merge.
