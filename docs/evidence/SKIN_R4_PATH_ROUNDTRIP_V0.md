# SKIN_R4 Path Roundtrip v0 — Evidence

Date: 2026-09-18 JST

Branch: `agent/skin-r4-path-roundtrip-v0`

Reviewed PR head: `a7ef96f4915d8518c49cd8ba491deb9d2b30e0f3`

## Technical result

`TECHNICAL COMPLETE — SOL RE-REVIEW / AUTHOR WORKFLOW REVIEW PENDING`

The requested SOL changes were implemented on the existing PR branch. The
helper now handles actual Blender Subdivide-copied stable IDs using recorded
branch lineage, baseline edge endpoints, degree/connectivity, and coordinate
relation. Unresolved duplicates remain fail-closed as `AMBIGUOUS`.

## Focused checks

| check | result |
| --- | --- |
| focused Python fixture/unit tests | PASS — 18 tests |
| actual A1 Blender inspect → DELTA → IMPACT → explicit resolution → build-review → save → reopen → verify | PASS |
| baseline data versus baseline line blend geometry | PASS — 8606 vertices / 4411 edges |
| `BLENDER_ROUNDTRIP_VERIFY.json` | PASS |
| `git diff --check` | PASS |
| source/master/Support mutation | NONE |
| main merge / artwork promotion / hardware send | NONE |

The repository typecheck, production build, and study-test commands from the
prior checkpoint remain unchanged; this fix does not modify their protected
surface. They were rerun after this change as part of the final verification.

## Real A1 Blender gate

Authority inputs were the exact line-editor files, not the full master:

- baseline blend: `R4_A1_INTERNAL_PATH_EDITOR/blend/R4_A1_INTERNAL_PATHS_EDIT.blend`
- author edit: `R4_A1_INTERNAL_PATH_EDITOR/blend/R4_A1_INTERNAL_PATHS_EDIT_AS.blend`
- baseline data: `R4_A1_INTERNAL_PATH_EDITOR/data/PATH_BASELINE.json`
- baseline object: `INTERNAL_PATHS_EDIT__A1_100PCT`
- edit object: `INTERNAL_PATHS_EDIT__A1_100PCT.001`

The baseline data and baseline line blend were independently extracted and
matched in world millimetres. The edit extraction contained 8616 vertices and
4428 edges. The actual delta was:

```text
PATH_SUBDIVIDED   8
EDGE_ADDED        9
JUNCTION_CHANGED  7
LOOSE_VERTEX      1
AMBIGUOUS_MAPPING 0
UNSUPPORTED_INPUT 0
```

The eight actual `PATH_SUBDIVIDED` scopes matched the eight IDs in
`AUTHOR_INTENT.subdivided_core_paths`. The nine actual added edge indices
matched the nine `AUTHOR_INTENT.added_connectors` edge indices. The actual
loose record was `v:8615`, matching `ignored_loose_vertex.index = 8615`; it
was explicitly excluded from the resolution and was not materialized.

This comparison used the extracted edit delta and then compared its scopes to
the recorded intent. It did not claim correspondence by rereading intent
alone. The compact committed summary is
`SKIN_R4_PATH_ROUNDTRIP_V0_A1_ROUNDTRIP_2026-09-18.json`; the full run summary
was also recorded in `REAL_A1_CORRESPONDENCE.json`.

## Reopen verification

The review artifact was saved separately as `PATH_DELTA_REVIEW.blend` and
reopened with Blender. Reopen verification re-extracted the review object and
checked:

- object exists, is a face-less mesh, and records changed scopes;
- selected scopes match the actual edit topology and world coordinates;
- unselected scopes match baseline topology and world coordinates;
- `source_vertex_index` and `source_branch_index` are preserved;
- baseline object world transform/frame is preserved;
- all locked input hashes remain unchanged;
- neither original blend was overwritten.

All checks in `review/BLENDER_ROUNDTRIP_VERIFY.json` are `true`.

The run used explicit world extraction and world-to-baseline-local conversion
for review build. Transform acceptance is based on an invertible matrix, not
uniform scale or column lengths alone; determinant and column
orthogonality are recorded by the Blender adapter.

Recorded input hashes include:

```text
baseline_extract  c7d9d8f295e789640b83a5f95f443d469b8fcbc2eb604084f6f632e33d8b7bcd
baseline_blend    86ce3ed8e3e2576f5de2f04410d2076155f37b3fee3c1feff50ff48b0dbe9a5c
edit_blend        a3ee4ac59380c93b02d588d9e29427aafa6ea63ae3d9c583c8a4acf42bef04dc
```

The separately saved review blend produced by this run had SHA-256:

`35fd8350df2ea783a05776238a1f0f129fec9a10f3c685d6b40938f99730009c`

## Fixture identity coverage

- resolvable duplicate stable ID on a connected subdivision fixture;
- genuinely ambiguous duplicate stable ID remains fail-closed;
- face-bearing input remains unsupported;
- JSON rebuild and resolution checks remain covered;
- input locks, read-only resume, and no-mutation impact behavior remain covered.

## Protected scope

No V2 FLOWER, A/F2 artwork candidate, Permanent design, Support geometry,
slicer/G-code, Production/C/FKEI, physical print, generator, D0/D1/D2,
attachment generation, or small-region follow-up was changed or started.
A/F2 remained read-only. Original source inputs remain outside the repository
and were not overwritten.
