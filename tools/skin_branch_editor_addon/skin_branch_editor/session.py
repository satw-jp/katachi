"""Lifecycle owner around byte-preserved legacy modules; no optimizer execution."""
import importlib.util
import inspect
from pathlib import Path
import sys
import bpy

ORDER = (
    ('route_overlay', 'route_runtime/route_overlay.py'),
    ('route_v2_panel', 'route_runtime/route_v2_panel.py'),
    ('color_path_runtime', 'color_path_runtime/color_path_runtime.py'),
    ('midpoint_runtime', 'color_author_runtime/midpoint_runtime.py'),
    ('depth_runtime', 'color_author_runtime/depth_runtime.py'),
    ('author_scoring_runtime', 'color_author_runtime/author_scoring_runtime.py'),
    ('selected_point_overlay', 'selected_point_runtime/selected_point_overlay.py'),
    ('quad_view_adapter', 'quad_view_runtime/quad_view_adapter.py'),
    ('single_view_clip_adapter', 'view_clip_runtime/single_view_clip_adapter.py'),
    ('guarded_points_runtime', 'view_clip_runtime/guarded_points_runtime.py'),
    ('interval_delete', 'interval_delete_runtime/interval_delete.py'),
    ('flower_reroute', 'interval_delete_runtime/flower_reroute.py'),
)

class Session:
    def __init__(self):
        self.modules = {}
        self.new_paths = []
        self.nx_modules = []
        self.scene_props = []
        self.active = False
        self.classes = []
        self.keymaps = []
        self.timers = []

    def load(self, project):
        for name in [n for n, _ in ORDER] + ['networkx', 'real_graph', 'route_analysis']:
            if name in sys.modules:
                raise RuntimeError('Legacy module collision; use an isolated Blender session: ' + name)
        for cls in bpy.types.Operator.__subclasses__() + bpy.types.Panel.__subclasses__():
            if cls.__module__ != __package__ and getattr(cls, 'is_registered', False) and getattr(cls, 'bl_idname', '').startswith(('mini_a.', 'MINIA_', 'VIEW3D_PT_minia')):
                raise RuntimeError('Legacy Blender class collision: ' + cls.__name__)
        before_paths = list(sys.path)
        before_modules = set(sys.modules)
        try:
            from .project import resolve
            nx = resolve(Path(project['_root']), project['files']['networkx-3.6.1.zip']['path'])
            sys.path.insert(0, str(nx))
            import networkx
            if networkx.__version__ != '3.6.1' or not str(networkx.__file__).startswith(str(nx)):
                raise RuntimeError('NetworkX must come from the verified external ZIP')
            legacy = Path(__file__).parent / 'legacy'
            for name, relative in ORDER:
                spec = importlib.util.spec_from_file_location(name, legacy / relative)
                module = importlib.util.module_from_spec(spec)
                self.modules[name] = module
                sys.modules[name] = module
                spec.loader.exec_module(module)
                if name == 'color_path_runtime':
                    module.OUTPUTS = Path(project['_root'])
        finally:
            self.new_paths = [p for p in sys.path if p not in before_paths]
            self.nx_modules = [n for n in sys.modules if n not in before_modules and (n == 'networkx' or n.startswith('networkx.'))]

    def start(self, project):
        self.load(project)
        props_before = set(bpy.types.Scene.bl_rna.properties.keys())
        keys_before = {(km.name, k.as_pointer()) for km in bpy.context.window_manager.keyconfigs.addon.keymaps for k in km.keymap_items}
        try:
            m = self.modules
            mp = m['midpoint_runtime']
            depth = m['depth_runtime']
            marker = m['selected_point_overlay']
            quad = m['quad_view_adapter']
            clip = m['single_view_clip_adapter']
            scene = bpy.context.scene
            ledger, digest = m['route_v2_panel']._load_ledger(scene)
            if digest != project['source_ledger_sha256'] or ledger['source_to_plate'] != project['source_to_plate']:
                raise RuntimeError('Source ledger / scale / coordinate transform mismatch')
            import json
            if json.loads(scene['source_reference_fingerprints']) != project['source_reference_fingerprints']:
                raise RuntimeError('Project reference binding mismatch')
            # Install the original deletion hooks before scanning a saved masked/rerouted project.
            deletion = m['interval_delete']
            for module, name in ((mp, 'scan_hook.py'), (mp, 'graph_hook.py'), (m['author_scoring_runtime'], 'preview_hook.py'), (clip, 'pick_hook.py')):
                module.__dict__['_interval_delete'] = deletion
                file = deletion.HERE / name
                exec(compile(file.read_text(encoding='utf-8'), str(file), 'exec'), module.__dict__)
            mp._replace_author_preview = m['author_scoring_runtime']._replace_author_preview
            mp._screen_pick = clip._clip_aware_pick
            m['guarded_points_runtime'].source_gaps = deletion.active_gaps
            m['flower_reroute'].register()
            mp.scan_state(scene, allow_registry_init=False)
            # Match current quad bootstrap, preserving saved selection and projection.
            import bmesh
            obj = bpy.data.objects[mp.ANCHOR]
            selection = None
            if obj.mode == 'EDIT':
                bm = bmesh.from_edit_mesh(obj.data)
                bm.verts.ensure_lookup_table()
                active = bm.select_history.active
                selection = ([v.index for v in bm.verts if v.select], active.index if isinstance(active, bmesh.types.BMVert) else -1)
            quad.install()
            base = depth._range
            def display_range(direction):
                lo, hi = base(direction)
                span = hi - lo
                return lo + span * .10, hi - span * .10
            depth._range = display_range
            depth.FAR_FACTOR = .16
            scene['quadview_depth_disabled'] = True
            scene['depth_cue_enabled'] = False
            m['author_scoring_runtime'].register(enter_edit_mode=True)
            # Archive imports guarded_points only after depth.register has installed this wrapper.
            # Our preflight imports it earlier, so preserve that captured callable explicitly.
            m['guarded_points_runtime']._BASE_UPDATE = depth._update_colors
            def draw_depth_off(panel, context):
                panel.layout.label(text='四画面では奥行き濃淡OFF')
                panel.layout.label(text='誤った方向の濃淡を避けます')
                panel.layout.label(text='従来heuristicの色相を維持')
            depth.MINI_A_PT_depth.draw = draw_depth_off
            if selection:
                bm = bmesh.from_edit_mesh(obj.data)
                bm.verts.ensure_lookup_table()
                ids, active = selection
                ids = set(ids)
                for v in bm.verts:
                    v.select_set(v.index in ids)
                bm.select_history.clear()
                if 0 <= active < len(bm.verts) and bm.verts[active].select:
                    bm.select_history.add(bm.verts[active])
                bmesh.update_edit_mesh(obj.data, loop_triangles=False, destructive=False)
            # Never invoke viewport initialization/update in background mode.
            if not bpy.app.background:
                for screen in bpy.data.screens:
                    for area in screen.areas:
                        if area.type == 'VIEW_3D':
                            for q in list(area.spaces.active.region_quadviews) or [area.spaces.active.region_3d]:
                                q.use_clip_planes = False
                area = next((a for a in bpy.context.screen.areas if a.type == 'VIEW_3D'), None)
                if not area or not (len(area.spaces.active.region_quadviews) == 4 or scene.get('minia_single_view', False)):
                    quad.configure()
            marker.register()
            # One addon load owner; legacy marker callback would run on unrelated files.
            bpy.app.handlers.load_post.remove(marker._load_post)
            if bpy.app.background:
                clip.install()
                for cls in (clip.MINIA_OT_ortho_pan, clip.MINIA_OT_apply_ranges, clip.MINIA_OT_toggle_single, clip.MINI_A_PT_axis_clip):
                    bpy.utils.register_class(cls)
                kc = bpy.context.window_manager.keyconfigs.addon
                km = kc.keymaps.get('3D View') or kc.keymaps.new(name='3D View', space_type='VIEW_3D')
                km.keymap_items.new('mini_a.ortho_pan', 'MIDDLEMOUSE', 'PRESS', head=True)
                scene['view_clip_state'] = 'DEFERRED_TO_VIEWPORT'
            else:
                clip.register()
            m['guarded_points_runtime'].register()
            # Original hooks must follow auto-point registration (as in archive bootstrap).
            m['interval_delete'].register()
            m['flower_reroute'].register()
            for op, key, alt in [('mini_a.quick_point', 'A', True), ('mini_a.quick_color', 'R', False)]:
                km = bpy.context.window_manager.keyconfigs.addon.keymaps.get('Mesh') or bpy.context.window_manager.keyconfigs.addon.keymaps.new(name='Mesh', space_type='EMPTY')
                km.keymap_items.new(op, key, 'PRESS', ctrl=True, shift=True, alt=alt)
            self.active = True
        finally:
            self.scene_props = [n for n in bpy.types.Scene.bl_rna.properties.keys() if n not in props_before]
            self.classes = []
            for module in self.modules.values():
                for cls in module.__dict__.values():
                    if inspect.isclass(cls) and issubclass(cls, (bpy.types.Operator, bpy.types.Panel)) and getattr(cls, 'is_registered', False):
                        if cls not in self.classes:
                            self.classes.append(cls)
                for fn in module.__dict__.values():
                    if inspect.isfunction(fn) and bpy.app.timers.is_registered(fn) and fn not in self.timers:
                        self.timers.append(fn)
            self.keymaps = [(km, k) for km in bpy.context.window_manager.keyconfigs.addon.keymaps for k in km.keymap_items if (km.name, k.as_pointer()) not in keys_before]

    def stop(self):
        if 'interval_delete' in self.modules:
            self.modules['interval_delete'].stop()
        marker = self.modules.get('selected_point_overlay')
        if marker and marker._HANDLER is not None:
            bpy.types.SpaceView3D.draw_handler_remove(marker._HANDLER, 'WINDOW')
            marker._HANDLER = None
        for fn in self.timers:
            if bpy.app.timers.is_registered(fn):
                bpy.app.timers.unregister(fn)
        for km, k in self.keymaps:
            km.keymap_items.remove(k)
        for cls in reversed(self.classes):
            if getattr(cls, 'is_registered', False):
                bpy.utils.unregister_class(cls)
        for prop in self.scene_props:
            if hasattr(bpy.types.Scene, prop):
                delattr(bpy.types.Scene, prop)
        for coll_name in ('load_post', 'depsgraph_update_post'):
            coll = getattr(bpy.app.handlers, coll_name)
            for fn in list(coll):
                if getattr(fn, '__module__', '') in self.modules:
                    coll.remove(fn)
        for name, module in self.modules.items():
            if sys.modules.get(name) is module:
                del sys.modules[name]
        for name in self.nx_modules:
            sys.modules.pop(name, None)
        for path in self.new_paths:
            while path in sys.path:
                sys.path.remove(path)
        self.active = False
