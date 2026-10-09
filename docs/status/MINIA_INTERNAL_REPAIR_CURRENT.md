# MINI_A internal repair — CURRENT

Updated: 2026-10-09 JST. Independent Author-requested lane.

## Authority / state

- Decision owner: Astra. Bounded implementation: LUNA. Artistic acceptance, Print GO and hardware operation: Author.
- Base: main `3437d964792ff717c2181cebfb84f8574c95eded`.
- Branch: `agent/minia-internal-repair-editor-v1`.
- State: SOURCE BINDING IN PROGRESS. No geometry change, editor release, slice, Send or Print.
- Task: [MINIA_INTERNAL_REPAIR_EDITOR_V1](../tasks/MINIA_INTERNAL_REPAIR_EDITOR_V1.md).
- Output root: `J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs`.

## Present evidence / blocker

The successful package's embedded G-code and the historical standalone run G-code have SHA-256 `b90c9037bf38a63ac852d77e7326c5cc99b605f0091cca19b1b68ba7dd561ad9`, 674,530,071 bytes. The editable candidate matches SHA-256 `2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736`, 946,468,919 bytes. Measured in this task.

Native import removed three source Artwork triangles. Existing records do not identify them by member. A bounded read-only comparison is investigating this gap before source binding is accepted. Historical Runner FAILED status is retained separately from the verified downstream G-code/package identity.

## Next gate

`MINIA_SUCCESSFUL_PRINT_SOURCE_BOUND` before any Editor construction. Then light Author Editor, fresh-process reopen and no-op/add-one verification. Stop at `MINIA_AUTHOR_INTERNAL_REPAIR_EDITOR_READY`; Author returns one edited region before any materialization/slice work.

## Protected scope

Successful MINIA originals; Flower/exterior/placement/scale; existing Permanent and authored Support; Issue #37 Removal Trial HOLD; Issue #38 PETG HOLD; LARGE physical HOLD; MINI_D HOLD; MINIL; dirty/unpushed worktrees; existing jobs. No other lane CURRENT is changed by this task. Geometry PASS is not physical strength PASS.
