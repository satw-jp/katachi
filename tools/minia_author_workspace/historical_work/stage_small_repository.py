import pathlib,shutil,json,hashlib
R=pathlib.Path(__file__).resolve().parent.parent;O=R/'outputs';repo=R/'work/katachi-minia-repair'
dest=repo/'tools/minia_internal_repair';dest.mkdir(parents=True,exist_ok=True)
evidence=repo/'docs/evidence/minia_internal_repair';evidence.mkdir(parents=True,exist_ok=True)
for name in ['route_analysis.py','real_graph.py','test_route_analysis.py']:
    shutil.copy2(R/'work/route_visualizer'/name,dest/name)
for name in ['MINIA_EXTRACT_EDIT_DELTA.py','MINIA_ROUTE_BOOTSTRAP.py','MINIA_ROUTE_PANEL.py']:
    if (O/name).exists():shutil.copy2(O/name,dest/name)
for name in ['route_v2_panel.py','route_overlay.py']:
    if (O/'route_runtime'/name).exists():shutil.copy2(O/'route_runtime'/name,dest/name)
build=dest/'provenance_scripts';build.mkdir(exist_ok=True)
for p in [R/'work/luna_editor/build_editor_v3.py',R/'work/luna_editor/refine_preview.py',R/'work/selected_contact_geometry.py',R/'work/measure_permanent_base.py',R/'work/verify_selected_gcode.py',R/'work/luna_binding/suffix_crosswalk_v6.py',R/'work/luna_binding/mismatch_tail_probe_detailed.py',R/'work/luna_binding/write_alias_repack_evidence.py']:
    if p.exists():shutil.copy2(p,build/p.name)
names=['SOURCE_BINDING.json','NATIVE_FACE_REMAP.json','NATIVE_FACE_CROSSWALK_PREFIX.json','NATIVE_SUFFIX_CROSSWALK.json','SOURCE_ALIAS_AND_REPACK_EVIDENCE.json','TRANSFORM_AND_REFERENCE_LOCKS.json','EDITOR_REVIEW.json','EDITOR_BUILD_MANIFEST.json','EDITOR_FRESH_OPEN_QA.json','NOOP_ROUNDTRIP.json','TEST_ADDITION_ROUNDTRIP.json','GLOBAL_ADDITION_ROUNDTRIP.json','DUAL_LAYER_DEDUP_TEST.json','MOVE_DETECTION_TEST.json','DELETE_DETECTION_TEST.json','REFERENCE_MUTATION_TEST.json','ROUTE_ENGINE_TEST_RESULTS.json','ROUTE_RUNTIME_LOCK_TEST.json','REAL_GRAPH_VALIDATION.json','HEIGHT_EVENT_COMPARISON_TEST.json','ROUTE_ANALYSIS.json','SELECTED_GEOMETRY_CONTACTS.json','PERMANENT_BASE_EVIDENCE.json','GCODE_SELECTED_EVENT_CHECK.json','ROUTE_RUNTIME_MANIFEST.json','ROUTE_MODEL_AND_LIMITATIONS.md','EDIT_TO_PRINT_PIPELINE.md','AUTHOR_GUIDE.md','TEST_RESULTS.json','RESULT.md']
for name in names:
    if (O/name).exists():shutil.copy2(O/name,evidence/name)
for p in O.iterdir():
    if p.is_file() and (p.name.startswith(('MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_','V2_')) and p.suffix=='.json' or p.name in ('PRESERVED_INPUTS_FINAL_CHECK.json','LAUNCHER_CHECK.json','DECISION_OWNER_REVIEW.json')):
        shutil.copy2(p,evidence/p.name)
for p in (R/'work/luna_visualizer').glob('*.py'):
    if any(word in p.name for word in ['validate','fresh','render','bake','transition','benchmark']):shutil.copy2(p,build/p.name)
manifest={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in O.iterdir() if p.is_file() and p.suffix in ('.blend','.png','.lnk') or p.name=='SELECTED_GEOMETRY_HEIGHT_CACHE.json'}
(evidence/'DRIVE_ARTIFACT_HASHES.json').write_text(json.dumps({'artifact_root':str(O),'artifacts':manifest},indent=2))
(dest/'requirements.txt').write_text('networkx==3.6.1\n',encoding='utf-8')
(dest/'README.md').write_text('''# MINI_A internal repair / holding-route review

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
''',encoding='utf-8')
print('Small source/evidence copied; final UI files will be staged after review.')
