# MINIL LOWZ50 current — 2026-10-23

Authority: Issue #66 and Author's lightweight/current-print clarification.

**MINIL_LOWZ50_SUPPORT_PROGRAM_HOLD.** Shared V2 construction, component demand detection, existing-shaft routes, regression tests and trial generation were implemented. Final visual QA found source-section fill extending outside geometry bounds. 1,087,542 occupied voxels lie outside the source box even with one cell allowance. Eight generated trial branches and their improvement counts are quarantined, not accepted.

Final code rejects odd scanline crossing counts and unvalidated caches. Sixteen regression tests pass. Two-process synthetic generation is reproducible; the actual invalid LIGHT cache is refused before any new mesh is generated. V2 defaults and source geometry remain unchanged.

Next gate: repair/validate the lightweight section reader, treating unclosed regions as UNKNOWN without silently repairing source meshes. Keep the existing support construction rules. No new native slice, Send or Print is authorized by this lane.

Current print: `AUTHOR_CONTINUES_OBSERVATION`, lightweight confirmed by Author; exact submitted job binding remains incomplete. New candidate: `print_go=false`. PR #65 remains Draft/unmerged and unchanged.

Local review artifacts: `outputs/MINIL_LOWZ50_SUPPORT_PROGRAM_20261023/RESULT.md` in the shared task workspace. Remote publication references are recorded in the Draft PR body.
