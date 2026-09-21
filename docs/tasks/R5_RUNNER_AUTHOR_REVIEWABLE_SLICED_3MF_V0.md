# R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0

Status: **PHASE B IMPLEMENTATION PASS / CLOSED — PHASE C DEFERRED / NOT ACTIVE**

Owner: R5 Slice Runner LUNA under SOL review.

Author direction:
[AUTHOR_OBSERVATION_R5_RUNNER_REVIEWABLE_SLICED_3MF_2026-09-21](../observations/AUTHOR_OBSERVATION_R5_RUNNER_REVIEWABLE_SLICED_3MF_2026-09-21.md)

## 0. Purpose

Establish the future large-job operating path:

`Astra -> SLICE_JOB -> FUKEI Slice Runner -> reviewable sliced 3MF -> Bambu Studio Author Review -> Author Send`.

The first objective is **not** to add a new file format. Determine whether the current Runner/native Bambu output already satisfies the required review contract.

Follow:

**concern -> bounded check -> repair only if an observed gap exists.**

Do not modify Runner simply because a new contract is desired.

## 1. Existing evidence to preserve

Current A1 mini Runner smoke output already contains:

- `MINI_AMS_LOWER_TEST_NATIVE.3mf`
- standalone `plate_1.gcode`

Existing native 3MF inspected on 2026-09-21:

- sliced 3MF SHA-256:
  `07e00f3839615f9e5d5ed4d782f6a7932784017bbe5358fff4d02044410dd64f`
- embedded entry:
  `Metadata/plate_1.gcode`
- embedded G-code bytes:
  `13,184,604`
- embedded G-code SHA-256:
  `dbb4e4987f085898b5a414b28922554a8a2bca1d1dcc15f8b67488933f771406`
- standalone `plate_1.gcode` bytes:
  `13,184,604`
- standalone G-code SHA-256:
  `dbb4e4987f085898b5a414b28922554a8a2bca1d1dcc15f8b67488933f771406`

Therefore for that stored smoke artifact:

**embedded G-code == standalone G-code byte-for-byte.**

This is evidence about the existing artifact only. It is not yet proof that Bambu Studio sends those exact bytes without reslicing/repackaging.

## 2. Contract

A successful future Runner job intended for Author review must expose:

### Required review artifact

A Bambu-native sliced 3MF containing the exact slice result intended for review/send.

It may retain the native Bambu filename. Do not invent a custom container if the native output already works.

### Required identity record

The terminal result must make the review artifact unambiguous and record:

- reviewable sliced-3MF path;
- sliced-3MF SHA-256;
- embedded G-code entry path;
- embedded G-code SHA-256;
- standalone G-code path, when present;
- standalone G-code SHA-256;
- `embedded_equals_standalone` boolean;
- job_id / candidate / input locks / profile locks / Bambu version;
- existing status / exit code / execution context.

Do not call the artifact printable, approved, safe, or physically valid.

### Required Author review surface

Opening the review artifact in Bambu Studio must permit the Author to inspect, where applicable:

- toolpath Preview;
- material/filament coloring;
- individual filament extrusion existence;
- layer slider;
- warnings / floating-region warnings;
- prime/wipe tower;
- estimated material/time;
- send-dialog mapping from project filaments to physical AMS slots.

Runner must not auto-send.

## 3. Phase A — current output reviewability check

### Result — FAIL

Author opened `MINI_AMS_LOWER_TEST_NATIVE.3mf`, switched to Preview without pressing Slice, and Bambu Studio began `G-codeを生成...` (observed at 80%). Therefore the generic Runner-exported `.3mf` is not a valid no-reslice Author review surface.

Evidence: [R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_PHASE_A_2026-09-21](../evidence/R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_PHASE_A_2026-09-21.md)

The exact gap is now observed. Runner code may remain frozen while a packaging-only proof is checked.

**No Runner code change. No new slice if the existing smoke artifact is sufficient for the check.**

Use the existing A1 mini smoke sliced 3MF first.

Author action:
1. open the existing Runner-produced native 3MF in Bambu Studio;
2. confirm it opens as an already-sliced/reviewable artifact;
3. confirm Preview is available without an intentional reslice;
4. confirm PETG/PLA (or the artifact's two project filaments) can be distinguished in toolpath Preview;
5. confirm layer slider and warnings are available;
6. enter the send dialog only far enough to confirm physical AMS mapping is visible;
7. do **not** send in Phase A.

Capture:
- Prepare/Preview identity screenshot if useful;
- filament/toolpath Preview;
- send mapping dialog;
- whether Studio asks/requires a reslice;
- any loss of warnings/settings/material identity.

### Phase A gate

If the existing Runner sliced 3MF is fully reviewable:

**PHASE A PASS — no packaging code required.**

Then only manifest/UI surfacing may be proposed if it is genuinely missing.

If Studio cannot review the artifact without reslicing, or material/toolpath identity is lost:

**PHASE A FAIL — return the exact observed gap before implementation.**

Do not guess the fix.

## 4. Phase B — sliced-only `.gcode.3mf` packaging proof

Project history already contains a prior sliced-only `.gcode.3mf` packaging path (`R4_A1_MINI_READY.gcode.3mf`, plus `package_sliced_only.py.log`). Use that retained pattern rather than inventing a new format.

A proof artifact has been created from the existing Runner smoke output without re-slicing:

`MINI_AMS_LOWER_TEST_NATIVE.gcode.3mf`

Proof artifact SHA-256:
`23a8c5ce1f7070adca1785767a0752abc897835644fdd2fe08db585d4f31763e`

Its embedded `Metadata/plate_1.gcode` remains byte-identical to the Runner output:
`dbb4e4987f085898b5a414b28922554a8a2bca1d1dcc15f8b67488933f771406`

### Phase B author check — PASS

Author opened the proof `.gcode.3mf` in Bambu Studio.

Observed:
- the file opened directly into an already-sliced Preview;
- no G-code regeneration was shown;
- PETG / PLA toolpath colors were visible;
- layer slider was available;
- estimated time/material and material-change information were visible;
- warning state remained visible;
- the send dialog showed physical material mapping:
  - PETG -> AMS A1
  - PLA -> AMS A3
- send was disabled only because the printer was busy with another print; no send was attempted.

Therefore the sliced-only `.gcode.3mf` packaging pattern satisfies the required Author review surface for this bounded proof.

**PHASE B PASS.**

Evidence screenshots were supplied by the Author in chat. No physical print or send was performed for this proof.

### Minimal Runner implementation — COMPLETE / PASS

Implemented in the Drive-staged Runner:

1. successful native slice -> sliced-only `.gcode.3mf` packaging;
2. `Metadata/plate_1.gcode` byte preservation;
3. review artifact / embedded G-code / standalone G-code SHA-256 recording plus `embedded_equals_standalone`;
4. `review_ready` and review-artifact identity in `RESULT_MANIFEST.json`;
5. user-triggered **Bambu Studioで確認** action only;
6. no auto-send / no silent reslice.

Fix 1 also separates CLI execution success from review packaging success. If packaging fails after CLI exit0, `status=SUCCESS` and `execution_success=true` are preserved while `review_artifact.status=FAILED` and `review_ready=false` are recorded.

Fail-closed review packaging now requires:
- standalone G-code;
- native sliced 3MF;
- ZIP CRC PASS;
- parseable `Metadata/model_settings.config`;
- native embedded `Metadata/plate_1.gcode`;
- exact native embedded == standalone G-code bytes.

Missing/corrupt/mismatched evidence produces no review artifact and does not rewrite the CLI result.

Validation:
- Author/LUNA report: **24 tests PASS**;
- SOL independent re-run from the current Drive-staged source: **24 tests OK / 3 SKIP** (the three skips are platform-specific Windows tests on the non-Windows verification host);
- syntax/test-only validation; Bambu CLI, printer send and physical print were not run for this closure.

No slicer CLI semantics, geometry, Support, profiles, AMS mapping policy or printer operation were changed.

### Later Runner implementation scope, only after packaging proof PASS

Start only after SOL confirms an observed Phase A gap or confirms that identity fields are missing from the operational handoff.

Allowed scope:
- expose the existing native sliced 3MF as the canonical review artifact;
- compute/store SHA-256 for the sliced 3MF and embedded G-code;
- compute/store standalone G-code SHA-256;
- record exact byte equality;
- surface the review artifact clearly in GUI/result manifest;
- optionally provide an explicit **Open in Bambu Studio** action only if it is user-triggered and does not auto-send or silently reslice.

Protected:
- no slicer CLI semantic changes;
- no geometry conversion;
- no profile edits;
- no Support edits;
- no Bambu project-settings mutation merely for presentation;
- no automatic AMS mapping;
- no printer send;
- no physical print;
- no large R4 test.

Tests must prove identity and fail closed on missing/corrupt 3MF or missing embedded G-code.

## 5. Phase C — sent-payload identity validation — DEFERRED / STILL REQUIRED

This is a separate Author-gated validation after Phase A/B.

Use a tiny bounded fixture, not Large R4.

Objective:

`Runner embedded G-code SHA == actual sent/recovered payload embedded G-code SHA`

or else record the exact transformation performed by Bambu Studio.

Required evidence:
- Runner review 3MF SHA;
- Runner embedded G-code SHA;
- Bambu Studio version;
- Studio review screenshots;
- physical AMS mapping screenshot;
- recovered sent payload from printer/SD/cache;
- recovered 3MF/G-code SHA;
- exact equality/difference classification.

Do not infer equality from filename or timestamps.

If send would start a physical print, obtain separate explicit Author GO before performing it.

## 6. Acceptance / DoD

V0 is accepted only when:

1. a Runner-produced native sliced 3MF is shown to be Author-reviewable in Bambu Studio;
2. material/toolpath Preview is visible before send;
3. physical AMS mapping is visible before send;
4. Runner/result evidence records the review 3MF and embedded G-code identity;
5. a later bounded sent-payload validation establishes whether Studio preserves the exact Runner toolpath;
6. no auto-send exists;
7. technical PASS is not promoted to physical PASS, Author ACCEPT, Print GO, or Production.

## 7. STOP

For the current task, Phase A is closed FAIL and Phase B implementation is **PASS / CLOSED**. STOP. Phase C remains deferred and requires a new explicit Author gate before any send/recovery validation.

Return to SOL with:

- Phase A FAIL / Phase B PASS history is retained above;
- Phase B implementation is now closed;
- no next Runner implementation task is active;
- Phase C remains deferred.

STOP.
