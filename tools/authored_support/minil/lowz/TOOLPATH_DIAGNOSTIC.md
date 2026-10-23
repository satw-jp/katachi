# Saved LIGHT diagnostic

Entry point (new output directory required):

```text
python -m tools.authored_support.minil.lowz.toolpath.analyze --gcode SAVED.gcode --sha EXPECTED_SHA256 --out NEW_DIRECTORY
python -m unittest tools.authored_support.minil.lowz.toolpath.test_diagnostic tools.authored_support.minil.lowz.toolpath.test_fast -v
```

Use a separate environment with `requirements-toolpath.txt`. This does not
replace the existing geometry generator's NumPy/runtime. No printer, native
engine, geometry repair or Support generation is called.

The detector streams explicit native layers, dimensions and positive E moves.
G0/G1 and G2/G3 are supported in millimetres and the XY plane. Non-planar or
unbound extrusion semantics stop the run. Ambiguous residual unretraction
creates possible material only and remains UNKNOWN. Long commands become
ordered <=2 mm analytical spans; source line/span indices remain traceable.

Previous-layer and earlier same-layer round bead footprints are rasterized with
conservative inner/outer bounds. Width, grid-cell diagonal, arc approximation,
rounded arc radius mismatch and potentially unfilled retract prefix are included.
The 50% lower-bound threshold is a screening rule, not a manufacturing limit.
25/50/75% sensitivity is reported without tuning to reduce problem counts.

First-bed-layer material is rooted under an adhesion assumption. Floating and
ambiguous paths are never credited as healthy receivers. Vertical gaps retain
raw XY material but remove certified load-path credit; in particular the saved
raft gap can propagate UNKNOWN through later paths. UNKNOWN is not a print
failure and should not be added to confirmed unsupported counts.

Events are chronological extrusion paths, not proven independent CAD components
or flower counts. Four-layer persistence uses the union of the captured path's
nominal swept footprint; future material is not used to support an earlier event.
The 0.20 mm raw connectivity graph is a structural screening proxy, not a brace,
neck, ownership, buckling or physical removal certificate.

Results include per-span line evidence, height bins, path events, representative
paths, memory observations and input/code hashes. Source is hashed before and
after; code changes during a run invalidate it. Machine Z 0–50 mm is analyzed,
with four successor layers read. CAD mapping and current printer-job identity
are separate gates. See [demand interface](GCODE_DEMAND_INTERFACE.md).

Historical regression uses the hashed Candidate B motion cache and known-birth
reference, not a new slice or a LIGHT ID mapping. It tests the footprint decision
on four prior confirmed cases. Parser behavior is separately covered by synthetic
linear, arc, extrusion-mode and layer fixtures.
