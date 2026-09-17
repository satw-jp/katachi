# SKIN_R4 Path Roundtrip v0 — Evidence

Date: 2026-09-17 JST

Branch: `agent/skin-r4-path-roundtrip-v0`

Base: `9f6c607100c25cdfc780377002839726fde044b8`

## Technical result

`TECHNICAL COMPLETE — SOL REVIEW / AUTHOR WORKFLOW REVIEW PENDING`

The implementation is in `tools/skin_path_roundtrip/`. The pure-Python core
is independent of Blender, while the Blender adapter is restricted to one
explicit face-less mesh and a separate output `.blend`.

## Commands and results

| check | result |
| --- | --- |
| 17 focused fixture/unit tests | PASS |
| Python syntax compilation (`compileall`) | PASS |
| historical A1 input lock smoke | PASS for all declared hashes |
| historical A1 `.blend` extraction | BLOCKED / Blender executable unavailable |
| historical A1 `AUTHOR_INTENT` audit | PASS — 8 subdivisions + 9 connectors + ignored loose vertex; endpoint max deviation `6.151753783064629e-06 mm` |
| A/F2 read-only data no-op inspect/build/verify | PASS for A and F2; `UNCHANGED`; temporary review copies only |
| repository TypeScript typecheck (`tsc -b`) | PASS |
| repository production build | PASS |
| study tests | PASS — 19 tests via equivalent `tsx` loader with environment-only `os.userInfo()` shim |
| `git diff --check` | PASS |
| source/master/Support mutation | NONE |
| main merge / artwork promotion / hardware send | NONE |

The A1 smoke resolves the exact supplied Drive root through
`examples/roots.example.json` and verifies the recorded hashes, including
`R4_A1_INTERNAL_PATHS_EDIT_AS.blend`:

`a3ee4ac59380c93b02d588d9e29427aafa6ea63ae3d9c583c8a4acf42bef04dc`

The environment has no `blender` executable. Therefore the real `.blend`
extraction/save/reload stage is explicitly `UNSUPPORTED_INPUT` rather than
claimed as executed. The A1 run has `INPUT_LOCK` PASS and records blocked
`EXTRACT` / `DELTA` / `IMPACT` artifacts plus a read-only `resume` checkpoint.
Fixture JSON performs the same pure-policy inspect → resolution → review →
verify → resume roundtrip in a separate temporary directory.

## Fixture coverage

- T01 no-op / `UNCHANGED`;
- T02 local point move;
- T03 subdivision remains the recorded branch, not a new branch;
- T04 reroute without array-order identity;
- T05 branch add/delete separation;
- T06 ambiguous stable identity fail-closed;
- T07 face-bearing mesh unsupported;
- T08 derived Support impact and no mutation;
- T09 changed member materialization with preserved member;
- T10 stale resolution hash;
- T11 explicit input lock hash;
- T12 baseline normalization;
- T13 complete JSON roundtrip and read-only resume;
- T14 declared hash mismatch before extraction;
- T15 ambiguous run cannot build review;
- T16 unmapped absolute prefix;
- T17 unknown resolution operation.

## State boundary

- `tool_execution`: helper and artifact execution only;
- `mapping`: stable identity proof, or `AMBIGUOUS` / `UNSUPPORTED`;
- `geometry_check`: local line-mesh/review check only;
- `support_validity`: `NOT_REVALIDATED`;
- `printability`: `NOT_EVALUATED`;
- `author_acceptance`: `PENDING`.

No Support geometry is changed or validated. No physical strength or print
success is inferred. `npm ci` reported eight pre-existing dependency audit
findings; dependency upgrades are outside this bounded task and were not
performed.

## Read-only A/F2 boundary

The exact A/F2 preparation `structure.json`, `support_geometry.json`, and
`.blend` paths were confirmed present and hashed. They were not selected as an
artwork candidate, opened for authoring, regenerated, repaired, or written.
The JSON no-op smoke uses temporary copies only to exercise the lock/diff
policy; it is not an A/F2 approval.

## Protected diff review

The only repository changes are the new bounded helper, its fixtures/tests,
the task/evidence records, and a minimal SKIN_ABC pointer. No files under the
existing Astra reader or Production/C/FKEI implementation were changed.
