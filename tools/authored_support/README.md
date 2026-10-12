# MINI_A authored Support replay

This package records the fixed MINI_A case and the source rules found in the
original builders. It does not use an LLM, network access, or an external
process. Importing it does not read or write files.

## Current result

The input identities and the complete golden kind/count ledger are pinned.
The generator is **HOLD**: the lower-support geometry rule and final A-side
data/override pass have been migrated and fixture-tested, but are not integrated
into a complete fixed-case pipeline. The 151-candidate V4 D2 stage, 14,536-object
V7 stage, 4,855-object A1 revision, and final A/F2 additions and patches are not
regenerated here. `build` records the exact missing stages and
does not read `GOLDEN.json`; it does not create `support_geometry.json` or
Support meshes. `replay` skips comparison when this build is held.

The old scripts are identified by path and SHA in
`presets/minia_legacy_v1/SOURCE_RULE_MAP.json`. They are not imported or run as
scripts because several perform top-level writes. The source input counts and
golden counts are evidence for identity and planning only, not regeneration.

The native 3MF reference and transform are locked for later comparison. This
version has not matched generated mesh arrays or native Support-part geometry.
It therefore cannot report `MINIA_AUTHORED_SUPPORT_PROGRAM_REPLAY_READY`.

## Local roots

Copy `ROOTS.local.example.json` to `work/ROOTS.local.json` and fill in the two
directory roots. `outputs` is the directory containing `R4_D6_SIZE_RHYTHM_V2`,
`R4_V2_INTERNAL_PROPOSAL_V3`, and the other named source folders. `success_package`
contains `MINIA_PLA_EDITABLE_REPACKED.3mf`. `geometry_runtime` is the pinned
NumPy/SciPy/manifold3d/trimesh runtime directory. The local roots file is not an
input identity and is not committed.

## Commands

Run from the repository root with Python 3.12.x:

```powershell
python -m tools.authored_support inspect `
  --case tools/authored_support/presets/minia_legacy_v1/CASE.json `
  --roots work/ROOTS.local.json `
  --out work/authored_support_inspect

python -m tools.authored_support build `
  --case tools/authored_support/presets/minia_legacy_v1/CASE.json `
  --roots work/ROOTS.local.json `
  --out work/authored_support_build

python -m tools.authored_support verify `
  --run work/authored_support_build `
  --golden tools/authored_support/presets/minia_legacy_v1/GOLDEN.json `
  --roots work/ROOTS.local.json `
  --out work/authored_support_verify

python -m tools.authored_support replay `
  --case tools/authored_support/presets/minia_legacy_v1/CASE.json `
  --golden tools/authored_support/presets/minia_legacy_v1/GOLDEN.json `
  --roots work/ROOTS.local.json `
  --out work/authored_support_replay
```

Each output directory must be new. Exit codes are 0 for a completed command, 2
for a known HOLD, and 1 for a command error. The current expected result of
`build` and `replay` is exit code 2. Tests use only the Python standard library:

```powershell
python -m unittest discover -s tools/authored_support/tests -v
```

The pinned geometry runtime observed in the source environment is Python 3.12,
NumPy 2.5.2, SciPy 1.18.1, manifold3d 3.5.2, and trimesh 5.1.0. The migrated
lower-support callable uses this runtime and checks its versions; other stages
remain unavailable.

To run the optional exact-kernel fixture test, set
`AUTHORED_SUPPORT_GEOMETRY_RUNTIME` to the same directory before running the
test command. Without it, that one test is skipped.

## Scope boundary

This is a fixed MINI_A software-replay task. It does not alter Flower,
Permanent, any existing package, or a print profile. It does not apply to
MINIL, slice, send, or print. The old `BODY_TO_BODY_TEMPORARY` records remain
historical evidence and are not promoted to a physical pass.
