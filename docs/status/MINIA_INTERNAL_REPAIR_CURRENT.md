# MINI_A internal repair — CURRENT

Updated: 2026-10-09 JST. Independent Author-requested lane.

## Authority / state

- Decision owner: Astra. Bounded implementation: LUNA. Artistic acceptance, Print GO and hardware operation: Author.
- Base: main `3437d964792ff717c2181cebfb84f8574c95eded`.
- Branch: `agent/minia-internal-repair-editor-v1`.
- State: basic V1 delivered at `MINIA_AUTHOR_INTERNAL_REPAIR_EDITOR_READY`; source binding passed. V2 is now `MINIA_LAYERWISE_ROUTE_VISUALIZER_READY_FOR_AUTHOR_REVIEW` after Astra review round2 / one fix cycle. Author GUI and physical acceptance remain unverified. No manufacturing geometry change, new slice, Send or Print.
- Task: [MINIA_INTERNAL_REPAIR_EDITOR_V1](../tasks/MINIA_INTERNAL_REPAIR_EDITOR_V1.md).
- Output root: `J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs`.

## Present evidence / blocker

The successful package's embedded G-code and the historical standalone run G-code have SHA-256 `b90c9037bf38a63ac852d77e7326c5cc99b605f0091cca19b1b68ba7dd561ad9`, 674,530,071 bytes. The editable candidate matches SHA-256 `2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736`, 946,468,919 bytes. Measured in this task.

Complete read-only STL/native comparison explains the three-face difference: near-zero-area faces from A2071, A3802 and A0044 were omitted and replaced in order by three regular GJ036 tail faces. `NATIVE_FACE_REMAP.json` records the explicit mapping and 1e-5 mm coordinate tolerance. 9,421 Permanent source records are bound (4,240 original + 3 LR + 5,178 frozen roots). Recorded repack provenance and matching locks are accepted for this editing gate; no new bytewise native-versus-repacked object_1 prefix comparison is claimed. Original repacked geometry remains immutable. Historical Runner FAILED status is retained separately from verified downstream G-code/package identity.

Additional scoped evidence: 18 selected source meshes (including five Support meshes) around F3457/G0181, including six roots, have contact and height-clipped component measurements over model/plate Z 0–156 mm at 0.2 mm intervals. A3457 has two separated components at Z 43.2/44.0 mm. Three historical G-code event commands/layer heights match; bed-rooted toolpath ancestry and the assumed +0.6 mm raft mapping remain unverified.

Backend tests cover 15 synthetic fixtures, eight real mixed-graph cases, isolated source/contact invalidation and TEST_ONLY branch/height-event comparisons. At 43.2 mm the selected model geometry has two Support-dependent routes under bearing assumptions; Permanent-only supplied graph count is 0, which is not an actual-material zero. At 45 mm the supplied counts are 3+ / 1, and Permanent-only common branches are A3457/C0016/G0181/R0001. Conditional graph event search estimates one-route dependency from 44.6–156 mm; the TEST_ONLY local addition brings its onset to 43.2 mm but does not create a second global route. Graph completeness and physical strength remain unresolved.

## Next gate

Basic V1 was delivered promptly after no-op, demo/global one-addition, deduplication and protected-reference checks, with fresh-process reopening. Its artifact is frozen; V2 is a new .blend.

Author added `MINIA_LAYERWISE_HOLDING_ROUTE_VISUALIZATION` in this same lane. V2 UI/STALE/save-reload checks, fresh delivered bootstrap and measured runtime passed; stop at `MINIA_LAYERWISE_ROUTE_VISUALIZER_READY_FOR_AUTHOR_REVIEW`. See the task DoD and output `ROUTE_MODEL_AND_LIMITATIONS.md`. This is not authorization for materialization, new slicing or hardware operations. GUI Computer Use is not authorized; Author GUI usability and physical strength are separate unverified gates.

Implementation: [bounded runtime](../../tools/minia_internal_repair/README.md). Evidence: [source binding](../evidence/minia_internal_repair/SOURCE_BINDING.json), [basic review](../evidence/minia_internal_repair/EDITOR_REVIEW.json), [route scope](../evidence/minia_internal_repair/ROUTE_MODEL_AND_LIMITATIONS.md). Large .blend, preview and height-cache files remain in the output root; their hashes are recorded in [Drive artifact index](../evidence/minia_internal_repair/DRIVE_ARTIFACT_HASHES.json).

## Protected scope

Successful MINIA originals; Flower/exterior/placement/scale; existing Permanent and authored Support; Issue #37 Removal Trial HOLD; Issue #38 PETG HOLD; LARGE physical HOLD; MINI_D HOLD; MINIL; dirty/unpushed worktrees; existing jobs. No other lane CURRENT is changed by this task. Geometry PASS is not physical strength PASS.

Final handoff: [RESULT](../evidence/minia_internal_repair/RESULT.md), [TEST_RESULTS](../evidence/minia_internal_repair/TEST_RESULTS.json), [Astra review](../evidence/minia_internal_repair/DECISION_OWNER_REVIEW.json). Next action is Author GUI review and a saved edit, not materialization or printing.
