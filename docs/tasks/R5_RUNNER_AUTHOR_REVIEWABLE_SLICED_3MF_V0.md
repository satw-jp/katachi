# R5_RUNNER_AUTHOR_REVIEWABLE_SLICED_3MF_V0

Status: **ACTIVE BOUNDED VALIDATION — PHASE A FIRST / NO RUNNER CODE CHANGE YET**

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

## 4. Phase B — Runner surfacing / integrity implementation, only if needed

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

## 5. Phase C — sent-payload identity validation

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

For the current task, execute **Phase A only** first.

Do not modify Runner until the current native sliced 3MF has been tested in Bambu Studio and an actual gap is observed.

Return to SOL with:

- Phase A PASS/FAIL;
- screenshots/evidence;
- whether reslice was required;
- exact missing capability, if any;
- proposed smallest next change.

STOP.
