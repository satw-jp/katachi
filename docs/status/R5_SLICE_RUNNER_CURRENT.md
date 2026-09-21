# R5 Slice Runner Current Status

Last verified: 2026-09-21 JST. Author-authorized documentation/identity correction; Runner code and existing execution evidence are unchanged. No new runtime test or slice was performed.

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

**Runner integration: PASS. Runner code: FREEZE. Active Runner implementation task: NONE.**

Verified real execution retained from existing evidence:
- A1 single-filament real execution: **PASS**.
- A1 mini + AMS lite two-project-filament real execution: **PASS**.
- mini run `A1MINI.AMSLITE.SMOKE.01`: `SUCCESS`, `execution_success=true`, exit0, input locks verified, exact input/profile identities and argv/cwd/datadir recorded, isolated outputs.

[Actual mini smoke RESULT_MANIFEST](https://drive.google.com/file/d/1IcMvZScJWq69a72qosIp7ylF_17v3h17/view): started2026-09-20T17:46:48.990514+09:00, finished17:47:35.628449+09:00, runner_version`0.1.0`, job/result schema`0.1`. [Run folder](https://drive.google.com/drive/folders/1ZE0u8j-kn3R_qyur3-d1tEsUpYG98L_i).

The retrieved `runner.py` also declares version`0.1.0`. Version correspondence is confirmed; exact historical executed source-tree identity is not, because that run did not archive a Runner source hash.

## Source identity checkpoint — retrieved bytes, not a new build

The following six top-level Python source files were retrieved from the operational Drive directory and SHA-256 computed over their actual bytes on2026-09-21. No code was edited or executed. Tests, screenshots, caches, Python runtime and the Bambu executable are outside this source-file inventory; it is not a complete execution-environment lock.

| File / exact Drive identity | Bytes | SHA-256 |
|---|---:|---|
| [app.py](https://drive.google.com/file/d/1YDSrW2v6I0AhuAmFXoftXxN_oKkp03Sy/view) |15236|`050de5de5a7fe62f8817d92b8adaf02971405d68bb1e8ffd0edafe55bf270665`|
| [runner.py](https://drive.google.com/file/d/1o00swl8H_jAoTyXWPkfk1RgrtvZxrv1H/view) |14194|`803c9af7240072fe96bf65ac6deb7b6d9c475e0b51f008f8e9755f8527eaaa2f`|
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

**NONE. Code freeze. No new Runner validation gate is active.**

Do not modify Runner, rerun reproducibility tests, or change slicer semantics merely because a physical experiment is active. Resume Runner development only for an observed execution-infrastructure defect, separately authorized provenance improvement, or a new printer/material route requiring bounded validation. The standard operation above describes use of the existing implementation for separately authorized future jobs; it does not start one now.

## Required pointers

- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/SKIN_ABC_CURRENT.md`
- `docs/status/A1MINI_AMSLITE_PHYSICAL_CURRENT.md`
- operational Drive source directory and exact files listed above
- Drive integration evidence / actual mini smoke RESULT_MANIFEST
- Drive `REPRO_AUDIT_01`
