"""Refresh only Issue #58's existing status front from the bounded handoff."""
from pathlib import Path

here = Path(__file__).resolve().parent
target = here.parents[1] / 'docs/status/MINIA_BLENDER_ADDON_CURRENT.md'
target.write_text('''# MINI_A Blender Add-on / Portable Workspace — CURRENT

Updated: 2026-10-10 JST. Blender editor portability only.

- Single authority: [Issue #58](https://github.com/satw-jp/katachi/issues/58) → [formal task](../tasks/MINIA_BLENDER_ADDON_PORTABILITY_V0.md).
- Decision owner / next gate: Author GUI acceptance. Astra fabrication lane is separate and untouched.
- Branch: `agent/minia-blender-addon-portability-v0`. Immutable archive: `c75d4b0adcf04b0ad8bde7810dc906e72c36e948`.
- State: **PASS_FOR_AUTHOR_GUI_REVIEW**. **STOP: MINIA_BLENDER_ADDON_INSTALLABLE_FOR_AUTHOR_GUI_REVIEW**.
- Publication/revision: [package CURRENT](../../tools/skin_branch_editor_addon/CURRENT.md), final handoff; unmerged Draft PR.
- Deliverable: installable addon 0.1.0, source/build, dependency manifest, restoration guide, parity matrix and small evidence: [README](../../tools/skin_branch_editor_addon/README.md).
- ZIP: `SKIN_BRANCH_EDITOR_0.1.0.zip`; SHA-256 `48d8aa43115ccfa8fa5d17d85a1fad75c8491afd131b88c7ed5ddeb604c6009d`; [Drive path](../../tools/skin_branch_editor_addon/DISTRIBUTION.json).
- Measured target: Windows / Blender 5.2.2 LTS `d13f752e3b9c`. Isolated install/lifecycle, synthetic/copy operations, fresh startup/reopen and second same-host relocation PASS. Archived/package kernel state, scoring, clip and semantic masks match.
- Preservation: source 352/352 and original Drive artifacts 55/55 SHA unchanged. RUN_007 read-only; checkpoint not resumed. Large data are not added to public GitHub.
- No blocker to installable GUI review. **UNVERIFIED:** real GUI/quad/native clip/picking/timer/shortcut behavior, another PC, cloud sync and companion Forms/Start/resume. See [RESULT/FOLLOW-UP](../../tools/skin_branch_editor_addon/RESULT.md).
- Red remains the old graph-distance/confluence heuristic, not strength/layerwise holding. Outer flower survival is the Author priority; internal red/roughness alone is not an automatic defect.
- Protected: no Astra changes, fabrication geometry/profile/package edits, STL/3MF/G-code, search/RUN_008 or production addon install. **slice=0 / Send=0 / Print=0**; OS GUI automation=0; main merge=0.
- Next Author operation: isolated GUI ZIP install → independent work copy → explicit PROJECT.json bind → [parity review](../../tools/skin_branch_editor_addon/LEGACY_BEHAVIOR_MATRIX.md). Stop before Author acceptance.
''', encoding='utf-8')
