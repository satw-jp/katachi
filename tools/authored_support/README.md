# MINI_A authored Support replay V2

This fixed-case Python program regenerates authored removable Support from frozen Flower/Permanent inputs and source-bound rules. Normal execution uses no LLM, API or network. It writes isolated NPZ arrays and audit records, not STL, manufacturing 3MF, G-code or a print package.

The original V4 D2 result and commands are preserved. Full software replay is certified only when plan, array, native-part and execution tests all pass. See the dated execution result in `docs/status/` and its Drive evidence for the certification status of a specific commit/run.

## Inputs and runtime

Copy `ROOTS.local.example.json` to a private local file and map:

- `outputs`: the locked input tree, or a relocated copy containing all files identified by CASE, V4 input locks, Permanent mesh locks and source-rule locks.
- `geometry_runtime`: the pinned installed geometry libraries.
- `success_package`: the read-only successful MINI_A directory, needed for verification, not generation.

Runtime: Python 3.12.x, NumPy 2.5.2, SciPy 1.18.1, manifold3d 3.5.2, trimesh 5.1.0. No dependency download occurs at runtime. Empty/malformed expected SHA-256 values fail closed. Permanent member contents, source scripts, GOLDEN itself and its plan/native references are checked separately.

Geometry is generated in original source-world millimetres. MINI_A scaling is applied once through the native component/build chain during comparison. Old source dimensions are not MINIL print settings.

## Commands

Run from the repository root. Each output directory must be new and outside inputs, references and presets.

```powershell
python -B -m tools.authored_support inspect --roots work/ROOTS.local.json --out work/inspect_new
python -B -m tools.authored_support build --roots work/ROOTS.local.json --out work/build_new
python -B -m tools.authored_support verify --roots work/ROOTS.local.json --run work/build_new --out work/verify_new
python -B -m tools.authored_support replay --roots work/ROOTS.local.json --out work/replay_new
```

`--case` selects a copied fixed preset. `verify` and `replay` accept `--golden`. The default preset remains `presets/minia_legacy_v1` to preserve existing paths.

`build` never opens GOLDEN or archived completed Support. An audit guard rejects network/process execution, unpinned source reads, manufacturing references and source writes. A relocated build also rejects reads from the historical source tree. The local hostname query used by `platform` is not network traffic; an optional Windows-version subprocess probe is denied before launch and the library uses its local fallback.

Exit 0 means the command's contract succeeded. A successful build is only `GENERATED_PENDING_VERIFICATION`. Exit 2 is a known HOLD; exit 1 is a command error. Replay emits `MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_READY` only after independent verification. This is never a physical print PASS.

The bounded commands remain available:

```powershell
python -B -m tools.authored_support v4-d2 --roots work/ROOTS.local.json --out work/v4_new
python -B -m tools.authored_support v4-removal --roots work/ROOTS.local.json --generated-v4 work/v4_new --out work/removal_new
```

## Fixed lineage

1. Rebuild V4 geometry sections/mask and 151 D2 candidates.
2. Recalculate 150 removal steps, leaving `D2_112` blocked. This differs from the later V5 selection `RETAINED_LOW_D2=115`.
3. Regenerate V5 occupancy, routes, braces, meshes and access selection; then V6 fixed-Permanent occupancy, BODY-only rooted volume and selected IDs.
4. Generate V7 demands, external/BODY/outer routes, contact/access audits, anchor birth, scaffold, brace repair, feet and seven clearance corrections.
5. Apply original V8 topology normalization to newly generated Support. The two normalized Permanent representations are explicit frozen inputs.
6. Generate A1 lower reinforcement and A/F2 lower contacts/braces, checking both fixed Permanent variants as obstacles.
7. Recompute A-side compatibility/contact/main-end repairs. Remove `N00224` and `X03795` at their source-bound stages with expected-before checks. F2-only reconnection is not applied to A.
8. Apply only the historical-height ledger mutation from `package_review.py`. Its packaging, profile updates, legacy physical assertions and reports are not executed.

Python registers the callables; JSON strings are never evaluated as code. Original scripts are evidence, not imported executables. Their top-level effects have been scoped into isolated stage functions.

## Comparison contract

- Plan: exact ordered IDs, kinds, parameters, contact/anchor/path data and metadata, apart from identified execution-root paths.
- Source mesh: exact vertex/face array dtype, shape and bytes. NPZ ZIP timestamps/compression bytes are not geometric identity.
- Native Support: independently select the removable part and compare float32 oriented triangle multisets per Support ID after reproducing export/import conversions. Numerical tolerance is zero. Cyclic vertex starts and face order are irrelevant; winding and multiplicity remain significant. The successful native reorders two opposing coincident faces of `W01133`; source-world array equality remains a separate strict check.

Historical access, chronology and physical limitations remain historical. `current_material_min_z_mm` is a mesh bounding minimum, not a sliced first-layer or strength certificate.

## Outputs and tests

A build saves source/recipe/override records, stage evidence, final `support_geometry.json`, `support_mesh/`, array identities, decisions, validation and runtime audit. Its `lineage/` retains generated intermediates. Verification writes independent plan/mesh/native results. Existing runs are never reused as output directories.

```powershell
$env:AUTHORED_SUPPORT_GEOMETRY_RUNTIME = 'path/to/pinned/vendor'
python -B -m unittest discover -s tools/authored_support/tests -v
```

Certification supplies the pinned runtime and requires zero skipped tests. MINIL application, its additional 115 branches, Flower/Permanent changes, SuperTack/profile changes, slice, Send, Print and main merge are outside scope.
