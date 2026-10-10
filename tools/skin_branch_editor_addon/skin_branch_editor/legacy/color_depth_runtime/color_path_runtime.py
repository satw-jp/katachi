"""Display-only support-distance editor integration for MINI_A."""
import bpy, sys, json, gzip, hashlib, math, time
from pathlib import Path
from mathutils import Vector
from bpy.props import StringProperty

RUNTIME = Path(__file__).resolve().parent
OUTPUTS = RUNTIME.parent
NETWORKX_ZIP = OUTPUTS / 'color_path_runtime' / 'networkx-3.6.1.zip'
ROUTE_RUNTIME = OUTPUTS / 'route_runtime'
if str(NETWORKX_ZIP) not in sys.path: sys.path.insert(0, str(NETWORKX_ZIP))
if str(ROUTE_RUNTIME) not in sys.path: sys.path.insert(0, str(ROUTE_RUNTIME))
import networkx as nx
import route_v2_panel

PANEL_CATEGORY = 'MINI_A 色付き補強'
ANCHOR = 'AUTHOR_EDIT_ALL • protected point baseline'
DISPLAY_COLLECTION = 'DISPLAY_ONLY • support-distance colors'
AUTHOR_COLLECTION = 'AUTHOR_EDIT • all anchors • hidden'
PREVIEW_COLLECTION = 'AUTHOR_EDIT_PREVIEW • display only'
_REGISTERED = False
_BUSY = False


def _sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def _read_data(scene=None):
    cache_path = OUTPUTS / 'COLOR_PATH_GRAPH.json.gz'
    score_path = OUTPUTS / 'SUPPORT_DISTANCE_COLORS.json'
    cache_sha = _sha(cache_path); score_sha = _sha(score_path)
    if scene is not None:
        if cache_sha != scene.get('color_cache_sha256'):
            raise RuntimeError('Locked graph cache SHA mismatch')
        if score_sha != scene.get('color_score_source_sha256'):
            raise RuntimeError('Locked source score SHA mismatch')
    cache = json.loads(gzip.decompress(cache_path.read_bytes()))
    score = json.loads(score_path.read_text(encoding='utf-8-sig'))
    if len(cache.get('segments', [])) != 35303 or len(cache.get('anchors', {})) != 18842:
        raise RuntimeError('Color path graph cache count mismatch')
    return cache, score, cache_sha, score_sha


def _graph(cache, edits):
    g = nx.Graph()
    g.add_nodes_from(cache['nodes'])
    g.add_edges_from((a, b, d) for a, b, d in cache['edges'])
    anchors = cache['anchors']
    for edit in edits:
        pair = edit.get('endpoint_anchor_ids') or []
        if len(pair) != 2 or pair[0] not in anchors or pair[1] not in anchors:
            raise RuntimeError('Edited edge endpoint is not a locked source anchor')
        a, b = anchors[pair[0]], anchors[pair[1]]
        if a == b or g.has_edge(a, b):
            continue
        pa, pb = g.nodes[a]['position'], g.nodes[b]['position']
        g.add_edge(a, b, length_mm=math.dist(pa, pb), kind='AUTHOR_EDIT_DESIGN_INTENT')
    return g


def score_graph(g, seeds, bonus=.35):
    seeds = set(seeds) & set(g)
    distances = nx.multi_source_dijkstra_path_length(g, seeds, weight='length_mm') if seeds else {}
    augmented = g.copy(); root = '__COLOR_SUPPORT_REFERENCE__'
    if root in augmented: raise RuntimeError('Unexpected heuristic root node')
    augmented.add_node(root); augmented.add_edges_from((root, n) for n in seeds)
    backbone = set()
    for edges in nx.biconnected_component_edges(augmented):
        if len(edges) > 2 and any(root in e for e in edges):
            backbone.update(frozenset(e) for e in edges if root not in e)
    scores = {}
    for a, b, d in g.edges(data=True):
        distance = min(distances.get(a, math.inf), distances.get(b, math.inf)) + d['length_mm'] / 2
        merged = frozenset((a, b)) in backbone
        scores[frozenset((a, b))] = {
            'distance_mm': distance if math.isfinite(distance) else None,
            'effective_distance_mm': distance * (1 - bonus if merged else 1) if math.isfinite(distance) else None,
            'merge_bonus': merged,
        }
    return scores


def _anchor_signature():
    obj = bpy.data.objects.get(ANCHOR)
    if obj is None or obj.type != 'MESH': return 'MISSING'
    if bpy.context.mode == 'EDIT_MESH' and bpy.context.view_layer.objects.active == obj:
        import bmesh
        bm = bmesh.from_edit_mesh(obj.data); bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
        bm.verts.index_update()
        verts = [(v.index, tuple(round(float(c), 6) for c in v.co)) for v in bm.verts]
        edges = sorted(tuple(sorted(v.index for v in e.verts)) for e in bm.edges)
        faces = len(bm.faces)
    else:
        verts = [(v.index, tuple(round(float(c), 6) for c in v.co)) for v in obj.data.vertices]
        edges = sorted(tuple(sorted(e.vertices)) for e in obj.data.edges)
        faces = len(obj.data.polygons)
    raw = repr((verts, edges, faces)).encode()
    return hashlib.sha256(raw).hexdigest()


def _mark_stale(reason='AUTHOR_EDGES_CHANGED'):
    scene = bpy.context.scene
    if scene is None: return
    scene['color_map_state'] = 'STALE'
    scene['color_map_stale_reason'] = reason


def poll_state():
    if not _REGISTERED: return None
    scene = bpy.context.scene
    if scene is None: return .5
    try:
        sig = _anchor_signature()
        if sig != scene.get('color_anchor_signature'):
            if scene.get('color_map_state') != 'STALE': _mark_stale('AUTHOR_EDGES_OR_ANCHORS_CHANGED')
    except Exception as e:
        _mark_stale('POLL_FAILED: ' + repr(e))
    return .5


def _ensure_collection(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c)
    return c


def _color_material(bin_index, color):
    name = f'Support distance bin {bin_index:02d}' if bin_index is not None else 'Support distance unknown gray'
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if bin_index is not None:
        t = int(bin_index) / 31.0
        if t <= .5:
            f = t * 2.0; lo = (.01, .85, .05); hi = (1.0, .8, 0.0)
        else:
            f = (t - .5) * 2.0; lo = (1.0, .8, 0.0); hi = (1.0, .015, .01)
        rgb = tuple(lo[k] * (1.0 - f) + hi[k] * f for k in range(3))
    else:
        rgb = tuple(float(x) for x in color[:3])
    mat.diffuse_color = (*rgb, 1.0); mat.use_nodes = True
    nodes = mat.node_tree.nodes; nodes.clear(); links = mat.node_tree.links
    em = nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*rgb, 1.0); em.inputs['Strength'].default_value = 1.0
    output = nodes.new('ShaderNodeOutputMaterial'); links.new(em.outputs['Emission'], output.inputs['Surface'])
    return mat


def _replace_color_curves(cache, score, g, scores):
    by_bin = {i: [] for i in range(32)}; by_bin[None] = []
    for seg in cache['segments']:
        q = scores.get(frozenset(seg['nodes']))
        value = q['effective_distance_mm'] if q else None
        b = None if value is None else min(31, int(round(max(0.0, value) / 30.0 * 31)))
        by_bin[b].append(seg)
    coll = _ensure_collection(DISPLAY_COLLECTION)
    for obj in list(coll.objects):
        if obj.name.startswith('Support distance •') and obj.type == 'CURVE':
            bpy.data.objects.remove(obj, do_unlink=True)
    palette = score['palette']; unknown = score.get('unknown_color', [.34, .38, .43])
    total = 0
    for b, segs in by_bin.items():
        if not segs: continue
        data = bpy.data.curves.new(f'Support distance {b if b is not None else "gray"} paths', 'CURVE')
        data.dimensions = '3D'; data.resolution_u = 1; data.bevel_depth = .12; data.bevel_resolution = 1
        for s in segs:
            sp = data.splines.new('POLY'); sp.points.add(1)
            sp.points[0].co = (*s['a'], 1); sp.points[1].co = (*s['b'], 1)
        obj = bpy.data.objects.new(f'Support distance • {b if b is not None else "gray"} • {len(segs)} subsegments', data)
        obj['display_only'] = True; obj['color_bin'] = -1 if b is None else b; obj['segment_count'] = len(segs)
        data.materials.append(_color_material(b, unknown if b is None else palette[b]))
        obj.hide_select = True; coll.objects.link(obj); total += len(segs)
    return {'segment_count': total, 'bins': sum(bool(v) for v in by_bin.values())}


def _replace_author_preview(edits):
    coll = _ensure_collection(PREVIEW_COLLECTION)
    for obj in list(coll.objects): bpy.data.objects.remove(obj, do_unlink=True)
    if not edits: return 0
    data = bpy.data.curves.new('Author intent edges • display only', 'CURVE')
    data.dimensions = '3D'; data.resolution_u = 1; data.bevel_depth = .14; data.bevel_resolution = 2
    for e in edits:
        sp = data.splines.new('POLY'); sp.points.add(1)
        sp.points[0].co = (*e['a_position'], 1); sp.points[1].co = (*e['b_position'], 1)
    obj = bpy.data.objects.new('AUTHOR INTENT • cyan display only', data)
    obj['display_only'] = True; obj['classification'] = 'DESIGN_INTENT_PREDICTION • TOOLPATH_UNVERIFIED'
    mat = bpy.data.materials.get('Author intent cyan') or bpy.data.materials.new('Author intent cyan')
    mat.diffuse_color = (.02, .8, 1.0, 1.0); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (.02, .8, 1.0, 1.0)
        bsdf.inputs['Emission Color'].default_value = (.02, .8, 1.0, 1.0)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    data.materials.append(mat); obj.hide_select = True; coll.objects.link(obj)
    return len(edits)


def _guard(scene):
    obj = bpy.data.objects.get(ANCHOR)
    if obj is None: return {'issues': ['AUTHOR_EDIT_ALL missing'], 'edits': []}
    if bpy.context.mode == 'EDIT_MESH' and bpy.context.view_layer.objects.active == obj:
        import bmesh
        bm = bmesh.from_edit_mesh(obj.data)
        if len(bm.faces): return {'issues': ['面が追加されています。Ctrl+Zで取り消してendpoint間のFのみ使用してください。'], 'edits': []}
    elif len(obj.data.polygons):
        return {'issues': ['面が追加されています。Ctrl+Zで取り消してendpoint間のFのみ使用してください。'], 'edits': []}
    # Existing source/edit extractor verifies the complete locked point baseline,
    # reference fingerprints, endpoint-only edges, and stable IDs.
    return route_v2_panel.extract_current_edits(scene)


def update_colors(scene=None):
    scene = scene or bpy.context.scene
    start = time.perf_counter()
    try:
        audit = _guard(scene)
        if audit.get('issues'):
            scene['color_map_state'] = 'HOLD'; scene['color_map_stale_reason'] = '; '.join(audit['issues'][:4])
            return {'status': 'HOLD', 'issues': audit['issues']}
        cache, score, cache_sha, score_sha = _read_data(scene)
        g = _graph(cache, audit['edits'])
        scores = score_graph(g, cache['seeds'])
        result = _replace_color_curves(cache, score, g, scores)
        preview_count = _replace_author_preview(audit['edits'])
        sig = _anchor_signature()
        report = {
            'status': 'CURRENT', 'branch_count': 9421, 'segment_count': result['segment_count'],
            'added_edge_count': len(audit['edits']), 'author_preview_edges': preview_count,
            'edit_sha256': audit['edit_sha256'], 'cache_sha256': cache_sha, 'score_sha256': score_sha,
            'elapsed_s': time.perf_counter() - start, 'classification': 'USER_HEURISTIC • DESIGN_INTENT_PREDICTION • TOOLPATH_UNVERIFIED',
            'manufacturing_geometry_changed': False,
        }
        scene['color_map_report_json'] = json.dumps(report, separators=(',', ':'), ensure_ascii=False)
        scene['color_map_state'] = 'CURRENT'; scene['color_map_stale_reason'] = ''
        scene['color_anchor_signature'] = sig; scene['color_map_edit_sha256'] = audit['edit_sha256']
        return report
    except Exception as e:
        scene['color_map_state'] = 'HOLD'; scene['color_map_stale_reason'] = repr(e)
        return {'status': 'HOLD', 'issues': [repr(e)]}


class MINI_A_OT_color_update(bpy.types.Operator):
    bl_idname = 'mini_a.color_update'; bl_label = '色を更新'; bl_description = 'endpoint間の追加線を含め台帳ヒューリスティック距離色を再計算します'
    def execute(self, context):
        r = update_colors(context.scene)
        if r.get('status') == 'CURRENT':
            self.report({'INFO'}, f"色を更新しました • {r['added_edge_count']}本 • {r['elapsed_s']:.1f}s"); return {'FINISHED'}
        self.report({'WARNING'}, 'HOLD: ' + str(r.get('issues', [context.scene.get('color_map_stale_reason')]))); return {'CANCELLED'}


class MINI_A_OT_color_save(bpy.types.Operator):
    bl_idname = 'mini_a.color_save'; bl_label = '保存'; bl_description = '現在のblendへ保存します。別名保存は File > Save As を使います'
    def execute(self, context):
        try:
            bpy.ops.wm.save_mainfile()
            self.report({'INFO'}, '保存しました'); return {'FINISHED'}
        except Exception as e:
            self.report({'ERROR'}, repr(e)); return {'CANCELLED'}


class MINI_A_PT_color_editor(bpy.types.Panel):
    bl_label = '色付き補強線'; bl_idname = 'MINIA_PT_color_path_editor'; bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = PANEL_CATEGORY
    def draw(self, context):
        s = context.scene; l = self.layout
        l.label(text='色表示: Support残存の完成形仮定', icon='COLOR')
        l.label(text='2点を選択して F → endpoint間の線を追加')
        l.label(text='中間点・分岐形状は今回非対応')
        state = s.get('color_map_state', 'STALE')
        if state == 'CURRENT': l.label(text='色: CURRENT • 更新済み', icon='CHECKMARK')
        elif state == 'HOLD': l.label(text='HOLD • ' + str(s.get('color_map_stale_reason', 'Guard error'))[:80], icon='ERROR')
        else: l.label(text='STALE • 追加線/Undo後は色を更新', icon='ERROR')
        l.operator('mini_a.color_update', icon='FILE_REFRESH')
        l.operator('mini_a.color_save', icon='FILE_TICK')
        l.separator(); l.label(text='緑=支えに近い / 赤=遠い / 灰=台帳未対応')
        l.label(text='仮定ベースのユーザーヒューリスティック')
        l.label(text='安全・強度保証ではありません')
        l.label(text='青緑線=設計意図のみ / TOOLPATH_UNVERIFIED')


def register(enter_edit_mode=True):
    global _REGISTERED
    if not _REGISTERED:
        bpy.utils.register_class(MINI_A_OT_color_update); bpy.utils.register_class(MINI_A_OT_color_save); bpy.utils.register_class(MINI_A_PT_color_editor)
        if not bpy.app.timers.is_registered(poll_state): bpy.app.timers.register(poll_state, first_interval=.5, persistent=True)
        _REGISTERED = True
    scene = bpy.context.scene
    if not scene.get('color_map_state'): scene['color_map_state'] = 'CURRENT'
    obj = bpy.data.objects.get(ANCHOR)
    if obj:
        for o in bpy.data.objects:
            if o.get('source_reference') or o.name.startswith('Support distance •') or o.name.startswith('DISPLAY_ONLY'):
                o.hide_select = True
        obj.hide_select = False; obj.hide_viewport = False; obj.hide_render = False
        for c in obj.users_collection: c.hide_viewport = False
        if bpy.context.mode == 'EDIT_MESH': bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
        if enter_edit_mode and bpy.context.mode != 'EDIT_MESH': bpy.ops.object.mode_set(mode='EDIT')
        if bpy.context.mode == 'EDIT_MESH':
            bpy.ops.mesh.select_mode(type='VERT'); bpy.ops.mesh.select_all(action='DESELECT')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D': area.spaces.active.show_region_ui = True
    return True


def unregister():
    global _REGISTERED
    if not _REGISTERED: return
    if bpy.app.timers.is_registered(poll_state): bpy.app.timers.unregister(poll_state)
    for cls in (MINI_A_PT_color_editor, MINI_A_OT_color_save, MINI_A_OT_color_update):
        try: bpy.utils.unregister_class(cls)
        except RuntimeError: pass
    _REGISTERED = False
