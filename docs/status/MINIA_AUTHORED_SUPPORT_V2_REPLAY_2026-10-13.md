# MINI_A authored Support V2 — software replay

STOP: `MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_READY`

This is software reproduction success, not a physical print PASS. Author review and the next manufacturing/application gate remain separate.

## Repository and execution identity

- Branch: `agent/minia-authored-support-program-v0`; Draft PR [#63](https://github.com/satw-jp/katachi/pull/63), unmerged.
- Starting HEAD: `179d99de67924cd77711c734a00e952487ca4d7a`. The committed version of this report identifies the implementation; final HEAD/dirty/push readback is recorded separately in the execution evidence and final handoff.
- Certified generated run: `cli_relocated_build_r3`; independent fresh-process verifier: `cli_relocated_verify`.
- Original V4-only result and old worktree preserved. Failed preflight attempts r1/r2 are retained, not overwritten. No further full-generation retry followed r3.

## Exact comparisons

| Stage | Expected / regenerated | Result |
| --- | --- | --- |
| V4 D2 | 151 candidates, 157 rejections | Plan, recomputed mask, all 151 mesh arrays match |
| Removal | 150 / 150, remaining D2_112 | Ordered removal, tool direction and cut data match |
| V5 | 6,093 / 6,093 | Full plan and mesh arrays match |
| V6 | 5,855 / 5,855 selected | Ordered IDs and BODY-only grids match |
| V7 | 14,536 / 14,536 | Full plan and mesh arrays match |
| A1 | 19,391 / 19,391 | Full plan and mesh arrays match |
| Final A | 22,373 / 22,373; 15 kinds | Full ordered plan and all arrays match |
| Successful native Support | 9,304,850 / 9,304,850 triangles | Exact oriented triangles; transform applied once |

Final plan mismatched IDs: none. Mesh mismatched IDs: none. Native mismatched IDs: none. All plan parameters/metadata are compared, excluding identified execution-location fields. Source vertices/faces are compared by dtype, shape and array SHA-256.

The original package_review.py lines 11–16 supply the final historical-height metadata mutation. Its packaging, profiles and historical physical assertions are not executed. N00224 and X03795 are removed at their original stages with source identity and expected-before checks. F2-only reconnection is not applied to A.

Native comparison independently selects Support part `3` in `3D/Objects/object_2.model`. Native face order differs for two opposing coincident triangles in W01133. Comparison preserves coordinates, winding and multiplicity with numerical tolerance zero; face order and cyclic vertex starts alone are ignored. Source-world array equality remains strict and independent. Original export omits 226 zero-area triangles. No tolerance was widened to hide a geometry mismatch.

Native reference SHA256: `2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736`.

Final source ledger SHA256: `ba38bb5f52212c214d42bec859ac83d58be7793b693f27c8aae4160bc08ba758`.

## Execution tests and preservation

- Contract/regression suite: **35 PASS / 0 FAIL / 0 SKIP**, 3.338 s. Bad/malformed SHA, descriptor identity, unknown kinds, missing/duplicate references, invalid overrides, output/source overwrite, side effects, network/process rejection and native double-scale/winding/multiplicity are covered.
- Actual fresh-process `inspect`, `build`, then separate `verify` completed. The thin `replay` build-to-verify dispatcher is tested; the expensive full build was not repeated merely to exercise the same orchestration again.
- The second complete generation used physically copied, relocated fixed inputs, a new output directory and a fresh process. GOLDEN, completed Support and native 3MF were absent there; historical source-tree reads and manufacturing references were denied during generation.
- 10,463 relocated input/source files have identical before/after SHA. An independent original-tree check found 10,512 original source/mesh files unchanged; the successful 3MF SHA is unchanged. The original V4 check separately covers 4,202 inputs.
- All executed code/preset identities matched the saved execution snapshot before report finalization. Normal generator LLM/API/network use and external processes started: **0**. A dependency's optional Windows-version subprocess probe is blocked before launch; local hostname inspection is permitted because it is not network traffic.
- Build: **5639.296 s**, peak working set **6,385,827,840 bytes**. Verify: **432.188 s**, peak working set **603,205,632 bytes**. These are process maxima, not per-stage incremental memory.

## Evidence and review boundary

[Drive evidence folder](https://drive.google.com/drive/folders/1G-OeKmnVV0svglUtJCNf_DghBkJf312Y). `PHASE_COMPARISON.md` indexes development comparisons. `cli_relocated_build_r3` contains SOURCE_LOCK, RECIPE_RESOLVED, OVERRIDES_APPLIED, STAGE_RESULTS, support_geometry, all support_mesh arrays, DECISIONS, VALIDATION, input SHA and runtime records. `cli_relocated_verify/REPLAY_COMPARISON.json` contains the full independent comparison. TESTS and final result are in the parent audit folder.

Unimplemented source, unexplained ID mismatch, unresolved reproduction exception: **none for this fixed MINI_A case**. Historical physical/access holds remain holds, including D2_112. The removal sequence of 150 and downstream retained-low-D2 selection of 115 remain distinct.

MINIL application = 0; Flower/Permanent changes = 0; profile changes = 0; STL/manufacturing 3MF/G-code/print package generation = 0; slice = 0; Send = 0; Print = 0; main merge = 0.

FOLLOW-UP: Author should review the software evidence and decide whether to open a separate MINIL adaptation gate. Physical printability, removability, Support redesign and copying legacy dimensions into MINIL are not approved by this result.

Post-run publication metadata: only informational certification/status text in SOURCE_RULE_MAP and RECIPE was updated after the execution snapshot. No algorithm, source lock, parameter, geometry or comparison changed. The 35-test suite passed again (0 FAIL / 0 SKIP, 2.892 s); final original-tree/native SHA readback also passed.

Verified Drive upload: [software evidence archive](https://drive.google.com/file/d/1Rem61HfqGUSJPpmfhTe1-llrerUVXier/view), 93,126,680 bytes / 22,435 entries. Local ZIP CRC passed; cloud metadata readback confirms name, size and destination. Archive SHA256: `0684161e9f1ab7504a0e63638ef521b50d8a6859fb31a66bd388988a30927fb0`. Cloud checksum was not returned by the connector.
