# MINI_A internal repair / holding-route review

Bounded Author editing and analysis lane. The manufactured baseline, old G-code, other lanes and physical gates remain unchanged. See ../../docs/status/MINIA_INTERNAL_REPAIR_CURRENT.md and ../../docs/tasks/MINIA_INTERNAL_REPAIR_EDITOR_V1.md.

## Runtime and focused tests

Use Python 3.12/3.13 and NetworkX 3.6.1. From this directory, `python -m unittest test_route_analysis -v` runs 15 focused graph fixtures without loading the artwork. They do not test physical strength or the Author GUI.

`real_graph.Context(output_root)` reads the delivered SOURCE_BINDING.json, TRANSFORM_AND_REFERENCE_LOCKS.json and SELECTED_GEOMETRY_HEIGHT_CACHE.json, then SHA-checks the existing source JSONs at their bound local paths. The height cache and .blend remain in the Drive output directory named by DRIVE_ARTIFACT_HASHES.json. Copy the runtime scripts beside the delivered bootstrap as described in AUTHOR_GUIDE.md; no global Blender trust changes are required. The delivered runtime includes a local NetworkX ZIP and its BSD license. Git does not contain the source artwork, Blender binaries or third-party package.

`Context.evaluate(43.2, "PRINTING_WITH_SUPPORT")` evaluates the input graph at transformed model/plate Z. `height_events(mode, edits)` is an explicit conditional event search; do not invoke it from a slider callback. It assumes monotonic graph connectivity after F3457 becomes a stable single component. Source or contact changes invalidate an existing context. The analysis result separates graph counts, limited geometry witnesses and unresolved physical contact completeness.

For a saved Author file, run Blender in background with MINIA_EXTRACT_EDIT_DELTA.py and pass the desired JSON output after `--`. It compares protected anchors/reference geometry and extracts added edge IDs; it never materializes additions or exports manufacturing geometry. TEST_ONLY files belong outside the Author candidate.

## Reproduction scope

The provenance_scripts folder retains the bounded builders and selected geometry/G-code inspection scripts used for this machine-local lane. They contain explicit source paths and output locations; inspect and redirect to a new scratch destination before rerunning. Never rerun them against the frozen delivered V1 or successful print originals. Source/geometry scans require their original STL/native maps and, for contact geometry, the existing manifold3d/numpy runtime. No source inputs are fetched or regenerated automatically.

Evidence files record the accepted source binding, face remap and exact limitations. Rebuilding a .blend is not guaranteed byte-identical because Blender serialization and preview state are variable. Compare semantic ledger/anchor/reference identities and measured output hashes. The recorded Runner FAILED result is retained separately from the matching downstream G-code and final package.

No slice, Send, Print, GUI Computer Use or physical acceptance is part of this implementation.

Drive hashes describe the delivered files, including their line endings. Git copies normalize trailing blank lines and may use checkout-specific line endings.
