# MINI_A Skin Branch Editor — CURRENT

- Authority: [Issue #58](https://github.com/satw-jp/katachi/issues/58) → [formal task](../../docs/tasks/MINIA_BLENDER_ADDON_PORTABILITY_V0.md).
- Decision owner / next gate: Author GUI acceptance.
- Branch: `agent/minia-blender-addon-portability-v0`; immutable archive `c75d4b0adcf04b0ad8bde7810dc906e72c36e948`.
- State: `PASS_FOR_AUTHOR_GUI_REVIEW`; **STOP: MINIA_BLENDER_ADDON_INSTALLABLE_FOR_AUTHOR_GUI_REVIEW**.
- Publication: [Draft PR #59](https://github.com/satw-jp/katachi/pull/59), unmerged; immutable archive base. Implementation/evidence revision: `9f13279b76d898aa5bf1cf1962cd68c23770bac1`. Final branch HEAD/dirty are reported in the handoff. Do not merge into archive or main at this gate.
- Package: `SKIN_BRANCH_EDITOR_0.1.0.zip`; SHA-256 `48d8aa43115ccfa8fa5d17d85a1fad75c8491afd131b88c7ed5ddeb604c6009d`; [Drive path](DISTRIBUTION.json).
- Evidence: [TEST_RESULTS](TEST_RESULTS.json), [RESULT](RESULT.md), [legacy matrix](LEGACY_BEHAVIOR_MATRIX.md), [install/restore](ADDON_INSTALL_AND_RESTORE.md), [dependencies](DEPENDENCY_MANIFEST.json).
- Blocker to installable review handoff: none in measured Windows / Blender 5.2.2 LTS. Real GUI, another PC, cloud sync and companion exploration remain UNVERIFIED / not executed.
- Preservation: 352 archived source and 55 original Drive hashes unchanged; RUN_007/checkpoint not edited/resumed.
- Protected: Astra lane, fabrication geometry, print package/profile, archive/originals and dirty work. `slice=0 / Send=0 / Print=0`, no search/RUN_008.
- Next Author action: isolated GUI install → explicit work-copy PROJECT.json bind → parity review. Stop here.
