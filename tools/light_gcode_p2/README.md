# Saved LIGHT G-code P2 — bounded diagnostic review

This is a read-only saved-toolpath diagnostic, not a Support generator or print approval.
The final gate is recorded in `P2_RESULT.md`. Do not infer success from a code file alone.

## Code lanes
- `p1/`: byte-identical P1 final code, derived from unpublished base HEAD `77ab6d20af86de423c50cd959139ea8e4bbc0352` plus the published P1 optimization patch.
- `p2_perf/`: only exact chronological UNKNOWN intersection screening is compiled; parser, coverage and cause-union policy remain P1.
- `p2/`: performance change plus version-scoped Bambu comment semantics and an **opt-in** independent polygon area refinement. Existing 42 tests continue to exercise the backward-compatible default; six added tests exercise the new policy and invariants.

Only `continuous_area.py`, `light_gcode_diagnostic.py`, `polygon_bounds.py`, and `test_p2.py` are P2 implementation changes/additions. Other copied P1 scripts are provenance/reference, not new features.

## Scope and proof limits
Input G-code SHA256 `3621f2f42bab5881d7a8dae1045337e0c32e950531261256ed3b7496d8be6744`.
LIGHT SHA256 `ecaa3527c26a6b608191cb4fac4f6d8db6d1c871be2b1adc62854d7f84266415`.
Machine coordinates only; current physical job and CAD/Flower/Support IDs remain unbound.
Capsule footprint coverage is a geometric screen, not an adhesion, raft air-gap, vibration, or physical-success certificate.
The independent polygon method uses inner/outer regular polygons and a documented floating-point area guard; it is not an arbitrary-precision geometry proof.

## Reproduction
Use Python 3.12.14 on Windows with `requirements.lock.txt`; `ENVIRONMENT.json` records the actual runtime and GEOS version.
The evidence ZIP includes the source-bound `PREFIX_200000.gcode`, input identity, three code lanes, and the observational harness.

```
python -m pip install -r requirements.lock.txt
python run_tests.py p2
python run_profile.py p1 5000 new_p1_5000
python run_profile.py p2_perf 5000 new_perf_5000
python run_profile.py p2 5000 new_p2_5000
```

`run_profile.py` creates a new output directory and never overwrites a run. It enforces the 300-second / 2GiB process budget and records the latest started/completed line and phase. `p2` explicitly enables `analyze_stream(..., geometry_mode='area_bounds_v2', independent_refinement=True)`; `p2_perf` does not.
Reproduction is documentation, not authorization to rerun beyond a reported budget STOP. Follow the task's staged gate. No full lower-50mm scan is included.

`CAUSES.jsonl` stores source line, subsegment index, class, cause-set hash, reason and area bounds. `ROOT_SETS.jsonl` stores every referenced full cause set, including the empty set. Hash interning is evidence compression, not root truncation. `EVENTS.jsonl` preserves canonical event IDs, source-arc intervals and lengths. Supported events are represented by the analyzer counts and segment log; the event sink emits its pre-existing demand subset.

The comparison script separates byte-equal performance results from intentional changes caused by independent area proof and verified producer semantics. Nested profile timers must not be added together.

No original geometry, original G-code, printer, PR #65/#67 code or V2 generator is changed. No Support generation, assembly, slice, Send, Print or merge. `print_go=false`.
