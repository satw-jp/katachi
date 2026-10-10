"""Archived vs packaged kernels on independent work copies; no optimizer or original edits."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
import time
import traceback
import bpy
import addon_utils
import bmesh
sys.path.insert(0, str(Path(__file__).parent))
from test_support import peak_working_set

p = argparse.ArgumentParser()
p.add_argument('--evidence', type=Path, required=True)
p.add_argument('--oracle', action='store_true')
p.add_argument('--attempt', default='2')
args = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = args.evidence.resolve()
data = root / 'relocated data/outputs'
label = 'LEGACY' if args.oracle else 'ADDON'
result = {'mode': label, 'status': 'FAIL', 'gui_acceptance': 'UNVERIFIED', 'cases': [], 'performance_seconds': {}}

def check(name, condition, **details):
    result['cases'].append({'name': name, 'pass': bool(condition), **details})
    assert condition, name

def timed(name, fn):
    t = time.perf_counter()
    out = fn()
    result['performance_seconds'][name] = time.perf_counter() - t
    return out

def signature(mp):
    state = mp.scan_state(bpy.context.scene, False)
    payload = {k: state[k] for k in ('id_to_pos', 'roots', 'edge_rows', 'mid_records')}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()

try:
    for kind, folder in [('CONFIG', 'config-test'), ('SCRIPTS', 'scripts-test'), ('EXTENSIONS', 'extensions-test')]:
        assert Path(bpy.utils.user_resource(kind)).resolve() == root / folder
    bpy.ops.preferences.addon_install(filepath=str(root / 'SKIN_BRANCH_EDITOR_0.1.0.zip'), overwrite=True)
    addon_utils.modules_refresh()
    addon = addon_utils.enable('skin_branch_editor', default_set=True, persistent=True)
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    # Two independent copies of the same hashed baseline. Generated test manifest never touches source.
    manifest = json.loads((data / 'PROJECT.json').read_text(encoding='utf-8'))
    work = data / ('TEST_' + label + '_' + args.attempt + '.blend')
    assert not work.exists(), 'refusing to overwrite operation test output'
    shutil.copyfile(data / manifest['files']['MINIA_LOWER70_BRANCHING_REVIEW.blend']['path'], work)
    manifest['work_file'] = work.name
    pointer = data / ('PROJECT_' + label + '_' + args.attempt + '.json')
    pointer.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    if args.oracle:
        original = Path(__file__).resolve().parents[1] / 'minia_author_workspace/outputs'
        # Only loader paths differ; every action calls the archived kernel from fixed source.
        addon.session.ORDER = tuple((name, str(original / relative)) for name, relative in addon.session.ORDER)
    bpy.ops.wm.open_mainfile(filepath=str(work), load_ui=False, use_scripts=False)
    addon.finish_pending_load_for_test()
    timed('bind', lambda: addon.bind(pointer))
    m = addon._SESSION.modules
    mp = m['midpoint_runtime']
    obj = bpy.data.objects[mp.ANCHOR]
    d = m['interval_delete']
    scene = bpy.context.scene
    state = timed('initial_scan', lambda: mp.scan_state(scene, False))
    before_refs = json.loads(scene['source_reference_fingerprints'])
    rows = d.catalog(state)
    source = next((i, seg) for i, seg in enumerate(state['cache']['segments'])
                  if seg['branch_id'] not in d.protection(scene)[0]
                  and not d.source_deleted(scene, state['cache'], i, .431)
                  and mp._source_mid_id(i, .431) not in state['id_to_pos'])
    i, seg = source
    sid = mp._add_point_to_bmesh(state, {'kind': 'source_segment', 'segment_index': i, 't': .431,
                                       'position': mp._interp(seg['a'], seg['b'], .431)})
    check('source_midpoint_provenance', sid.startswith('SMID:'))
    state = mp.scan_state(scene, True)
    bm = state['bm']
    bm.verts.ensure_lookup_table()
    # Select two actual base points, distinct from existing logical graph edges.
    graph, _ = mp._graph_state(state)
    vertices = [v for v in bm.verts if state['verts_by_index'][v.index]['anchor_index'] >= 0]
    pair = None
    for a in vertices[:50]:
        aid = state['id_by_index'][a.index]
        for b in vertices[50:500]:
            bid = state['id_by_index'][b.index]
            distance = (a.co - b.co).length
            if 10.1 < distance < 15. and not graph.has_edge(state['cache']['anchors'][aid], state['cache']['anchors'][bid]):
                pair = a, b
                break
        if pair:
            break
    assert pair
    for v in bm.verts:
        v.select_set(v in pair)
    bmesh.update_edit_mesh(obj.data, loop_triangles=False, destructive=False)
    before_n = len(bm.verts)
    check('copy_F_creates_edge_no_autopoint', 'FINISHED' in bpy.ops.mini_a.connect_two_points() and len(bm.verts) == before_n and len(bm.faces) == 0)
    check('F_state_STALE', scene['midpoint_editor_state'] == 'STALE')
    state = mp.scan_state(scene, True)
    aid, bid = (state['id_by_index'][v.index] for v in pair)
    rid = mp._root_id(aid, bid)
    ri = next(i for i, r in enumerate(state['roots']) if r['root_id'] == rid)
    edge = next(e for e in bm.edges if pair[0] in e.verts and pair[1] in e.verts)
    root_row = state['roots'][ri]
    root_t = .5
    amid = mp._add_point_to_bmesh(state, {'kind': 'author_edge', 'root_index': ri, 'root_t': root_t,
        'edge': edge, 'edge_start': pair[0], 'edge_t': .5})
    check('author_midpoint_provenance', amid.startswith('AMID:'))
    score = timed('color_update', lambda: mp.update_colors(scene))
    check('color_update_CURRENT', score['status'] == 'CURRENT', issues=score.get('issues'))
    auto = json.loads(scene['auto_point_last_report'])
    result['autopoint_report'] = auto
    check('10mm_threshold_unchanged', auto['threshold_mm'] == 10. and m['guarded_points_runtime'].divisions(10.) == 2)
    second = timed('color_update_repeat', lambda: mp.update_colors(scene))
    check('repeat_update_no_subdivision', second['status'] == 'CURRENT' and json.loads(scene['auto_point_last_report'])['source_added'] == 0 and json.loads(scene['auto_point_last_report'])['author_added'] == 0)
    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    original = bm.verts[0].co.copy()
    bm.verts[0].co.x += 1.
    held = timed('invalid_edit_update', lambda: mp.update_colors(scene))
    check('invalid_edit_visible_HOLD', held['status'] == 'HOLD' and scene['midpoint_editor_state'] == 'HOLD' and bool(scene['midpoint_editor_reason']))
    bm.verts[0].co = original
    bmesh.update_edit_mesh(obj.data, loop_triangles=False, destructive=False)
    state = mp.scan_state(scene, False)
    rows = d.catalog(state)
    internal = [k for k, row in rows.items() if not row['protected'] and row['kind'] == 'source'][:2]
    check('multiple_internal_interval_delete', timed('delete_two_intervals', lambda: d.delete_intervals(scene, set(internal))) == 2)
    check('delete_keeps_CURRENT', scene['midpoint_editor_state'] == 'CURRENT')
    check('references_preserved', mp._verify_references(scene) == len(before_refs))
    # Headless clip algebra and pending semantics. Native projection/pan requires Author GUI.
    clip = m['single_view_clip_adapter']
    scene.minia_clip_z_start = 0.
    scene.minia_clip_z_end = 15.
    scene.minia_clip_shared = True
    scene.minia_clip_shared_axis = '2'
    check('clip_input_only_PENDING', scene['view_clip_state'] == 'PENDING')
    interval = clip._axis_range(scene, 2)
    scene.minia_clip_tilt = True
    scene.minia_clip_tilt_x = 20.
    tilted = clip._axis_range(scene, 2)
    check('tilted_clip_direction', tuple(clip._clip_direction(scene, 2)) != (0., 0., 1.))
    check('clip_bounds_finite', all(math.isfinite(v) for v in interval + tilted))
    result['clip_interval'] = list(interval)
    result['clip_tilt_interval'] = list(tilted)
    result['state_signature'] = signature(mp)
    result['registry'] = json.loads(scene['midpoint_author_root_registry'])
    result['mask_sha256'] = hashlib.sha256(scene[d.KEY].encode()).hexdigest()
    result['color_report'] = {k: v for k, v in json.loads(scene['midpoint_score_report_json']).items() if k != 'elapsed_s'}
    timed('save_copy', lambda: bpy.ops.wm.save_as_mainfile(filepath=str(work)))
    addon.unbind()
    bpy.ops.wm.open_mainfile(filepath=str(work), load_ui=False, use_scripts=False)
    addon.finish_pending_load_for_test()
    check('operation_copy_reopen_BOUND', addon._STATE == 'BOUND', reason=addon._REASON)
    check('operation_copy_reopen_parity', signature(addon._SESSION.modules['midpoint_runtime']) == result['state_signature'])
    addon.unbind()
    addon_utils.disable('skin_branch_editor', default_set=False)
    result['status'] = 'PASS'
except Exception:
    result['error'] = traceback.format_exc()
    raise
finally:
    result['zip_sha256'] = hashlib.sha256((root / 'SKIN_BRANCH_EDITOR_0.1.0.zip').read_bytes()).hexdigest()
    result['peak_working_set_bytes'] = peak_working_set()
    (root / ('OPERATIONS_' + label + '_' + args.attempt + '.json')).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    print('OPERATIONS', label, result['status'], result.get('error', ''), flush=True)
