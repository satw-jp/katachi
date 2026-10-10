"""10 mm physical graph-coordinate spacing, preserving midpoint provenance."""
import bpy,bmesh,math,json,bisect
from mathutils import Vector
import author_scoring_runtime as author
mp=author.depth.midpoint
_BASE_UPDATE=mp.update_colors

def divisions(length):
    return math.floor(length/10.+1e-9)+1 if length>=10.-1e-8 else 1

def branch_tables(cache):
    result={}
    for i,seg in enumerate(cache['segments']):
        row=result.setdefault(seg['branch_id'],[])
        start=row[-1][3] if row else 0.
        if row and (Vector(row[-1][4]['b'])-Vector(seg['a'])).length>1e-4:
            raise RuntimeError('Source branch ordering is discontinuous')
        row.append((i,start,(Vector(seg['b'])-Vector(seg['a'])).length,start+(Vector(seg['b'])-Vector(seg['a'])).length,seg))
    return result

def source_gaps(state):
    tables=branch_tables(state['cache']);mids={}
    for rec in state['mid_records'].values():
        if rec['kind']=='source_segment':mids.setdefault(rec['segment_index'],[]).append(rec['t'])
    for branch,rows in tables.items():
        cuts=[0.,rows[-1][3]]
        for i,start,length,end,seg in rows:
            cuts.extend(start+length*t for t in mids.get(i,[]))
        cuts=sorted(set(cuts))
        yield rows,cuts

def subdivide(scene=None,include_source=True):
    scene=scene or bpy.context.scene;state=mp.scan_state(scene,True)
    bm=state['bm'];obj=state['obj']
    if bm is None:raise RuntimeError('点追加は編集モードで実行してください')
    inv=obj.matrix_world.inverted();layers={n:bm.verts.layers.int.get(n) for n in ('anchor_index','midpoint_kind','midpoint_segment_index','midpoint_author_root','record_index','endpoint_index')};tl=bm.verts.layers.float.get('midpoint_t')
    selected=[v for v in bm.verts if v.select];active=bm.select_history.active
    def tag(v,kind,si,ri,t):
        for name,value in [('anchor_index',-1),('midpoint_kind',kind),('midpoint_segment_index',si),('midpoint_author_root',ri),('record_index',-1),('endpoint_index',-1)]:
            if layers[name] is not None:v[layers[name]]=value
        v[tl]=t;v.select_set(False)
    source_added=0;author_added=0
    if include_source:
        for rows,cuts in source_gaps(state):
            ends=[r[3] for r in rows]
            for a,b in zip(cuts,cuts[1:]):
                count=divisions(b-a)
                for j in range(1,count):
                    distance=a+(b-a)*j/count
                    row=rows[min(bisect.bisect_right(ends,distance),len(rows)-1)]
                    si,start,length,end,seg=row
                    if length<1e-8:raise RuntimeError('Cannot place point on zero-length segment')
                    t=mp._round_t(max(.00001,min(.99999,(distance-start)/length)))
                    sid=mp._source_mid_id(si,t)
                    if sid in state['id_to_pos']:continue
                    v=bm.verts.new(inv@Vector(mp._interp(seg['a'],seg['b'],t)));tag(v,mp.KIND_SOURCE,si,-1,t)
                    source_added+=1
    intervals=mp._edge_interval_map(state['roots'])
    for edge in list(bm.edges):
        va,vb=edge.verts;ida=state['id_by_index'][va.index];idb=state['id_by_index'][vb.index]
        ri,tmap=intervals[tuple(sorted((ida,idb)))];root=state['roots'][ri]
        length=(mp._world(obj,va.co)-mp._world(obj,vb.co)).length;count=divisions(length)
        current=va
        for j in range(1,count):
            tail=next(e for e in current.link_edges if vb in e.verts)
            _,v=bmesh.utils.edge_split(tail,current,1./(count-j+1))
            t=mp._round_t(tmap[ida]+(tmap[idb]-tmap[ida])*j/count)
            v.co=inv@Vector(mp._interp(root['a_position'],root['b_position'],t))
            tag(v,mp.KIND_AUTHOR,-1,ri,t)
            root['cuts'].append({'id':mp._author_mid_id(root['root_id'],t),'t':t});author_added+=1;current=v
    if source_added or author_added:
        for root in state['roots']:root['cuts'].sort(key=lambda c:c['t'])
        mp._store_registry(scene,state['roots'])
        bm.verts.index_update();bm.verts.ensure_lookup_table();bm.edges.index_update()
        for v in selected:
            if v.is_valid:v.select_set(True)
        bm.select_history.clear()
        if isinstance(active,bmesh.types.BMVert) and active.is_valid:bm.select_history.add(active)
        bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=True)
        scene['midpoint_editor_state']='STALE'
    report={'source_added':source_added,'author_added':author_added,'threshold_mm':10.}
    scene['auto_point_last_report']=json.dumps(report)
    return report

def update_colors(scene=None):
    try:subdivide(scene,True)
    except Exception as exc:return {'status':'HOLD','issues':[str(exc)]}
    return _BASE_UPDATE(scene)

class MINIA_PT_auto_points(bpy.types.Panel):
    bl_label='10mm 自動点';bl_idname='MINIA_PT_auto_points';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='MINI_A 色付き補強'
    def draw(self,c):
        self.layout.label(text='原寸10mm以上の空き区間を分割')
        self.layout.label(text='F：仮の線を接続（点は増やさない）')
        self.layout.label(text='色を更新：本線に途中点を追加')

def register():
    mp.update_colors=update_colors
    for cls in (MINIA_PT_auto_points,):
        if not hasattr(bpy.types,cls.__name__):bpy.utils.register_class(cls)
    kc=bpy.context.window_manager.keyconfigs.addon
    if kc:
        km=kc.keymaps.get('Mesh') or kc.keymaps.new(name='Mesh',space_type='EMPTY')
        for k in list(km.keymap_items):
            if k.idname=='mini_a.connect_auto_points':km.keymap_items.remove(k)
