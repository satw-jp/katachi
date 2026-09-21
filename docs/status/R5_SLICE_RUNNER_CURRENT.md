# R5 Slice Runner Current Status

Last verified: 2026-09-21 (JST)

## Authority

- repo: `satw-jp/katachi`
- lane: **R5 Astra / FUKEI Slice Runner execution infrastructure**
- this CURRENT records status and evidence pointers; the current Runner implementation remains in Drive staging output and has not been promoted into repo source code by this update.
- Drive integration package: https://drive.google.com/drive/folders/1cLxuVDeCmgTkxO0m3rzYE2FMicYQAtzW
- reproducibility audit: https://drive.google.com/drive/folders/1S8kNkIUebY0ss0YnqBOciG39ryUvGl3v

## Responsibility boundary

**Fabrication Astra = WHAT / WHEN / REVIEW.**

**R5 Slice Runner = EXECUTE / RECORD.**

Runner does not choose geometry, Support, printer/process/filament conditions, slicer semantics, Print GO, physical PASS, or Author acceptance. It executes an already validated `SLICE_JOB.json` and records exact execution evidence.

## NOW / Current phase

**Runner integration: PASS. No active Runner implementation task.**

Verified real execution:
- A1 single-filament real execution: **PASS**.
- A1 mini + AMS lite two-project-filament real execution: **PASS**.
- A1 mini run completed through the FUKEI Slice Runner with `execution_success=true`, exit code 0, locked input/profile identities, exact argv/cwd/datadir recording, and isolated outputs.

Current Runner version in the audited run: `0.1.0`.

## Reproducibility review

`REPRO_AUDIT_01` final classification:

**C — MINOR TOOLPATH NONDETERMINISM / FABRICATION SEMANTICS EQUIVALENT**

Meaning:
- raw G-code bytes are not deterministic between the two compared runs;
- ordered canonical toolpath is not byte/canonical-identical;
- the bounded deeper audit found no meaningful fabrication-semantic difference in deposited geometry locus, material-switch semantics, purge, prime tower, or thermal sequence;
- all 46 audited filament-change events in the Runner-vs-console comparison matched in count/sequence/switch-block semantics/purge;
- resolved settings were byte-identical and semantic diff count was zero.

This is not a general Bambu determinism guarantee.

## Important physical-evidence boundary

PHYSICAL_01 was later bound by SD-card recovery to a **different V1-derived actual sent payload**, not the earlier Runner smoke V0 payload.

Therefore:
- PHYSICAL_01 low print quality is **not evidence of a Slice Runner failure**;
- do not attribute PHYSICAL_01 stringing/roughness to Runner-vs-console nondeterminism;
- Runner integration PASS and PHYSICAL_01 physical quality remain separate evidence lanes.

## HOLD / unresolved

- Byte-level determinism remains false.
- Engine executable SHA-256, full inherited environment, and historical datadir tree identity were not all archived for the legacy comparison run.
- Optional provenance improvement may later record engine SHA-256 plus relevant environment/datadir provenance, but no implementation is authorized now.
- No production/generalization claim.

## Active implementation instruction

**NONE.**

Do not modify Runner, rerun reproducibility testing, or change slicer semantics merely because the physical experiment is active.

## Next gate

No Runner gate is active.

Resume this lane only if:
1. a new execution-infrastructure defect is observed;
2. a separately authorized provenance improvement is requested; or
3. another printer/material route requires a new bounded validation.

## Required pointers

- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/SKIN_ABC_CURRENT.md`
- `docs/status/A1MINI_AMSLITE_PHYSICAL_CURRENT.md`
- Drive `R5_SLICE_RUNNER_INTEGRATION_V0`
- Drive `REPRO_AUDIT_01`
