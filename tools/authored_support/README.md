# MINI_A authored Support replay

This offline Python package records the fixed MINI_A case and extracts its
legacy Support rules. It does not call an LLM, use network access, or execute a
legacy builder during import.

## Current result

**Limited V4 D2 result: `MINIA_AUTHORED_SUPPORT_V4_D2_REPLAY_READY_FOR_REVIEW`.**
The registered Python stage rebuilt the V4 vertical first-material mask from
frozen V2/V3 geometry inputs, generated 151 D2 candidates, and matched the
saved candidate records and exact mesh vertex/face arrays. All 157 saved D2
rejection records and reasons matched. The saved 150-item removal sequence
plus its one blocked ID was checked as a read-only checkpoint; its builder was
not run. The source inputs and saved checkpoints remained unchanged.

This is not complete MINI_A Support replay readiness. V7, A1, A/F2 integration,
native Support-part binding, and full plan/mesh/native comparison remain held.
The registered stage is bounded and does not open the full pipeline gate.

The V4 source scripts are identified and hash-locked in
`presets/minia_legacy_v1/SOURCE_RULE_MAP.json`. They are not imported or run as
scripts because they perform top-level writes. The D2 stage rebuilds the
vertical mask from the pinned V2/V3 mesh and birth inputs into its isolated
output directory. `V4_D2_CHECKPOINT_LOCK.json` and all files it identifies are
used only after generation for comparison.

## Local roots

Copy `ROOTS.local.example.json` to `work/ROOTS.local.json` and set the
`outputs`, `success_package`, and `geometry_runtime` paths. `outputs` contains
the named V2/V3/V4 source folders. The local roots file is not committed.

## Limited V4 D2 command

Run from the repository root with Python 3.12.x and the pinned geometry
runtime configured:

```powershell
python -m tools.authored_support v4-d2 `
  --case tools/authored_support/presets/minia_legacy_v1/CASE.json `
  --roots work/ROOTS.local.json `
  --out work/v4_d2_replay_YYYYMMDD
```

The output directory must be new and outside the frozen source `outputs`
directory. Generation does not read saved V4 D2 records, meshes, the saved
vertical mask, or the removal sequence. It records generated candidates,
selection traces, meshes, source hashes, checkpoint comparisons, and the
limited STOP in the output directory. Exact mesh comparison covers array dtype,
shape, and bytes; it does not require matching ZIP archive bytes.

## Other commands

The broader `inspect`, `build`, `verify`, and `replay` commands remain
fail-closed while the complete MINI_A generator is unavailable. They do not
claim full replay readiness.

Each output directory must be new. Exit codes are 0 for a passed limited
stage, 2 for a known HOLD, and 1 for a command error. Run the standard-library
tests with:

```powershell
python -m unittest discover -s tools/authored_support/tests -v
```

The optional exact-kernel lower-support fixture test is skipped unless
`AUTHORED_SUPPORT_GEOMETRY_RUNTIME` points to the pinned runtime directory.

## Scope boundary

This is a fixed MINI_A software-replay task. It does not alter Flower,
Permanent, any existing package, or a print profile. V7 and later stages,
MINIL application, slice, Send, and Print are not part of the V4 D2 command.
Historical Support records and removal notes are not promoted to a physical
pass.

