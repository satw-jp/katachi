"""Isolated headless addon install/lifecycle/copy operations; GUI remains UNVERIFIED."""
import argparse
import hashlib
import json
from pathlib import Path
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
p.add_argument('--phase', choices=['lifecycle', 'copy', 'reopen', 'synthetic'], required=True)
args = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = args.evidence.resolve()
data = root / 'relocated data/outputs'
results = {'phase': args.phase, 'runtime': bpy.app.version_string, 'build': bpy.app.build_hash.decode(),
           'background': bpy.app.background, 'gui_acceptance': 'UNVERIFIED', 'cases': []}

def check(name, condition, **detail):
    results['cases'].append({'name': name, 'pass': bool(condition), **detail})
    assert condition, name

def measure(name, fn):
    t = time.perf_counter()
    value = fn()
    results.setdefault('performance_seconds', {})[name] = time.perf_counter() - t
    return value

def keys():
    return [(km.name, k.idname, k.type, k.ctrl, k.shift, k.alt) for km in bpy.context.window_manager.keyconfigs.addon.keymaps for k in km.keymap_items]

def handlers():
    return {n: list(getattr(bpy.app.handlers, n)) for n in ('load_pre', 'load_post', 'depsgraph_update_post')}

def shape(obj):
    if obj.mode == 'EDIT':
        obj.update_from_editmode()
    return hashlib.sha256(repr(([(tuple(v.co), v.select) for v in obj.data.vertices],
                               [tuple(e.vertices) for e in obj.data.edges],
                               [tuple(f.vertices) for f in obj.data.polygons])).encode()).hexdigest()

@bpy.app.handlers.persistent
def sentinel(_):
    pass

before_handlers = handlers()
before_keys = keys()
bpy.app.handlers.depsgraph_update_post.append(sentinel)
try:
    for kind, folder in [('CONFIG', 'config-test'), ('SCRIPTS', 'scripts-test'), ('EXTENSIONS', 'extensions-test')]:
        actual = Path(bpy.utils.user_resource(kind)).resolve()
        check('isolated_' + kind, actual == root / folder, path=str(actual))
    t = time.perf_counter()
    check('installable_zip', 'FINISHED' in bpy.ops.preferences.addon_install(filepath=str(root / 'SKIN_BRANCH_EDITOR_0.1.0.zip'), overwrite=True))
    addon_utils.modules_refresh()
    addon = addon_utils.enable('skin_branch_editor', default_set=True, persistent=True)
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    check('enable', addon is not None)
    results['performance_seconds'] = {'install_enable': time.perf_counter() - t}
    check('enable_does_not_touch_unrelated_scene', len(bpy.data.objects) == 3 and addon._STATE == 'UNBOUND')
    check('enable_no_legacy_imports', 'midpoint_runtime' not in sys.modules)
    check('enable_keymaps_no_change', keys() == before_keys)
    addon.register()
    check('register_idempotent', bpy.app.handlers.load_post.count(addon._load_post) == 1)
    if args.phase == 'lifecycle':
        # Enable -> disable -> enable -> module reload in isolated settings.
        for i in range(3):
            addon_utils.disable('skin_branch_editor', default_set=True)
            check('disable_handlers_' + str(i), addon._load_pre not in bpy.app.handlers.load_pre and addon._load_post not in bpy.app.handlers.load_post)
            check('disable_classes_' + str(i), all(not getattr(c, 'is_registered', False) for c in addon.CLASSES))
            addon = addon_utils.enable('skin_branch_editor', default_set=True, persistent=True)
        addon_utils.disable('skin_branch_editor', default_set=False)
        import importlib
        addon = importlib.reload(addon)
        addon = addon_utils.enable('skin_branch_editor', default_set=True, persistent=True)
        check('module_reload_no_duplicate', bpy.app.handlers.load_post.count(addon._load_post) == 1)
        check('save_isolated_preferences', 'FINISHED' in bpy.ops.wm.save_userpref())
    elif args.phase == 'synthetic':
        value = addon.project.validate(data / 'PROJECT.json')
        s = addon.Session()
        s.load(value)
        m = s.modules
        auto = m['guarded_points_runtime']
        # F kernel only on a synthetic mesh. No scoring or original scene mutation.
        mesh = bpy.data.meshes.new('synthetic')
        mesh.from_pydata([(0, 0, 0), (10, 0, 0), (0, 10, 0)], [], [])
        obj = bpy.data.objects.new(auto.mp.ANCHOR, mesh)
        bpy.context.scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bm = bmesh.from_edit_mesh(mesh)
        bm.verts.ensure_lookup_table()
        for v in bm.verts:
            v.select_set(v.index < 2)
        bmesh.update_edit_mesh(mesh)
        bpy.utils.register_class(auto.MINIA_OT_connect_two_points)
        s.classes = [auto.MINIA_OT_connect_two_points]
        check('synthetic_two_point_F', 'FINISHED' in bpy.ops.mini_a.connect_two_points() and len(bm.edges) == 1 and len(bm.faces) == 0)
        for v in bm.verts:
            v.select_set(True)
        bmesh.update_edit_mesh(mesh)
        check('synthetic_three_point_F_refused', 'CANCELLED' in bpy.ops.mini_a.connect_two_points() and len(bm.faces) == 0)
        clip = m['single_view_clip_adapter']
        check('synthetic_clip_interval', clip._line_clip((0, 0, 0), (10, 0, 0), 0, 2, 8) == (.2, .8))
        check('synthetic_clip_outside', clip._line_clip((0, 0, 0), (1, 0, 0), 0, 2, 8) is None)
        s.stop()
    else:
        work = data / 'AUTHOR_WORK_COPY.blend'
        prefs = bpy.context.preferences.addons['skin_branch_editor'].preferences
        prefs.manifest_path = str(data / 'PROJECT.json')
        bpy.ops.wm.open_mainfile(filepath=str(work), load_ui=False, use_scripts=False)
        addon.finish_pending_load_for_test()
        if args.phase == 'copy':
            value = measure('bind', lambda: addon.bind(data / 'PROJECT.json'))
        else:
            check('fresh_reopen_auto_bind', addon._STATE == 'BOUND' and addon._SESSION.active, reason=addon._REASON)
        m = addon._SESSION.modules
        mp = m['midpoint_runtime']
        obj = bpy.data.objects[mp.ANCHOR]
        scan = measure('scan', lambda: mp.scan_state(bpy.context.scene, False))
        check('protected_baseline_scan', scan['base_count'] == 18842 if 'base_count' in scan else len(scan['cache']['anchors']) == 18842)
        check('deterministic_legacy_origins', all(Path(module.__file__).resolve() == Path(addon.__file__).parent / 'legacy' / rel for name, rel in addon.session.ORDER for module in [m[name]]))
        current = keys()
        legacy_keys = [k for k in current if k[1].startswith('mini_a.')]
        check('keymap_duplicate_zero', len(legacy_keys) == len(set(legacy_keys)), keys=legacy_keys)
        check('point_shortcut', any(k[1:] == ('mini_a.quick_point', 'A', True, True, True) for k in legacy_keys))
        check('color_shortcut', any(k[1:] == ('mini_a.quick_color', 'R', True, True, False) for k in legacy_keys))
        check('F_shortcut', any(k[1] == 'mini_a.connect_two_points' and k[2] == 'F' for k in legacy_keys))
        if args.phase == 'copy':
            signature = shape(obj)
            # Repeated bound teardown/rebind must preserve original mesh and other callbacks.
            for i in range(2):
                old = addon._SESSION
                old_classes = list(old.classes)
                old_props = list(old.scene_props)
                addon.unbind()
                check('unbind_classes_' + str(i), all(not getattr(c, 'is_registered', False) for c in old_classes))
                check('unbind_timers_' + str(i), all(not bpy.app.timers.is_registered(f) for f in old.timers))
                check('unbind_draw_' + str(i), old.modules['selected_point_overlay']._HANDLER is None and old.modules['interval_delete']._handler is None)
                check('unbind_properties_' + str(i), all(not hasattr(bpy.types.Scene, n) for n in old_props))
                check('unbind_keymaps_' + str(i), not any(k[1].startswith('mini_a.') for k in keys()))
                check('foreign_handler_retained_' + str(i), sentinel in bpy.app.handlers.depsgraph_update_post)
                addon.bind(data / 'PROJECT.json')
                m = addon._SESSION.modules
                mp = m['midpoint_runtime']
            check('bind_preserves_mesh', shape(obj) == signature)
            # Real copied project: guards and existing deletion semantics without exploration.
            scan = mp.scan_state(bpy.context.scene, False)
            d = m['interval_delete']
            rows = d.catalog(scan)
            protected = next(k for k, row in rows.items() if row['protected'])
            try:
                d.delete_intervals(bpy.context.scene, {protected})
                guarded = False
            except RuntimeError:
                guarded = True
            check('flower_interval_delete_protected', guarded)
            # Unknown point, moved original, and face injection must be HOLD; undo our fixture edits.
            bm = bmesh.from_edit_mesh(obj.data)
            bm.verts.ensure_lookup_table()
            original = bm.verts[0].co.copy()
            bm.verts[0].co.x += 1
            try:
                mp.scan_state(bpy.context.scene, False)
                held = False
            except RuntimeError:
                held = True
            bm.verts[0].co = original
            check('moved_anchor_HOLD', held)
            v = bm.verts.new((999, 999, 999))
            layer = bm.verts.layers.int['anchor_index']
            v[layer] = -1
            try:
                mp.scan_state(bpy.context.scene, False)
                held = False
            except RuntimeError:
                held = True
            bm.verts.remove(v)
            check('unknown_vertex_HOLD', held)
            bm.verts.ensure_lookup_table()
            edges_before_face = set(bm.edges)
            face = bm.faces.new([bm.verts[i] for i in (0, 1, 2)])
            try:
                mp.scan_state(bpy.context.scene, False)
                held = False
            except RuntimeError:
                held = True
            bm.faces.remove(face)
            for edge in list(bm.edges):
                if edge not in edges_before_face:
                    bm.edges.remove(edge)
            check('face_HOLD', held)
            bmesh.update_edit_mesh(obj.data, loop_triangles=False, destructive=True)
            check('guard_tests_restore_mesh', shape(obj) == signature)
            # Save without a model edit: geometry/registry/masks remain unchanged.
            registry = bpy.context.scene.get('midpoint_author_root_registry')
            masks = bpy.context.scene.get(d.KEY)
            measure('save_work_copy', lambda: bpy.ops.wm.save_as_mainfile(filepath=str(work)))
            check('unchanged_save_logical_noop', shape(obj) == signature and registry == bpy.context.scene.get('midpoint_author_root_registry') and masks == bpy.context.scene.get(d.KEY))
            (root / 'COPY_SIGNATURE.json').write_text(json.dumps({'shape': signature, 'registry': registry, 'masks': masks}), encoding='utf-8')
            # Wrong input blocks before runtime scene operations.
            addon.unbind()
            cube = bpy.data.objects.get('Cube')
            bpy.ops.wm.read_factory_settings(use_empty=False)
            before = [(o.name, o.type) for o in bpy.data.objects]
            try:
                addon.bind(data / 'PROJECT.json')
                held = False
            except RuntimeError:
                held = True
            check('unrelated_file_bind_HOLD', held and before == [(o.name, o.type) for o in bpy.data.objects])
        else:
            expected = json.loads((root / 'COPY_SIGNATURE.json').read_text())
            check('fresh_reopen_mesh_parity', shape(obj) == expected['shape'])
            check('fresh_reopen_registry_parity', bpy.context.scene.get('midpoint_author_root_registry') == expected['registry'])
            check('fresh_reopen_masks_parity', bpy.context.scene.get(m['interval_delete'].KEY) == expected['masks'])
        addon.unbind()
    addon_utils.disable('skin_branch_editor', default_set=False)
    addon.unregister()
    check('final_foreign_handler_retained', sentinel in bpy.app.handlers.depsgraph_update_post)
    bpy.app.handlers.depsgraph_update_post.remove(sentinel)
    check('final_handlers_no_remnants', all(addon._load_pre not in coll and addon._load_post not in coll for coll in handlers().values()),
          handlers={name: [getattr(f, '__module__', '') + '.' + f.__name__ for f in coll] for name, coll in handlers().items()})
    results['status'] = 'PASS'
except Exception:
    results['status'] = 'FAIL'
    results['error'] = traceback.format_exc()
    raise
finally:
    results['zip_sha256'] = hashlib.sha256((root / 'SKIN_BRANCH_EDITOR_0.1.0.zip').read_bytes()).hexdigest()
    results['peak_working_set_bytes'] = peak_working_set()
    (root / ('TEST_' + args.phase.upper() + '.json')).write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding='utf-8')
    print('TEST_RESULTS', json.dumps(results, ensure_ascii=False), flush=True)
