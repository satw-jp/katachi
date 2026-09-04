# SKIN Golden LUNA — Output Scale / Physical Diameter Separation v0

2026-09-04 · branch `agent/skin-golden-output-scale-v0` (base: `origin/agent/skin-golden-support-physical-feedback-v1` @ f4f3114 —
the `agent/skin-golden-export-ux-v0` checkpoint bd51557 does not exist locally or on origin, so the newest Golden branch was used).
Golden merge: NO. Deploy: NO. Print #2 physical candidate: FROZEN, untouched.

## Core rule

Shape Scale != Member Diameter. Overall artwork scale and material /
structural thickness are independent physical controls.

- AUTHORING SPACE (Base / Motif / Surface Pattern / Graph, relative
  placement and proportions) follows one overall ratio.
- OUTPUT `targetLongestMm` (longest dimension, mm) scales the whole authored
  geometry: 80 → 120 mm is ×1.5 for Base, Surface Pattern, Motif positions
  and Motif geometry alike. No Motif-only scale parameter in this version.
- STRUCTURE `strutDiameterMm` (Permanent member) and FABRICATION
  `supportDiameterMm` (Removable Support) are absolute mm values. Changing
  Output Size alone never rewrites them; re-realization rebuilds the mesh at
  the same mm. No new geometry algorithm, no Graph topology change, no
  Stage 8 algorithm change.

A finished 3MF is never plainly rescaled (that would rescale the diameters
too). Output Size change ⇒ physical preparation STALE ⇒ explicit user
Prepare ⇒ re-realize permanent members at the specified mm ⇒ regenerate /
re-diagnose support at the new physical scale ⇒ Print Preview ⇒ Artifact
Export. Export click never re-runs Stages 3–8.

## What changed

- NEW `src/studies/skin/rebuild/outputScale.ts` (pure, no DOM): presets
  80/120/Custom (`outputScalePresetLabel`), `outputScaleFactor` /
  `expectedOverallExtentMm`, `evaluateOutputScalePreparation` (CURRENT/STALE
  + reasons; null prepared ⇒ NEEDS PREP), `physicalSettingsFingerprint`,
  `physicalArtifactFingerprint` (source vs physical separation),
  `toPhysicalBoundsMm`.
- `src/studies/skin/rebuild/artifactExport.ts`: additive optional report
  fields `targetLongestMm`, `bodyScaleMmPerUnit`, `strutDiameterMm`,
  `supportDiameterMm`, `physicalBoundsMm {x,y,z,longest}`,
  `sourceFingerprint`, `artifactFingerprint`, `physicalSettingsFingerprint`.
- `src/studies/skin/main.ts`:
  - Stage 8 export step gains a Physical Output section (OUTPUT Overall
    Size + 80/120 presets that leave diameters untouched · STRUCTURE ·
    FABRICATION · status `Geometry/Support CURRENT/STALE · Export
    AVAILABLE/NEEDS PREP` · explicit `Prepare at N mm` / `Update Print
    Geometry` button that navigates to the Stage 3 rerun entry without
    auto-running anything). Section inputs drive the canonical controls
    (mesh size input via `input` event, strut/support inputs via `change`
    event) so all existing invalidate logic is reused. Restored FKEI values
    are synced in, never migrated.
  - Export snapshot records prepared-at physical settings + fingerprints;
    the report carries them top-level with `physicalBoundsMm` from the final
    mm positions. When support preparation is STALE, export falls back to
    BODY-only with an explicit warnings-dialog entry — old-diameter support
    is never shipped silently as current.
- NEW `src/studies/skin/rebuild/outputScale.test.ts`: 11 focused checks
  (overall ×1.5, motif/base proportion preserved, diameters fixed across
  80→120, target fixed across diameter changes, stale rule, no-silent-rerun
  report round-trip, FKEI 80 mm restore preserved, source-vs-artifact
  fingerprints, bounds fields, presets). Wired into `test:skin-rebuild`.

## Verification

- `outputScale.test.ts`: 11 checks pass.
- `tsc -b`, `typecheck:partition-test`, `npm run build`, `git diff --check`: pass.
- skin-rebuild suite: all pass except pre-existing base failures —
  `goldenOffsetBendRegression` (Windows-only fixture path, ENV) and four
  spider/migration fingerprint mismatches (identical on pristine base f4f3114).
- Browser gate: `vite preview` serves `skin-rebuild.html` (200,
  `data-skin-app="rebuild"`); bundle contains the new section. Interactive
  hit-testing (real-coordinate click / elementFromPoint, stages A–H) needs
  the author's browser — ENV BLOCKED here, no browser in this environment.

## FOLLOW-UP (out of scope, not fixed)

- Pre-existing spider/migration fingerprint mismatches on base (see above).
- `goldenOffsetBendRegression.test.ts` Windows-only path (macOS ENV BLOCKED).
- Interactive browser gate A–H incl. console 0 on the author's machine.
- Possible future split of Overall Size vs Motif Scale (explicit NON-GOAL here).
