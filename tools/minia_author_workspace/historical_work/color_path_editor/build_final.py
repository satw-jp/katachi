import bpy, sys, json, hashlib, time
from pathlib import Path

root = Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra')
out = root / 'outputs'
sys.path.insert(0, str(out / 'color_path_runtime'))
import color_path_runtime as runtime

started = time.perf_counter()
scene = bpy.context.scene
anchor_name = 'AUTHOR_EDIT_ALL • protected point baseline'
anchor = bpy.data.objects.get(anchor_name)
assert anchor and anchor.type == 'MESH'

# Remove old route-analysis presentation from this new editing view.
for cname in ('ROUTE_CLIPPED_CENTERLINES', 'ROUTE_COMPONENT_BBOXES', 'ROUTE_FAILURE_IMPACT',
              'ROUTE_OVERLAY', 'ROUTE_WITNESS_SCHEMATIC', 'ROUTE_HEIGHT',
              'WEAK_POINT_MARKERS • author adds only'):
    coll = bpy.data.collections.get(cname)
    if coll:
        for obj in list(coll.objects): bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(coll, do_unlink=True)

# Remove the earlier local demo labels; this file starts with no suggested repair.
for name in ('P1 • G0181 START', 'P2 • A3457 END'):
    obj = bpy.data.objects.get(name)
    if obj: bpy.data.objects.remove(obj, do_unlink=True)

# Retain all-anchor points as the only selectable edit target. The 24-point DEMO
# mesh remains available to the existing complete-source extractor but is hidden.
anchor.hide_select = False; anchor.hide_viewport = False; anchor.hide_render = False
for c in anchor.users_collection: c.hide_viewport = False; c.hide_render = False
demo = bpy.data.objects.get('AUTHOR_EDIT_DEMO • 24 endpoints, select two then F')
if demo:
    demo.hide_select = True; demo.hide_viewport = True; demo.hide_render = True
    for c in demo.users_collection: c.hide_viewport = True; c.hide_render = True

# Every source mesh and colored display curve is protected from selection.
for obj in bpy.data.objects:
    if obj == anchor: continue
    obj.hide_select = True
    if obj.get('source_reference') or obj.name.startswith('Support distance •') or obj.name.startswith('DISPLAY_ONLY'):
        obj.hide_select = True
    if obj.get('source_reference'):
        obj.hide_viewport = True; obj.hide_render = True

# Keep the global display curves visible, and create an empty dedicated intent layer.
display = bpy.data.collections.get(runtime.DISPLAY_COLLECTION)
assert display and len([o for o in display.objects if o.type == 'CURVE']) == 32
display.hide_viewport = False; display.hide_render = False
preview_coll = bpy.data.collections.get(runtime.PREVIEW_COLLECTION)
if preview_coll:
    for obj in list(preview_coll.objects): bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(preview_coll, do_unlink=True)

scene['color_finished_geometry_with_support_assumed'] = True
scene['color_heuristic_not_strength_or_safety'] = True
scene['color_map_state'] = 'STALE'
scene['color_map_stale_reason'] = '未更新: launcher起動後に色を更新してください'
scene['color_cache_sha256'] = runtime._sha(out / 'COLOR_PATH_GRAPH.json.gz')
scene['color_score_source_sha256'] = runtime._sha(out / 'SUPPORT_DISTANCE_COLORS.json')
scene['manufacturing_geometry_changed'] = False
scene['new_slice'] = 0; scene['send'] = 0; scene['print'] = 0

# Set a readable material-color viewport and keep the baseline point mesh as the
# active edit target for the dedicated launcher to enter vertex-select Edit Mode.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'SOLID'
            area.spaces.active.shading.color_type = 'MATERIAL'
            area.spaces.active.shading.light = 'FLAT'
            area.spaces.active.shading.background_type = 'VIEWPORT'
            area.spaces.active.shading.background_color = (.025, .035, .05)
            area.spaces.active.overlay.show_floor = True
            area.spaces.active.overlay.show_cursor = False

# Brighten the small legend against the darker, higher-contrast view.
legend_mat = bpy.data.materials.get('Support distance legend • dark text')
if legend_mat:
    legend_mat.diffuse_color = (.88, .93, 1.0, 1.0)
    legend_mat.use_nodes = True
    bsdf = legend_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (.88, .93, 1.0, 1.0)
        bsdf.inputs['Emission Color'].default_value = (.88, .93, 1.0, 1.0)
        bsdf.inputs['Emission Strength'].default_value = .35
if scene.world:
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (.025, .035, .05, 1.0)
        bg.inputs['Strength'].default_value = 1.0

for obj in bpy.context.selected_objects: obj.select_set(False)
anchor.select_set(True); bpy.context.view_layer.objects.active = anchor
scene['color_anchor_signature'] = runtime._anchor_signature()

# Recompute baseline once and require the score bins to match the frozen parent ledger.
result = runtime.update_colors(scene)
assert result.get('status') == 'CURRENT', result
baseline = json.loads((out / 'SUPPORT_DISTANCE_COLORS.json').read_text(encoding='utf-8-sig'))
expected_bins = {}
for seg in baseline['segments']:
    key = str(seg['color_bin']) if seg['color_bin'] is not None else 'gray'
    expected_bins[key] = expected_bins.get(key, 0) + 1
actual_bins = {}
for obj in bpy.data.collections[runtime.DISPLAY_COLLECTION].objects:
    if obj.type == 'CURVE' and obj.name.startswith('Support distance •'):
        key = 'gray' if int(obj.get('color_bin', -1)) < 0 else str(int(obj['color_bin']))
        actual_bins[key] = int(obj.get('segment_count', len(obj.data.splines)))
assert expected_bins == actual_bins, {'expected': expected_bins, 'actual': actual_bins}

scene['color_baseline_verified'] = True
scene['color_editor_palette'] = 'high-saturation green/yellow/red; bins and distance thresholds unchanged'
scene['color_map_state'] = 'CURRENT'
scene['color_anchor_signature'] = runtime._anchor_signature()
qa = {
    'status': 'BASELINE_BUILD_PASS', 'branch_count': len(set(s['branch_id'] for s in baseline['segments'])),
    'subsegment_count': result['segment_count'], 'color_bins': len(actual_bins),
    'baseline_bin_counts_match': True, 'author_edge_count': result['added_edge_count'],
    'protected_source_refs': sum(bool(o.get('source_reference')) for o in bpy.data.objects),
    'all_source_refs_hidden': all(o.hide_viewport and o.hide_render for o in bpy.data.objects if o.get('source_reference')),
    'manufacturing_geometry_changed': False, 'cache_sha256': scene['color_cache_sha256'],
    'score_sha256': scene['color_score_source_sha256'], 'elapsed_s': time.perf_counter() - started,
}
scene['color_build_qa_json'] = json.dumps(qa, ensure_ascii=False, separators=(',', ':'))

blend = out / 'MINIA_COLOR_PATH_EDITOR.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
(out / 'COLOR_PATH_EDITOR_BUILD_QA.json').write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding='utf-8')

preview = out / 'MINIA_COLOR_PATH_EDITOR_PREVIEW.png'
if scene.camera:
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 24
    scene.render.resolution_x = 1280; scene.render.resolution_y = 960; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(preview)
    bpy.ops.render.render(write_still=True)
print(json.dumps(qa, ensure_ascii=False), flush=True)
