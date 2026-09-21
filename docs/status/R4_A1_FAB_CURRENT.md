# R4 A1 Fabrication — Current

Operating direction updated: 2026-09-21 JST. Documentation-only correction authorized by the Author after the overall audit. No new physical outcome, geometry change, slice, full audit, hardware action or release is asserted.

## Authority and entry

- Repository: `satw-jp/katachi`.
- Lane: **Large R4 / A1 fabrication only**.
- Active lane branch: `agent/r4-a1-d222-local-support`, draft [PR #17](https://github.com/satw-jp/katachi/pull/17), not merged.
- PR #17 is stacked on `agent/r4-a1-fab-checkpoint-20260920` / [PR #16](https://github.com/satw-jp/katachi/pull/16), not directly on main. This documentation correction does not merge or retarget either PR.
- Main remains overall scope/routing authority: [SKIN_ABC_CURRENT on main](https://github.com/satw-jp/katachi/blob/main/docs/status/SKIN_ABC_CURRENT.md). Research, R5 and mini AMS authorities must be read on main, not from this older branch's relative copies.
- Resume task: [D222 local Support closure](../tasks/R4_A1_D222_LOCAL_SUPPORT_CLOSURE.md), now **WAITING PLUS4 PHYSICAL RESULT / NO ACTIVE REPAIR OR SLICE**.
- Physical record: [Plus4 experiment](../evidence/R4_A1_D222_PLUS4_PHYSICAL_EXPERIMENT_2026-09-20.md).
- Detailed pre-correction software checkpoint, provenance, numeric witness reviews and all original package pointers are retained [at 3cb215b3](https://github.com/satw-jp/katachi/blob/3cb215b3c19d21f6d7cab5a2e5466ba9c96d651f/docs/status/R4_A1_FAB_CURRENT.md). Its software-first NEXT wording is superseded by this front and the current task; its evidence is not discarded or promoted.

## NOW / physical-first

**Plus4 physical experiment was started by the Author at 2026-09-20 23:35 JST. Physical result is pending in the available evidence. Live printer state is UNVERIFIED.**

The Author's current operating direction is:

`concern -> bounded physical check -> repair only an observed problem within separately confirmed scope`.

R4 MOCOMOCO artwork completion is the goal, not exhaustion of every software warning. Existing native/integrity/profile PASS and full-audit completion remain evidence for their exact outputs. Mini survival is not proof that Large R4 is safe, and software flags are not counts of certain physical failures.

| Artifact / gate | Retained state |
|---|---|
| D22 | Frozen 2.2 mm reference; historical native recovery success |
| D221 | Immutable successful native/integrity output; own 1,058-layer audit complete; supportability HOLD |
| First D222 | D221 Artwork/old Support plus 33 adopted parts for original11; native/integrity PASS; own 1,058-layer audit COMPLETE |
| D22.2 Plus4 | 13 further parts, 46 total relative to D221; native/integrity/profile PASS; own 1,058-layer audit COMPLETE; overall supportability HOLD |
| Additional10 | 38 locally adopted parts from selected_v8, frozen separately; conditional local validation complete; **not included in Plus4; no combined native/G-code** |
| Additional7 | Unmodified witnesses; no repair scope opened by this update |
| Author bounded experiment | Plus4 STARTED by Author report, not live telemetry |
| Physical PASS / final Artwork ACCEPT / print-ready release / Production | Not established; no promotion |

## Exact Plus4 artifact and locks

Attempt: `attempts/additional_four_20260920` / `d222_plus4`, [Drive attempt](https://drive.google.com/drive/folders/197rtarKCiHz02bTwgBUXwJnYs67tplor).

- G-code: [plate_1.gcode](https://drive.google.com/file/d/1RVB2g31QBEh6ZjWPMAb_T8A50kmsUmqL/view), **1,227,347,428 bytes**, 53,582,313 lines, 1,058 layers, deposition Z0.2–211.6 mm.
- Recorded G-code SHA-256: `778b02bf50766d3de1d586592cc3ef6db3400f5c7fe767ddc54d3b2060ec6305`.
- ZIP: [plate_1.gcode.zip](https://drive.google.com/file/d/1QCdTELjpCYZruFnxLylYw8WiKX1NQWnK/view), 321,609,295 bytes; recorded SHA-256 `1ed72f86d0af75080ecba8fe206de86dceb431f2e9ccbfd35e9a6927eb456e28`.
- Plus4 Support input: 10,570,804 triangles / 528,540,284 bytes; SHA-256 `db41c871fe24f0b48cd433934f0f9cdd9aa8de5bf06a3c2cc00de6e7fa3aeb78`.
- Exact execution: `slice/d222_plus4_manifest.json` and `slice/PIPELINE_EXECUTION.json` within this attempt. Native exit0, elapsed4549.873s; own full audit completed 2026-09-20T10:18:23.919561Z, exit0.
- Integrity/profile evidence: `audit/FINAL_OUTPUT_VERIFICATION.json` and `audit/EXTRA_LOCKED_PARAMETER_CHECKS.json`. Recorded hashes are referenced, not freshly recomputed here; Drive ID/size checks are not full cloud-content hash verification.

Protected conditions: A1 / 0.4 mm nozzle / 0.2 mm layers / PLA240°C initial and normal / Textured PEI profile65°C / **15% grid / raft0 / auto brim** / infill-wall overlap100% / retraction0 / automatic Support OFF / authored Support geometry retained. Mapping1/0/0, Auto For Flush. CLI6000 X/Y/travel is retained explained engine-specific behavior; do not silently restore historical GUI12000/9000 or initial220°C.

Protect SHAPE, all FLOWER, Void, composition, placement, scale, orientation, internal centerlines and authored bottom Support. Keep all4,238 branches at2.2mm and the two ROOT_ADDITION exceptions at3.0mm. D221 and its four completed contacts are immutable. Do not import F2's100% infill/raft2 settings or mini AMS material conditions into this lane.

## Additional10 and seven observation witnesses

[Additional10 study](https://drive.google.com/drive/folders/1JDKcvoTZ55fhHTyh8EYUMG3eR-HV4Afh), [official38 parts](https://drive.google.com/drive/folders/1ZA2qhEEisin12XlAA_Jr8Ptdck9hsV9c).

`audit/ADDITIONAL_TEN_LOCAL_ADOPTION.json`, `audit/ADDITIONAL_TEN_DRIVE_SAVE_RECEIPT.json` and `validation_v8/FINAL_REMOVAL_GATE.json` retain exact selected_v8 identities, conditional chronology/parent/clearance/Void/removal evidence. Rejected v7 and failed long-fragment studies remain excluded. Strength, full tool jaws, fracture forces and scars are not physically proven. Local adoption does not require automatic inclusion in the next print.

Seven unmodified witnesses: **F3891/Z5.8; F0542/Z58.2; F1261/Z61.2; A4081/Z71.4; F2297/Z83.4; F0069/Z83.4; F4207/Z106.6**. Also retain the prior investigation band Z39–43. These are physical observation targets, not automatic repair orders or predictions of certain failure. Their pending authorization is not a prerequisite for receiving/reviewing the already-started Plus4 experiment.

The native floating warning is retained. Mapped internal IDs are not an exhaustive list of native warning IDs. Historical original11 local PASS did not cover the higher A4081/Z71.4 witness. F3052 nominal tangency and removal-force uncertainty remain explicit.

## Next action and STOP

1. Read the exact Plus4 physical record. Do not duplicate or replace the experiment merely to resume.
2. On Author result, bind the observation to candidate/payload, actual machine, scale, plate, material, overrides and observed height/layer. Unknowns remain UNKNOWN. Capture bed-on, before Support removal, and after removal evidence when available. Do not postpone actual plate/override recording until software closure.
3. Review observed problems and artwork usability. If acceptable, return the next Author decision on removal/finishing/artwork assessment; no automatic physical PASS or release. If a problem is observed, identify its bounded location and propose only the necessary repair with explicit scope before execution.
4. Keep Additional10 frozen and unsliced, Additional7 unmodified, and all prior successful artifacts intact while the physical result is pending. No new Artwork, blanket reinforcement, full-audit rerun or next native launch is authorized here.
5. Any later authorized changed-input slice follows [R5's main operation contract](https://github.com/satw-jp/katachi/blob/main/docs/status/R5_SLICE_RUNNER_CURRENT.md): Fabrication Astra freezes input/profiles, creates `SLICE_JOB.json`, records handoff and STOPs; Author starts Runner; Runner executes/records; Author supplies job_id/run folder; Astra reviews the completed `RESULT_MANIFEST`. No result guessing or duplicate slice while state is unknown.

Stop-worthy physical observations remain detachment, unsupported extrusion collapse, growing filament blob, nozzle collision or repeated striking; hardware response remains the Author's decision. General print-ready release HOLD is separate from the specific Author experiment already reported.

## Retained source evidence

[Root D222 package](https://drive.google.com/drive/folders/1Uw2EODVoUTeUW_GSFuDWbwT8H3gRfQJw), [clean D221 comparator](https://drive.google.com/drive/folders/1ATc_bEjepNdq_t8ut4hw7CnVmAv795RT), [D222 software record](../evidence/R4_A1_D222_LOCAL_SUPPORT_HOLD.md).

Preserve first-D222 `geometry/final`, `gcode`, `audit/final_full`, all per-attempt inputs/outputs and actual argv. The historical root PACKAGE_MANIFEST does not inventory all subsequent studies. Recovered old GUI G-code/ZIP corruption atL337/Z67.4 andL392/Z78.4 remains a comparator limitation. Do not reopen completed D221 four-contact repairs, old native-facet diagnosis, native execution, full audit or bulk hashes merely to resume.

No software implementation, hardware execution, branch merge, Production or generalization is authorized by this documentation correction.
