# MINIL LOWZ50 local certificate — HOLD

Authority: Issue #66 / PR #67 review 5625221980 / Author next-stage task.

STOP: **HOLD — GENERATOR_COPLANAR_SECTION / LOCAL_CERTIFICATE_INCOMPLETE / PRINT_BINDING_PARTIAL**

## Numerical neck

`NEAR_PLANE_NUMERICAL_REPLAY_PASS`: two independent Python processes return identical geometry SHA and section records at CAD Z4.033333333333333 / 5.3533333333333335 mm. The stored-mesh intersections are genuinely nonzero, not cancelled to zero. Exact binary-float rational intersections retain all 26 / 60 nonzero segments in one ring. Minimum lengths are 9.5595072e-10 / 1.6190668e-10 mm. Exact parity at 36 grid centres per section agrees with independent float/GEOS results: 1 / 3 occupied centres. Tiny edges were not deleted, tolerance and V2 geometry were not changed. This certifies the saved tessellation, not ideal CAD or physical extrusion.

Full synthetic generation remains HOLD: after one fixture-only output, a later neck section hits `COPLANAR_FACE`. The partial output is not an adopted candidate. The two-process **section** PASS is not a two-process full-generator PASS. No real MINIL branch was generated.

## Three-state and real LIGHT audit

Implemented KNOWN_MATERIAL / PROVEN_EMPTY / UNKNOWN with UNKNOWN taking precedence, even over known receiver material. PROVEN_EMPTY is a grid-centre statement, not an empty voxel or continuous clearance proof. Queries also test full continuous XY rectangles plus halo against conservative UNKNOWN envelopes. Required scopes include preceding/current/four subsequent target sections, donor to plate, full proposed route and interference corridor. Missing scopes, unknown future material, unknown donor root, or unknown between grid centres return LOCAL_UNVERIFIED.

The sealed v3 cache was rechecked against all file hashes, source SHA and original reader/adapter snapshots. It is retained as v3 evidence, **not relabelled as a v4 extraction**. All 21,905 UNKNOWN sections remain conservative full-component XY envelopes; no topology was inferred closed. Known valid masks remain those independently validated in the prior full audit. New local counts are screening windows, not unsupported births or unique flowers.

Summary: `{"OTHER_LOCAL_UNVERIFIED": 160278, "OTHER_TARGET_WINDOW_UNKNOWN_FREE_ONLY": 247505, "FLOWER_LOCAL_UNVERIFIED": 2488, "FLOWER_TARGET_WINDOW_UNKNOWN_FREE_ONLY": 1}`.

Of 2489 nonempty flower component-section windows at CAD Z<=50mm, 1 is free of UNKNOWN in the conservative previous/current/four-successor window and 2488 are LOCAL_UNVERIFIED. This single target-window result is **not a complete donor/route/geometry certificate**. Full local certificates: 0. Exact continuous clearance, all proposed-part scope construction and generator integration remain unverified; the legacy global generation guard stays closed. Before/after support improvement is NOT claimed.

The single window is part6/component197/section28, CAD Z4.18mm. Its four known centres overlap preceding known material, but root continuity is unproven. Subsequent sections29–32 contain no grid centres for that component, so a continuing four-section receiver is not certified. It is not an independently proven unsupported birth. SINGLE_WINDOW_FOLLOWUP.json retains the measurements. Conservative full-component envelopes may exclude smaller certifiable subregions; this audit does not prove no possible local solution exists.

## Saved LIGHT G-code found — partial binding

Read-only search found an existing Bambu temporary saved job, not the precise Candidate C G-code. `origin.txt` references the exact LIGHT source, whose SHA remains `ecaa3527c26a6b608191cb4fac4f6d8db6d1c871be2b1adc62854d7f84266415`. Saved slice metadata names LIGHT. Standalone G-code and the embedded archive G-code have identical SHA `3621f2f42bab5881d7a8dae1045337e0c32e950531261256ed3b7496d8be6744`. Job archive SHA `3c4065ed76e7741de7da4683bec7e1f61a09e3342cc3f5a2e3eaf7fd9c91c353`; project settings SHA `300d9cd49ed8dd06ec6c2ae781de05388617f9b0639dd50dc9563cff284fb658`. A byte-identical archive copy is preserved locally under saved_job_reference; no new assembly was generated.

Saved settings: A1 / 0.4 / Generic PLA / 0.10mm / initial0.20mm / raft2 / automatic Support OFF / contour +0.15mm. **Textured PEI 65°C**, not the previously requested SuperTack45°C. This is evidence from the saved file, not a claim about current hardware/bed temperature. No setting was changed.

Actual saved extrusion: raft layer1 machine Z0.20 (Support), layer2 Z0.50 (Support interface), first body layer3 Z0.70 (walls/bottom). Lines and samples are in SAVED_GCODE_FIRST_LAYERS.json. CAD UNKNOWN does not imply absence of slicer extrusion. However the temporary project has only 53 external component references and lacks object_20.model; its backup build matrix is rotated. Saved geometry-to-G-code transformation and current running job SHA remain UNBOUND. No spatial CAD-UNKNOWN overlay, actual support verdict or raft-offset certification is asserted. The name and matching bounding range alone are insufficient. Precise-C evidence was not substituted.

Search scopes: workspace archive, MINIL workspace, Downloads, Documents, Desktop, Bambu cache and temporary model folders. Four unrelated/inaccessible directories are recorded as search gaps. No printer connection or live-job operation.

## Tests, protected scope and next bounded work

73 regressions PASS, including original16, V2/MINIL suites and 14 new exact/tri-state tests. Vectorized envelope checks were followed by the same test suite. One slow read-only audit was stopped, preserved, then repeated with equivalent vectorized checks in a new output directory. A final guard rejects nonfinite halo inputs; the finite-halo audit execution snapshot and guard-only diff are preserved separately in LOCAL_AUDIT_CODE_BINDING.json. No native retry or slice occurred.

Next minimum work: retain exact near-plane fix; resolve full-generator coplanar semantics without mesh change; complete proposal-derived donor/root/whole-route certificates for the screened subdomain; recover geometry/transform binding for the saved LIGHT slice before comparing it spatially with CAD uncertainty. Do not revive old eight rods or improvement counts. No additional branch design or source repair is authorized by this report.

V2 construction/generate/shared section code SHA unchanged in this task. Source geometry and existing Support unchanged. Current print: AUTHOR_CONTINUES_OBSERVATION. New native slice=0, Send=0, Print=0, print_go=false. PR65 unchanged; PR67 Draft/unmerged.

Branch `agent/minil-support-lowz50-program-v1`; local HEAD `f5febf59a47d1d90f6a0bcc7c0df43cc43654db4`, dirty preserved (including unadopted experiments). Published HEAD recorded separately in PUBLICATION.json.

Review folder: https://drive.google.com/drive/folders/1fGWueDD4m-uFUCkTtcVokGO2E9yKEv19
