# SKIN_R4 Path Roundtrip v0

This is a bounded Research helper for an explicitly selected, face-less
Blender line mesh. It makes the author workflow repeatable:

`差分抽出 → 影響範囲 → 変更材だけ再構成 → 保存・再読込`

The helper does not choose artwork, repair Support, regenerate flowers, or
promote an output to Production. Input paths are resolved only through the
declared `roots.json` mapping and are SHA-256 locked before extraction.

## Commands

```text
python -m tools.skin_path_roundtrip inspect --manifest manifest.json --edit author_edit.blend --roots roots.json --out run
python -m tools.skin_path_roundtrip build-review --run run --resolution resolution.json
python -m tools.skin_path_roundtrip verify --run run
python -m tools.skin_path_roundtrip resume --run run
```

`--edit` is optional when the manifest already contains an `edit_blend` input.
`--blender C:\\path\\to\\blender.exe` may be supplied when Blender is not on
`PATH`.

## Explicit input contract

The manifest must declare `schema_version: "1.0"`, candidate/baseline IDs,
the frame (`A1_MASTER_MM`, millimetres), explicit unique baseline/edit object
names, and every input file with its role and expected hash where known.
`roots.json` contains prefix-to-local-root mappings; there is no filename/date
fallback. A stale hash, unmapped absolute path, non-unique object, singular
transform, curve, or face-bearing mesh fails closed. Invertible non-uniform or
sheared transforms are supported by explicit world extraction and
world-to-baseline-local review conversion; frame diagnostics record the
determinant and column orthogonality.

The Blender adapter extracts world coordinates and supported mesh attributes
only. The pure-Python mapper uses explicit stable vertex attributes first and
unique coordinate matches only as a bounded fallback. Blender Subdivide-copied
IDs are accepted only when branch lineage, baseline edge endpoints,
degree/connectivity, and coordinate relation prove the derived point; other
duplicates remain `AMBIGUOUS`. It never uses `.001` names or array order as
identity, auto-welds crossing lines, or forces a graph back into a tree.

## Artifacts

- `INPUT_LOCK.json` — resolved paths, hashes, and authority roles.
- `EXTRACT.json` — baseline/edit normalized line-mesh extraction.
- `DELTA.json` — change classes including `POINT_MOVED`, `PATH_SUBDIVIDED`,
  `PATH_REROUTED`, `EDGE_ADDED`, `EDGE_DELETED`, `JUNCTION_CHANGED`,
  `LOOSE_VERTEX`, `AMBIGUOUS_MAPPING`, and `UNSUPPORTED_INPUT`.
- `IMPACT.json` — derived Support impact (`ANCHOR_CHANGED`, `TARGET_CHANGED`,
  `TARGET_DELETED`, `SPATIAL_RECHECK`, `CHRONOLOGY_STALE`,
  `EVIDENCE_STALE`, `UNKNOWN_SCOPE`) without Support mutation.
- `review/` — JSON forensic review for fixture/data inputs, or a separate
  `PATH_DELTA_REVIEW.blend` when headless Blender is available.
- `review/BLENDER_ROUNDTRIP_VERIFY.json` — reopened extraction comparison for
  selected edit scopes, preserved baseline scopes, source attributes, frame,
  and locked inputs.
- `VERIFY.json` / `RESUME.json` — lock, local review, and continuation state.

The output states are intentionally separate: `tool_execution`, `mapping`,
`geometry_check`, `support_validity`, `printability`, and
`author_acceptance`. The last three cannot become a physical or author PASS in
this helper.

## Examples

- `examples/r4_a1_manifest.json` locks the historical A1 path-editor inputs
  from the supplied R4 authority root and pairs the baseline line blend with
  its explicit `.001` author-edit object.
- `examples/roots.example.json` maps that historical absolute prefix to a
  local Drive root without changing the declared relative paths.
