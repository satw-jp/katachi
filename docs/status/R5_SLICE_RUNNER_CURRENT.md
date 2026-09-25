# R5 Slice Runner Current Status

Last verified: 2026-09-26 JST. Reviewable sliced-only `.gcode.3mf` Phase B implementation and Fix 1 remain closed. A later Large A1 delivery run added bounded evidence that a Bambu-compatible sliced-only `.gcode.3mf` may carry its embedded G-code member with ZIP method 8 / DEFLATE while preserving the exact expanded G-code bytes; this is a transport/package finding, not a Runner re-slice or Physical PASS.

## Authority

- repo: `satw-jp/katachi`
- lane: **R5 Astra / FUKEI Slice Runner execution infrastructure**
- this CURRENT records status, operational handoff and evidence pointers; implementation remains in Drive staging and is not promoted into repo source by this update.
- operational source directory: [fukei_slice_runner](https://drive.google.com/drive/folders/1jDZUQy3YH_V59fih7xnU_0UN8LVv0u2u)
- recorded Windows directory: `J:/My Drive/codex/2026-09-20/files-pasted-by-the-user-fukei/outputs/fukei_slice_runner`
- entry: `app.py` in that directory; do not use the separately archived review ZIP as an interchangeable deployment.
- integration evidence folder: [R5_SLICE_RUNNER_INTEGRATION_V0](https://drive.google.com/drive/folders/1cLxuVDeCmgTkxO0m3rzYE2FMicYQAtzW)
- reproducibility audit: [REPRO_AUDIT_01](https://drive.google.com/drive/folders/1S8kNkIUebY0ss0YnqBOciG39ryUvGl3v)

Actual Windows shortcut target, currently running process and loaded source bytes were not inspected in this chat. The source inventory below identifies retrieved Drive files, not live deployment telemetry.

## Responsibility boundary

**Fabrication Astra = WHAT / WHEN / REVIEW.**

**R5 Slice Runner = EXECUTE / RECORD.**

Runner does not choose geometry, Support, printer/process/filament conditions, slicer semantics, Print GO, physical PASS, or Author acceptance. It executes a prepared `SLICE_JOB.json` using its validated CLI route and records execution evidence. Geometry/profile validation beyond the implemented input checks remains Fabrication Astra's responsibility.

## NOW / Current phase

**Runner integration: PASS. Reviewable `.gcode.3mf` Phase B: PASS / CLOSED. Runner code freeze restored. Phase C: DEFERRED / NOT ACTIVE.**

Verified real execution retained from existing evidence:
- A1 single-filament real execution: **PASS**.
- A1 mini + AMS lite two-project-filament real execution: **PASS**.
- mini run `A1MINI.AMSLITE.SMOKE.01`: `SUCCESS`, `execution_success=true`, exit0, input locks verified, exact input/profile identities and argv/cwd/datadir recorded, isolated outputs.

[Actual mini smoke RESULT_MANIFEST](https://drive.google.com/file/d/1IcMvZScJWq69a72qosIp7ylF_17v3h17/view): started2026-09-20T17:46:48.990514+09:00, finished17:47:35.628449+09:00, runner_version`0.1.0`, job/result schema`0.1`. [Run folder](https://drive.google.com/drive/folders/1ZE0u8j-kn3R_qyur3-d1tEsUpYG98L_i).


### Existing native sliced-3MF identity checkpoint

The existing A1 mini smoke already produced both a native sliced 3MF and a standalone G-code.

- native sliced 3MF: `MINI_AMS_LOWER_TEST_NATIVE.3mf`
- sliced 3MF SHA-256: `07e00f3839615f9e5d5ed4d782f6a7932784017bbe5358fff4d02044410dd64f`
- embedded G-code entry: `Metadata/plate_1.gcode`
- embedded G-code bytes: `13,184,604`
- embedded G-code SHA-256: `dbb4e4987f085898b5a414b28922554a8a2bca1d1dcc15f8b67488933f771406`
- standalone `plate_1.gcode` bytes: `13,184,604`
- standalone G-code SHA-256: `dbb4e4987f085898b5a414b28922554a8a2bca1d1dcc15f8b67488933f771406`

For this stored artifact, **embedded G-code and standalone G-code are byte-identical**.

This means the next concern is not "can Runner create a sliced 3MF?" but "can the Author review that existing native sliced 3MF in Bambu Studio and then send it without losing or silently replacing the Runner toolpath?" Follow the bounded task before changing code.

The current retrieved `runner.py` still declares version `0.1.0`, but its source bytes are now different from the historical smoke-era `0.1.0` source. Therefore **version string alone is not source identity**; use the current source SHA checkpoint above for this Phase B implementation. The historical smoke remains identified by its own recorded artifacts and should not be retroactively attributed to the new source.

### 2026-09-26 Large delivery transport evidence

A final Large A1 2.2 mm / resolution 0.02 job exposed a delivery-only size problem after software slice/toolpath PASS: the standalone G-code was `1,098,992,698` bytes and an effectively uncompressed sliced-only send package exceeded Bambu Studio's observed 1 GB upload limit. The package was repacked without changing G-code, geometry, profiles or Runner.

The final transport package stored `Metadata/plate_1.gcode` with ZIP method 8 / DEFLATE:

- package bytes: `294,636,058`
- package SHA-256: `d8574b8a6df5d09194062268775ab7d5935b610f4b84943bbd834b58d1834150`
- compressed G-code member bytes: `294,620,961`
- expanded G-code bytes: `1,098,992,698`
- expanded G-code SHA-256: `97d846b62308af20f9c9e9c473280490989a191c1ce208b59dd81b070546c256`
- ZIP CRC: PASS
- Bambu Studio 02.08.02.61 recognized A1 / 0.4 mm, PLA mapping and ~801.96 g material use, and the cloud upload path began successfully.

This confirms a useful **container-level transport optimization**: large sliced-only `.gcode.3mf` delivery packages can preserve exact G-code identity while substantially reducing upload size via DEFLATE. It does not mean arbitrary `.zip` / `.gz` G-code is accepted, and it is not a universal Bambu-version/printer/material guarantee.

Promoted evidence and operating rule:
- [BAMBU_GCODE_3MF_DEFLATE_TRANSPORT_2026-09-26](../evidence/BAMBU_GCODE_3MF_DEFLATE_TRANSPORT_2026-09-26.md)
- [A1_BAMBU_CLI_RUNBOOK RUN-06B](../fabrication/A1_BAMBU_CLI_RUNBOOK.md#run-06b--large-sliced-only-gcode3mf-transport-compression)

## Source identity checkpoint — retrieved bytes, not a new build

The following six top-level Python source files were retrieved from the operational Drive directory and SHA-256 computed over their actual bytes on2026-09-21. No code was edited or executed. Tests, screenshots, caches, Python runtime and the Bambu executable are outside this source-file inventory; it is not a complete execution-environment lock.

| File / exact Drive identity | Bytes | SHA-256 |
|---|---:|---|
| [app.py](https://drive.google.com/file/d/1YDSrW2v6I0AhuAmFXoftXxN_oKkp03Sy/view) |17099|`5d681268d260b29fed4901449c73abd6719d831b340ceac355d04133d96b1aff`|
| [runner.py](https://drive.google.com/file/d/1o00swl8H_jAoTyXWPkfk1RgrtvZxrv1H/view) |24646|`2316c807feae00296c2e2a13722fab5c0ce078fa52a39a5e5da520fc5a97f2ff`|
| [job.py](https://drive.google.com/file/d/1zrcyN6btExZ6Omc0MMCH8ZFLbfRi3H18/view) |12989|`6696d4284a799c2e66c7cbc07d57613e807e85b4f0aadd3a7f51fb486a0d3f95`|
| [progress.py](https://drive.google.com/file/d/1hwltKqLIEHL0hWcdAWxAhzxIpB8ivYdK/view) |3856|`0cbb84245e6b3252b14838bda1cd1f89f93c98b4b39016e08cdd78f8c3362622`|
| [startup.py](https://drive.google.com/file/d/1uwzH4UUg9iJRCiitVXwDWEcMXDX8VUxr/view) |4863|`aafece1c6c2327b44458bf24f619bd93073c6ea0efd1d9972891f4330bea6c78`|
| [setup_windows.py](https://drive.google.com/file/d/1d84TMJSCNcXM3hi8CgnlSouP3ddRH7lJ/view) |6952|`ba0cde12e02d253ca6e9b2224b19be452277bf38e2e225f891a12ff720bd154f`|

**Separate review artifact:** [R5_SLICE_RUNNER_INTEGRATION_V0.zip](https://drive.google.com/file/d/1yAXqvNxrGhpw8Ufw7zb69Dw2HQiXbcps/view),23980bytes, SHA-256`ae02837ec766d8dacc9764ffd218e325d0b6a190a04b34d46c2f6ab717633c95`. Its member root is `r5_slice_runner_review/`.

- ZIP `app.py`:13382bytes, SHA-256`87e07129bce19e6775ca979eb2923857e13cbb93fac1cb59fe9a332fff50253c`.
- ZIP `runner.py`:14555bytes, SHA-256`c74b3ab68d6663057cb8863ec628d4f156cc8be4fac7e4ccf548cf16d03a2c14`.

These two ZIP members are byte-different from the operational-directory files. Preserve the ZIP as a distinct review artifact; do not extract it over the operational directory or claim it is the exact source of the successful run. No fault causality or historical build identity follows merely from this difference. The original ZIP and Drive code remain unchanged.

## Standard handoff / resume with the existing GUI

This is **Author-triggered operation, not an automatic watched-folder queue**. Placing a job in an input folder does not start this implementation.

1. **Fabrication Astra:** perform only an explicitly authorized bounded model change; check the relevant geometry evidence; freeze exact input, machine/process/material profiles and CLI route. Create `SLICE_JOB.json` and input locks, record job_id/candidate, exact job path, output root, expected outputs and pending gate in the lane handoff, then **STOP**. No CLI completion wait and no guessed result.
2. **Author:** select that exact job in the operational Runner GUI, check its read-only identity, and click **G-codeを書き出す** once. Keep Runner open for execution; minimizing is distinct from closing/cancelling it. Astra stopping does not mean stopping the Runner process.
3. **Runner:** execute the supplied CLI, preserve isolated run output/logs/context/locks and write terminal `RESULT_MANIFEST.json`, then stop that run. No profile editing, model conversion, toolpath judgment or printer send.
4. **Author:** report completion with **job_id plus exact run folder or RESULT_MANIFEST path**. A generic 'slice finished' is enough only when the pending lane/job can be resolved unambiguously from the recorded handoff; do not pick by latest timestamp alone.
5. **Astra:** read the actual terminal manifest, saved job/context/locks, logs and expected outputs. Match job_id/candidate/input/profile identities, status, exit code and output path/size. Review the relevant G-code/layers/toolpaths and return only the necessary next judgment. This review does not itself grant Print GO.

Manifest existence is not success: FAILED/CANCELLED runs may also write one. SUCCESS/exit0 means CLI execution success, not printable output or physical/artistic approval. Require a readable complete terminal manifest and available expected outputs; Drive-sync delay or a missing manifest is UNKNOWN, not proof of failure or permission to re-run.

The current manifest inventories output paths/bytes; it does not compute full output G-code SHA-256 or prove all expected outputs exist merely from exit0. Binding/release-specific output integrity belongs to Astra's required review of that actual artifact, not an invented Runner guarantee. Preserve a needed hash once rather than repeating bulk hashing at every resume.

## Duplicate prevention — operational rule, not an implemented guarantee

The GUI prevents starting while its current Runner instance is active, and output directories are distinct. It allows another run after completion. There is no asserted persistent same-job deduplication or exactly-once guarantee.

Before starting/restarting, inspect the pending job's existing run/manifest. A matching successful output goes to review, not re-slice. An active or unknown run requires checking existing GUI/logs/process/output first; do not launch a parallel CLI, kill an unattributed process or issue a blind retry. Failed/cancelled attempts remain preserved; a deliberate retry needs an explicit reason and separately identified attempt in the lane handoff. Do not modify frozen inputs while a queued/running job may read them. Use one Author-controlled pending job at a time in the current GUI.

Astra does not automatically poll in chat or wake itself on filesystem completion; the Author's completion report triggers a new review turn. New automation is not implemented or required here.

## A1-to-mini boundary

A1-100% Artwork master remains upstream. `A1 master -> MINI PREP -> A1 mini editable3MF -> Runner` is the responsibility boundary. Runner does not perform geometry conversion. Historical73.33333333333333% whole-model scaling is not automatically validated for F2 Support diameters, pads, contacts or braces. Any future MINI PREP is a separately authorized bounded task informed by physical evidence; no implementation is active.

## Reproducibility review

`REPRO_AUDIT_01` final classification:

**C — MINOR TOOLPATH NONDETERMINISM / FABRICATION SEMANTICS EQUIVALENT**

Meaning:
- raw G-code bytes are not deterministic between the two compared runs;
- ordered canonical toolpath is not byte/canonical-identical;
- the bounded deeper audit found no meaningful fabrication-semantic difference in deposited geometry locus, material-switch semantics, purge, prime tower, or thermal sequence;
- all46 audited filament-change events in the Runner-vs-console comparison matched in count/sequence/switch-block semantics/purge;
- resolved settings were byte-identical and semantic diff count was zero.

This is not a general Bambu determinism guarantee.

## Important physical-evidence boundary

PHYSICAL_01 was bound by SD-card recovery to a **different V1-derived actual sent payload**, not the earlier Runner smoke V0 payload. Its38 changes excluding initial selection and the smoke comparison's46 events are separate payload facts.

Therefore PHYSICAL_01 low quality is **not evidence of a Slice Runner failure**. Do not attribute its stringing/roughness to Runner-vs-console nondeterminism. Runner integration PASS and physical quality remain separate evidence lanes. PHYSICAL_02 reuses its locked payload; no new Runner job is needed for that dry-only test.

## HOLD / unresolved

- Byte-level determinism remains false.
- Engine executable SHA-256, full inherited environment and historical datadir tree identity were not all archived for the legacy comparison run.
- Current retrieved-source inventory is not proof of exact historical executed source, currently loaded process bytes or Windows shortcut target.
- Optional future provenance improvement may record engine/environment/datadir identities, but no code implementation is authorized now.
- No production/generalization claim.

## Active implementation instruction / next gate

Active bounded task:
[R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0](../tasks/R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0.md)

Author direction:
[AUTHOR_OBSERVATION_R5_RUNNER_REVIEWABLE_SLICED_3MF_2026-09-21](../observations/AUTHOR_OBSERVATION_R5_RUNNER_REVIEWABLE_SLICED_3MF_2026-09-21.md)

**Phase A FAIL / Phase B implementation PASS / CLOSED. Runner code freeze restored.**

The Author opened the existing Runner-produced generic `.3mf`; Preview caused Bambu Studio to generate G-code again, so Phase A failed. A sliced-only `.gcode.3mf` proof was then packaged without re-slicing and with embedded G-code bytes unchanged.

Author review of that proof passed: Bambu Studio opened it directly as sliced Preview without G-code regeneration; PETG/PLA toolpaths and layer slider were visible; warnings/estimates remained available; and the send dialog exposed PETG -> A1 / PLA -> A3 mapping. Send was disabled because the printer was busy, and no send was attempted.

The bounded sliced-only packaging and identity surfacing are implemented and SOL-verified. Review packaging failure is separated from CLI execution status; fail-closed checks cover missing/corrupt native artifacts, malformed settings, missing embedded G-code and native/standalone mismatch. Current independent verification: **24 tests OK / 3 platform-specific skips**. No further Runner implementation is active.

The later sent-payload identity check remains a separate Author-gated Phase C using a tiny bounded fixture. It must establish whether the G-code recovered from the actual sent payload matches the Runner embedded G-code hash; filename/timestamp similarity is insufficient. **Phase C is deferred and not active.**

## Required pointers

- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/SKIN_ABC_CURRENT.md`
- `docs/status/A1MINI_AMSLITE_PHYSICAL_CURRENT.md`
- `docs/tasks/R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0.md`
- `docs/observations/AUTHOR_OBSERVATION_R5_RUNNER_REVIEWABLE_SLICED_3MF_2026-09-21.md`
- operational Drive source directory and exact files listed above
- Drive integration evidence / actual mini smoke RESULT_MANIFEST
- Drive `REPRO_AUDIT_01`
