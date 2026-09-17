# SKIN_R4 Path Roundtrip v0

Date: 2026-09-17

Owner: SKIN_ABC_SOL / LUNAWORKER

Branch: `agent/skin-r4-path-roundtrip-v0`

State: `TECHNICAL COMPLETE — SOL REVIEW / AUTHOR WORKFLOW REVIEW PENDING`

## Bounded objective

Provide a reusable Research helper for an explicit Blender author edit:

`差分抽出 → 影響範囲 → 変更材だけ再構成 → 保存・再読込`

The helper is a read-only-first boundary. It locks explicit bytes, extracts
one explicit face-less line mesh, classifies graph/path changes, reports the
derived Support recheck scope, and materializes only a selected resolution into
a separate review artifact.

## Implemented surface

- `tools/skin_path_roundtrip/` — pure-Python policy plus an isolated headless
  Blender adapter;
- `inspect`, `build-review`, `verify`, and read-only `resume` commands;
- explicit prefix mapping in `roots.json`; no date/name fallback;
- stable attribute / unique-coordinate mapping with fail-closed ambiguity;
- `UNCHANGED`, `POINT_MOVED`, `PATH_SUBDIVIDED`, `PATH_REROUTED`,
  `EDGE_ADDED`, `EDGE_DELETED`, `JUNCTION_CHANGED`, `LOOSE_VERTEX`,
  `AMBIGUOUS_MAPPING`, and `UNSUPPORTED_INPUT` classifications;
- derived Support impact reasons without Support mutation;
- fixture/unit coverage T01–T17 for no-op, movement, subdivision, reroute,
  add/delete, ambiguous and unsupported input, stale hashes, impact, local
  rebuild, roundtrip, and resume;
- historical A1 manifest/example with the supplied recorded source hashes.

## Protected boundary

No Astra generator, source/master overwrite, actual radius, D0/D1/D2,
attachment generation, motif placement, Support repair, whole-flower or whole-
scene regeneration, STL/3MF/slice, Production/C/FKEI change, artwork choice,
physical transmission, or hardware action is performed.

The helper does not infer physical contact from line crossings, auto-weld,
invent a unique causal generation path, or turn a local geometry check into a
printability or physical-strength PASS.

## Inputs and authority

- repository: `satw-jp/katachi`
- base authority: `9f6c607100c25cdfc780377002839726fde044b8`
- historical regression root: `J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs`
- A/F2 latest preparation files were checked read-only only; no candidate was
  selected or repaired.

## Completion gate

Technical completion ends at:

`TECHNICAL COMPLETE — SOL REVIEW / AUTHOR WORKFLOW REVIEW PENDING`

This branch is not merged to `main`, does not promote an artwork master, and
does not send any data to a physical device. The small-region follow-up task is
not started.

See [`docs/evidence/SKIN_R4_PATH_ROUNDTRIP_V0.md`](../evidence/SKIN_R4_PATH_ROUNDTRIP_V0.md)
for executed test, smoke, protected-diff, and gate evidence.
