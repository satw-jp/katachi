# SKIN_R — Astra Research Reader v0 Fix 1

Date: 2026-09-08
Owner: Research SOL
Implementation worker: SKIN_R_LUNA
Status: READY

## Review target
Review checkpoint:
- branch: `agent/skin-r-astra-reader-v0`
- commit: `4dafd6b9421492a1dc939b67835c94209a2d5fc4`
- implementation base: `999b4eeb8e96c75dfe07cb9533a579399cb7e9f5`

The bounded Reader architecture is promising and Production-protected diff is still zero, but v0 is **FIX REQUIRED** before Author Gate.

## 1. Sync branch with current main without destroying history

At SOL review the branch had diverged from current `main`: it was 1 commit ahead and 6 commits behind, with merge base `999b4eeb...`.

Required:
1. `git fetch origin`.
2. Merge current `origin/main` into `agent/skin-r-astra-reader-v0` using a normal non-destructive merge. Do not reset, rebase, force-push, or rewrite the reviewed implementation commit.
3. Where the branch-local `docs/tasks/SKIN_R_ASTRA_READER_V0.md` conflicts with the authoritative main version, preserve the full main task as authority and update status/evidence separately.
4. Preserve unrelated main changes exactly.

## 2. Correct provenance semantics

The mandatory rule remains:
- `RECORDED` = explicitly present in authoritative Astra source data;
- `DERIVED` = reproducibly computed/interpreted from recorded data;
- `NOT RECORDED` = absent from source.

Do not mark Reader-authored explanatory strings as `RECORDED`.

Known review findings in `snapshot.ts`:

### 2.1 `addedStage`
`baseMember()` currently creates strings such as `OPEN core / inherited botanical core` and `surface growth` and marks them `RECORDED`.

These labels are Reader classification unless an exact historical source field records the stage. Mark them `DERIVED` or expose an exact source field instead.

In particular, participating-only cross-links must not be shown as recorded `surface growth` merely because they are not OPEN-core members.

### 2.2 junction `connectedMembers`
`buildJunctions()` constructs the member list by filtering source member ancestry. The resulting list is a Reader calculation and must be `DERIVED`, unless the source contains an explicit junction->member list that is used directly.

### 2.3 D2 `addedReason`
`supportMember()` currently hard-codes `external fabrication support` and labels it `RECORDED`, although the loaded D2 row schema has no `purpose/reason` field used by the adapter.

Use `NOT RECORDED` for an absent reason, or display an exact recorded field such as demand/removal/contact information separately. Do not convert layer identity into a historical reason.

### 2.4 Other synthesized role/stage labels
Audit every `RECORDED` badge in the normalized snapshot. If a value comes only from:
- array membership (`supports`, `braces`),
- Reader layer classification,
- candidate difference,
- OPEN membership test,
- calculated adjacency,
then label it `DERIVED` unless the source explicitly records the same semantic fact.

Preserve truly recorded fields such as attachment `parent_member_id`, `surface_component_id`, D1 `role`, D1 `purpose`, source counts, geometry, radii, and source hashes.

Add focused regression tests covering at least:
- one OPEN core member;
- one participating-only cross-link;
- one surface attachment;
- one D1 member;
- one D2 support member;
- one derived junction.

The tests must fail if the known synthesized explanation strings above are marked `RECORDED` again.

## 3. Restore the intended import boundary

The v0 task explicitly says large Research packages remain in Drive/external Research authority and should not be duplicated into GitHub.

The reviewed commit currently copies large source-shaped JSON files into `src/studies/skin/astra-reader/data/`, including approximately:
- `B_host.json` 3.43 MB;
- `B_surface_components.json` 2.22 MB;
- `B_OPEN_geometry.json` 1.93 MB;
- `B_PARTICIPATING_geometry.json` 2.02 MB;
- plus full D1/D2/attachment source dumps.

Do not keep the full Research source dumps as the runtime boundary.

Replace them with a **minimal deterministic Reader asset/snapshot** containing only fields actually needed by v0 rendering/selection. It may include the geometry required for the static browser route, but it must be a normalized derived Reader asset rather than a wholesale package copy.

Requirements:
- keep original package + copied-source SHA-256 values in a manifest;
- add/retain a deterministic adapter/extraction script or documented command that creates the minimal Reader asset from the authoritative external package;
- record output asset hashes;
- remove unused full-source payload/diagnostic fields from runtime assets;
- do not regenerate or simplify artwork geometry values merely to reduce size;
- keep Drive/package archives as the authority.

Small test fixtures may remain in GitHub.

## 4. Complete Browser Gate without broad UI redesign

The first browser smoke had a 315 px viewport and the fixed 360 px panel reduced the canvas to zero width.

Make only the bounded layout correction necessary to keep the 3D canvas non-zero at narrow widths (for example panel overlay/stack behavior). Do not redesign SKIN UI.

Then capture Browser evidence showing:
- B_OPEN visible in 3D;
- B_PARTICIPATING switched from the same camera;
- participating-only cross-links visibly differ;
- motif `Transparent` works;
- at least one real member selection shows provenance-qualified metadata.

This Browser Gate is technical evidence only. Final Author visual/value judgment remains Author Gate.

## Protected

Still do not implement:
- branch editing/generation;
- radius or attachment editing;
- junction movement;
- Save/Export;
- Production translation;
- G-code or print actions;
- C Production changes;
- FKEI schema or existing Viewer changes.

Production / C / FKEI / existing Viewer / Export / 3MF semantic diff must remain zero.

## Done / handoff

After Fix 1:
- push normally to the same branch;
- report new HEAD and merge relationship to current main;
- report minimal Reader asset files + original/output hashes;
- report corrected provenance examples for core/cross-link/attachment/D1/D2/junction;
- focused tests / study tests / typecheck / build;
- browser visual evidence;
- protected diff result;
- working-tree state;
- STOP for SOL / Author review.
