"""Explicit interval removals; locked source data and anchor provenance stay intact."""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from bpy_extras import view3d_utils
import guarded_points_runtime as auto
import author_scoring_runtime as author
import single_view_clip_adapter as clip
mp=auto.mp
KEY='minia_deleted_intervals_v1'
HERE=Path(__file__).resolve().parent
_mask_raw=None;_mask_value=None;_tables=None;_segment_arcs=None
_protected=None;_contacts=None;_contact_tree=None
_selected=set();_catalog={};_handler=None;_running=False
_base_gaps=auto.source_gaps

def masks(scene):
    global _mask_raw,_mask_value
    raw=scene.get(KEY,'[]')
    if raw!=_mask_raw:
        value=json.loads(raw)
        if not isinstance(value,list):raise RuntimeError('削除区間の記録が不正です')
        _mask_raw=raw;_mask_value=value
    return _mask_value

def tables(cache):
    global _tables,_segment_arcs
    if _tables is None:
        _tables=auto.branch_tables(cache)
        _segment_arcs={i:(branch,start,length) for branch,rows in _tables.items() for i,start,length,end,seg in rows}
    return _tables

def protection(scene):
    global _protected,_contacts,_contact_tree
    if _protected is None:
        ledger,_=mp.route_v2_panel._load_ledger(scene)
        flowers={r['id'] for r in ledger['flower_records']}
        _protected=set();_contacts=[]
        for r in ledger['records']:
            sr=r['source_record']
            if any(sr.get(k) in flowers for k in ('parent_id','target_id','flower_id')):
                _protected.add(r['id'])
                if sr.get('parent_id') in flowers:_contacts.append(Vector(r['points_plate_mm'][0]))
                if sr.get('target_id') in flowers or sr.get('flower_id') in flowers:_contacts.append(Vector(r['points_plate_mm'][-1]))
        _contact_tree=KDTree(len(_contacts))
        for i,p in enumerate(_contacts):_contact_tree.insert(p,i)
        _contact_tree.balance()
    return _protected,_contacts

def root_protected(scene,root):
    protection(scene)
    return any(_contact_tree.find(Vector(root[k]))[2]<1e-4 for k in ('a_position','b_position'))

def source_deleted(scene,cache,index,t):
    tables(cache);branch,start,length=_segment_arcs[index];arc=start+length*t
    return any(r['kind']=='source' and r['branch']==branch and r['lo']-1e-6<arc<r['hi']+1e-6 for r in masks(scene))

def author_deleted(scene,root_id,lo,hi):
    return any(r['kind']=='author' and r['root']==root_id and r['lo']<=lo+1e-6 and r['hi']>=hi-1e-6 for r in masks(scene))

def deleted_pair(scene,roots,pair):
    for root in roots:
        chain=[(root['a_id'],0.)]+[(c['id'],c['t']) for c in root['cuts']]+[(root['b_id'],1.)]
        for (a,lo),(b,hi) in zip(chain,chain[1:]):
            if tuple(sorted((a,b)))==pair:return author_deleted(scene,root['root_id'],lo,hi)
    return False

def validate(scene,roots,cache):
    protected,_=protection(scene);branches=tables(cache);rd={r['root_id']:r for r in roots}
    for row in masks(scene):
        lo=float(row['lo']);hi=float(row['hi'])
        if not(math.isfinite(lo) and math.isfinite(hi) and 0<=lo<hi):raise RuntimeError('削除区間の範囲が不正です')
        if row['kind']=='source':
            branch=row['branch']
            if branch not in branches or branch in protected or hi>branches[branch][-1][3]+1e-5:
                raise RuntimeError('花に直接つながる枝は削除できません')
        elif row['kind']=='author':
            if row['root'] not in rd or hi>1.+1e-6 or root_protected(scene,rd[row['root']]):
                raise RuntimeError('花に直接つながる追加枝は削除できません')
        else:raise RuntimeError('削除区間の種類が不正です')

def source_pieces(state):
    mids={}
    for r in state['mid_records'].values():
        if r['kind']=='source_segment':mids.setdefault(r['segment_index'],[]).append(r['t'])
    for i,seg in enumerate(state['cache']['segments']):
        cuts=[0.]+sorted(mids.get(i,[]))+[1.]
        for lo,hi in zip(cuts,cuts[1:]):
            if not source_deleted(bpy.context.scene,state['cache'],i,(lo+hi)*.5):yield i,seg,lo,hi

def active_gaps(state):
    for rows,cuts in _base_gaps(state):
        branch=rows[0][4]['branch_id']
        for lo,hi in zip(cuts,cuts[1:]):
            if not any(r['kind']=='source' and r['branch']==branch and r['lo']-1e-6<(lo+hi)*.5<r['hi']+1e-6 for r in masks(bpy.context.scene)):
                yield rows,[lo,hi]

def catalog(state):
    scene=bpy.context.scene;protected,_=protection(scene);result={};mid={}
    for r in state['mid_records'].values():
        if r['kind']=='source_segment':mid.setdefault(r['segment_index'],[]).append(r)
    for branch,rows in tables(state['cache']).items():
        cuts=[(0.,branch+':START'),(rows[-1][3],branch+':END')]
        for i,start,length,end,seg in rows:
            cuts.extend((start+length*r['t'],r['stable_id']) for r in mid.get(i,[]))
        cuts.sort()
        for (lo,a),(hi,b) in zip(cuts,cuts[1:]):
            if hi-lo<1e-8:continue
            if any(r['kind']=='source' and r['branch']==branch and r['lo']-1e-6<(lo+hi)*.5<r['hi']+1e-6 for r in masks(scene)):continue
            pieces=[]
            for i,start,length,end,seg in rows:
                left=max(lo,start);right=min(hi,end)
                if right-left>1e-8:pieces.append((mp._interp(seg['a'],seg['b'],(left-start)/length),mp._interp(seg['a'],seg['b'],(right-start)/length)))
            key='S|'+branch+'|'+a+'|'+b
            result[key]={'kind':'source','branch':branch,'lo':lo,'hi':hi,'ids':(a,b),'pieces':pieces,'protected':branch in protected}
    actual={r['ids'] for r in state['edge_rows']}
    for root in state['roots']:
        locked=root_protected(scene,root)
        chain=[(root['a_id'],0.)]+[(c['id'],c['t']) for c in root['cuts']]+[(root['b_id'],1.)]
        for (a,lo),(b,hi) in zip(chain,chain[1:]):
            if author_deleted(scene,root['root_id'],lo,hi) or tuple(sorted((a,b))) not in actual:continue
            key='A|'+root['root_id']+'|'+a+'|'+b
            result[key]={'kind':'author','root':root['root_id'],'lo':lo,'hi':hi,'ids':(a,b),'pieces':[(state['id_to_pos'][a],state['id_to_pos'][b])],'protected':locked}
    return result

def delete_intervals(scene,keys):
    state=mp.scan_state(scene,True);items=catalog(state)
    if not keys:raise RuntimeError('削除する区間を選んでください')
    if any(k not in items for k in keys):raise RuntimeError('線が変更されました。区間を選び直してください')
    rows=[items[k] for k in keys]
    if any(r['protected'] for r in rows):raise RuntimeError('花に直接つながる枝は削除できません')
    if state['bm'] is None:raise RuntimeError('編集モードで実行してください')
    additions=[{k:v for k,v in r.items() if k in ('kind','branch','root','lo','hi')} for r in rows]
    old=scene.get(KEY,'[]');scene[KEY]=json.dumps(masks(scene)+additions,separators=(',',':'))
    try:validate(scene,state['roots'],state['cache'])
    except Exception:scene[KEY]=old;raise
    pairs={tuple(sorted(r['ids'])) for r in rows if r['kind']=='author'}
    for e in list(state['bm'].edges):
        pair=tuple(sorted(state['id_by_index'][v.index] for v in e.verts))
        if pair in pairs:state['bm'].edges.remove(e)
    bmesh.update_edit_mesh(state['obj'].data,loop_triangles=False,destructive=True)
    scene['midpoint_editor_state']='STALE'
    result=mp.update_colors(scene)
    if result.get('status')!='CURRENT':raise RuntimeError('削除済みですが色更新に失敗しました：'+str(result.get('issues')))
    return len(rows)

def clipped_pieces(row,rd,scene):
    axis,limits=clip._region_axis_range(rd,scene)
    for a,b in row['pieces']:
        if axis is not None and limits is not None:
            ts=clip._line_clip(a,b,axis,*limits,direction=clip._applied_direction(scene,axis))
            if ts is None:continue
            yield Vector(mp._interp(a,b,ts[0])),Vector(mp._interp(a,b,ts[1]))
        else:yield Vector(a),Vector(b)

def pick(context,event,items):
    region,rd=clip.quad._window_region_data(context,event)
    if region is None or rd is None:return None
    xy=Vector((event.mouse_x-region.x,event.mouse_y-region.y))
    if not(0<=xy.x<region.width and 0<=xy.y<region.height):return None
    origin=view3d_utils.region_2d_to_origin_3d(region,rd,xy)
    direction=view3d_utils.region_2d_to_vector_3d(region,rd,xy).normalized();hits=[]
    for key,row in items.items():
        for a,b in clipped_pieces(row,rd,context.scene):
            pa=view3d_utils.location_3d_to_region_2d(region,rd,a);pb=view3d_utils.location_3d_to_region_2d(region,rd,b)
            if pa is None or pb is None:continue
            v=pb-pa;t=max(0.,min(1.,(xy-pa).dot(v)/v.length_squared)) if v.length_squared>1e-8 else 0.
            distance=(xy-(pa+v*t)).length
            if distance>9:continue
            depth=(a.lerp(b,t)-origin).dot(direction)
            if depth>0:hits.append((distance,depth,key))
    # Choose the closest stroke, then frontmost when strokes overlap within 2 px.
    if not hits:return None
    nearest=min(h[0] for h in hits)
    return min((h for h in hits if h[0]<=nearest+2.),key=lambda h:(h[1],h[0]))[2]

def redraw():
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.tag_redraw()

def draw():
    c=bpy.context
    if not _running or not c.region_data or c.region.type!='WINDOW':return
    import gpu
    from gpu_extras.batch import batch_for_shader
    coords=[]
    for key in _selected:
        row=_catalog.get(key)
        if row is None:continue
        for a,b in clipped_pieces(row,c.region_data,c.scene):
            pa=view3d_utils.location_3d_to_region_2d(c.region,c.region_data,a);pb=view3d_utils.location_3d_to_region_2d(c.region,c.region_data,b)
            if pa is not None and pb is not None:coords.extend([tuple(pa),tuple(pb)])
    if not coords:return
    shader=gpu.shader.from_builtin('UNIFORM_COLOR')
    try:
        gpu.state.blend_set('ALPHA');gpu.state.line_width_set(5.)
        shader.bind();shader.uniform_float('color',(1.,.25,.02,1.))
        batch_for_shader(shader,'LINES',{'pos':coords}).draw(shader)
    finally:gpu.state.line_width_set(1.);gpu.state.blend_set('NONE')

def stop():
    global _handler,_running
    if _handler is not None:bpy.types.SpaceView3D.draw_handler_remove(_handler,'WINDOW');_handler=None
    _running=False;_selected.clear();_catalog.clear();redraw()

class MINIA_OT_interval_delete(bpy.types.Operator):
    bl_idname='mini_a.interval_delete';bl_label='区間を複数選択して削除';bl_options={'REGISTER','UNDO'}
    @classmethod
    def poll(cls,c):return not _running and c.mode=='EDIT_MESH' and c.active_object and c.active_object.name==mp.ANCHOR
    def invoke(self,c,event):
        global _running,_catalog,_handler
        try:_catalog=catalog(mp.scan_state(c.scene,True))
        except Exception as exc:self.report({'ERROR'},str(exc));return {'CANCELLED'}
        _selected.clear();_running=True
        _handler=bpy.types.SpaceView3D.draw_handler_add(draw,(),'WINDOW','POST_PIXEL')
        c.window_manager.modal_handler_add(self);redraw()
        self.report({'INFO'},'線をクリックで追加・解除。Enter / Xで削除、Escで終了。')
        return {'RUNNING_MODAL'}
    def modal(self,c,event):
        if event.type=='ESC' and event.value=='PRESS':stop();return {'CANCELLED'}
        if event.type in {'RET','NUMPAD_ENTER','X','DEL'} and event.value=='PRESS':
            if not _selected:self.report({'WARNING'},'削除する区間をクリックしてください');return {'RUNNING_MODAL'}
            try:n=delete_intervals(c.scene,set(_selected))
            except Exception as exc:self.report({'ERROR'},str(exc));stop();return {'FINISHED'}
            stop();self.report({'INFO'},f'{n}区間を削除しました');return {'FINISHED'}
        if event.type=='LEFTMOUSE' and event.value=='PRESS':
            key=pick(c,event,_catalog)
            if key:
                if _catalog[key]['protected']:self.report({'WARNING'},'花に直接つながる枝全体は保護されています')
                elif key in _selected:_selected.remove(key)
                else:_selected.add(key)
                redraw()
            return {'RUNNING_MODAL'}
        if event.type in {'MIDDLEMOUSE','WHEELUPMOUSE','WHEELDOWNMOUSE','MOUSEMOVE','INBETWEEN_MOUSEMOVE','TRACKPADPAN','TRACKPADZOOM'}:return {'PASS_THROUGH'}
        return {'RUNNING_MODAL'}
    def cancel(self,c):stop()

class MINIA_PT_interval_delete(bpy.types.Panel):
    bl_label='区間の削除';bl_idname='MINIA_PT_interval_delete';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='MINI_A 色付き補強'
    def draw(self,c):
        layout=self.layout
        layout.operator('mini_a.interval_delete',icon='SELECT_SUBTRACT')
        if _running:layout.label(text=f'選択中：{len(_selected)}区間')
        layout.label(text='クリックで複数選択・選択解除')
        layout.label(text='Enter / X：削除　Esc：終了')
        layout.label(text='花に直接つながる枝全体は削除不可')
        layout.label(text='元の内部枝・追加枝の区間を削除')

def register():
    global _protected,_contacts,_contact_tree,_tables,_segment_arcs,_mask_raw
    stop();_protected=None;_contacts=None;_contact_tree=None;_tables=None;_segment_arcs=None;_mask_raw=None
    for module,name in ((mp,'scan_hook.py'),(mp,'graph_hook.py'),(author,'preview_hook.py'),(clip,'pick_hook.py')):
        module.__dict__['_interval_delete']=sys.modules[__name__]
        exec(compile((HERE/name).read_text(encoding='utf-8'),str(HERE/name),'exec'),module.__dict__)
    mp._replace_author_preview=author._replace_author_preview
    mp._screen_pick=clip._clip_aware_pick;auto.source_gaps=active_gaps
    for cls in (MINIA_OT_interval_delete,MINIA_PT_interval_delete):
        if not hasattr(bpy.types,cls.__name__):bpy.utils.register_class(cls)
