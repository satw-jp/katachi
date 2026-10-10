# MINI_A Blender Add-on / Portable Workspace — CURRENT

Updated: 2026-10-10 JST. **Non-fabrication-only task**.

## Authority / status

- GitHub Issue: [#58 — MINI_A Blender操作系のアドオン化・可搬復元 v0](https://github.com/satw-jp/katachi/issues/58) — **single execution entry**.
- Task: [MINIA_BLENDER_ADDON_PORTABILITY_V0](../tasks/MINIA_BLENDER_ADDON_PORTABILITY_V0.md).
- Decision owner: **Author**; bounded implementation: **new Sol**. Astra handles geometry/fabrication in a separate lane.
- Archive origin (immutable): `archive/minia-editor-optimizer-20261010` at `c75d4b0adcf04b0ad8bde7810dc906e72c36e948`.
- Task branch: `agent/minia-blender-addon-portability-v0` (created from archive origin).
- **Present state: READY FOR NEW SOL / IMPLEMENTATION NOT STARTED**. Task documents and Issue exist. This status does not claim an add-on ZIP, a portable GUI, or installation PASS.
- No Source/geometry/3MF/G-code/slice/Send/Print touched by documentation setup.

## Scope and exact evidence

Goal: turn Author's existing MINI_A Blender editing workflow into a reusable installable add-on/extension with a relocatable data-root / project binding, keeping a separate compatible Windows companion dashboard where necessary.

Read the **exact archived** README, USER_GUIDE, ARCHITECTURE, RESTORE, OPTIMIZER, HISTORY, SOURCE_SNAPSHOT, DRIVE_ARTIFACTS, ARCHIVE_CHECKS, RUN_SUMMARIES linked in the task. Archive metadata reports preserved runtime/tests but expressly **does not prove fresh GUI installation or bytewise full replay on another machine**. `.blend`, host and checkpoint data remain on Drive.

Current `MINIA_AUTO_100_RUN_007.blend` is retained read-only (200 added lines, LINK_LIMIT). Current red is an uncalibrated graph-distance heuristic, not physical strength or the earlier V2 layerwise holding-route metric. Author values **outer flower survival**; internal disorder and red are not automatically defects. **This task does not change the optimization algorithm or generate new branches.**

## Protected / blockers

- Astra's latest geometry, print job, print-ready package and acceptance are **out of scope**. Author reports Astra has handled print-data creation; no package audit or print authority is inferred here.
- Protect archive, old V1/V2, other branches and dirty/unpushed work, original blended data/host/cache/checkpoints, and all historical RUNs.
- `historical_work` scripts are for inspection only: do not execute old generators to rebuild the current environment.
- No new geometry, actual manufacturing mesh, support, STL/3MF/G-code, slice, preview print-ready certification, material/profile, printer, Send or Print. No automatic optimizer run/resume.
- This task must not install software into Author's live Blender/profile or use Computer Use without explicit permission. Tests use isolated copies and temporary Blender configuration. Author GUI acceptance stays separate.
- External Drive artifacts/licensing and absolute-path relocation need verification. Missing assets = explicit HOLD, not silent fallback.

## Next gate

New Sol reads [Issue #58](https://github.com/satw-jp/katachi/issues/58), implements only the linked task on the isolated branch, reports installable ZIP + manifest + restore guide + operation parity + test evidence as an unmerged Draft PR.

**Target STOP: `MINIA_BLENDER_ADDON_INSTALLABLE_FOR_AUTHOR_GUI_REVIEW`.**

Blocker STOP: `MINIA_BLENDER_ADDON_PORTABILITY_HOLD`.

Report tested Windows/Blender versions, software/GUI distinctions, paths/hashes, branch/HEAD/dirty, no original mutations and `slice=0, Send=0, Print=0`. Author decides actual GUI usability and later adoption.
