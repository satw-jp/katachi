"""Independent axis clipping, clip-aware picking and visible selection for MINI_A quad panes."""
import bpy,math,json
from types import SimpleNamespace
from mathutils import Vector
from bpy_extras import view3d_utils
import author_scoring_runtime as author
import selected_point_overlay as marker
import quad_view_adapter as quad
mp=author.depth.midpoint;depth=author.depth
_ORIGINAL_INSTALL=getattr(depth,'_view_clip_original_install',depth._install_depth_materials)
_BOUNDS=None
_AXIS_PROPS={0:('minia_clip_x_start','minia_clip_x_end'),1:('minia_clip_y_start','minia_clip_y_end'),2:('minia_clip_z_start','minia_clip_z_end')}
_REGISTERED=False


def _source_bounds(scene=None):
    global _BOUNDS
    if _BOUNDS is None:
        cache,_,_,_=mp._read_data(scene)
        pts=[p for seg in cache['segments'] for p in (seg['a'],seg['b'])]
        _BOUNDS=([min(float(p[i]) for p in pts) for i in range(3)],[max(float(p[i]) for p in pts) for i in range(3)])
    return _BOUNDS

def _axis_for_region(rd):
    # The quad adapter keeps this stable order: top, front, right, user axonometric.
    # Force the fourth RegionView3D to remain unclipped even when rotated near an axis.
    screen=bpy.context.window.screen if bpy.context.window else bpy.context.screen
    area=next((a for a in screen.areas if a.type=='VIEW_3D'),None) if screen else None
    if area is not None:
        qviews=area.spaces.active.region_quadviews
        if len(qviews)==4 and rd.as_pointer()==qviews[3].as_pointer():return None
    eye=rd.view_rotation@Vector((0,0,1));axis=max(range(3),key=lambda i:abs(float(eye[i])))
    return axis if abs(float(eye[axis]))>.98 else None

def _pct(scene,axis):
    a,b=_AXIS_PROPS[axis];lo=max(0.,min(100.,float(getattr(scene,a))));hi=max(0.,min(100.,float(getattr(scene,b))))
    if lo>hi:lo,hi=hi,lo
    return lo,hi

def _axis_range(scene,axis):
    lo,hi=_pct(scene,axis)
    if lo<=1e-7 and hi>=100.-1e-7:return None
    mins,maxs=_source_bounds(scene);return mins[axis]+(maxs[axis]-mins[axis])*lo/100.,mins[axis]+(maxs[axis]-mins[axis])*hi/100.

def _line_clip(a,b,axis,low,high):
    """Return visible interval t0,t1 in original segment coordinates, or None."""
    av=float(a[axis]);bv=float(b[axis]);d=bv-av
    if abs(d)<1e-12:return (0.,1.) if low-1e-8<=av<=high+1e-8 else None
    t0=(low-av)/d;t1=(high-av)/d
    enter=max(0.,min(t0,t1));leave=min(1.,max(t0,t1))
    if enter>leave+1e-10:return None
    return max(0.,enter),min(1.,leave)

def _lerp(a,b,t):return [float(a[i])+(float(b[i])-float(a[i]))*float(t) for i in range(3)]

def _deselect_anchor():
    obj=bpy.data.objects.get(mp.ANCHOR)
    if obj is None or bpy.context.mode!='EDIT_MESH' or bpy.context.view_layer.objects.active!=obj:return
    import bmesh
    bm=bmesh.from_edit_mesh(obj.data)
    for v in bm.verts:v.select_set(False)
    bm.select_history.clear();bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)

def _set_planes(q,axis,scene):
    q.use_box_clip=False
    if axis is None:
        q.use_clip_planes=False;return
    interval=_axis_range(scene,axis)
    if interval is None:
        q.use_clip_planes=False;return
    mins,maxs=_source_bounds(scene);span=max(maxs[i]-mins[i] for i in range(3));pad=max(0.05*span,0.01)
    low=[mins[i]-pad for i in range(3)];high=[maxs[i]+pad for i in range(3)]
    low[axis],high[axis]=interval
    planes=[]
    for i in range(3):
        n=[0.,0.,0.];n[i]=1.;planes.extend((*n,-float(low[i])))
        n=[0.,0.,0.];n[i]=-1.;planes.extend((*n,float(high[i])))
    if len(q.clip_planes)==6 and all(len(p)==4 for p in q.clip_planes):
        for i,value in enumerate(planes):q.clip_planes[i//4][i%4]=float(value)
    elif len(q.clip_planes)==24:
        for i,value in enumerate(planes):q.clip_planes[i]=float(value)
    else:raise RuntimeError(f'unexpected clip plane storage shape: {[len(p) for p in q.clip_planes]}')
    q.use_clip_planes=True

def apply_clips(scene=None):
    scene=scene or bpy.context.scene
    screen=bpy.context.window.screen if bpy.context.window else bpy.context.screen
    area=next((a for a in screen.areas if a.type=='VIEW_3D'),None) if screen else None
    if area is None:return 0
    space=area.spaces.active;qviews=space.region_quadviews
    if len(qviews)!=4:return 0
    mapping=[]
    for q in qviews:
        axis=_axis_for_region(q);_set_planes(q,axis,scene)
        flat=([float(v) for p in q.clip_planes for v in p] if len(q.clip_planes)==6 else [float(v) for v in q.clip_planes])
        mapping.append({'axis':axis,'range_pct':list(_pct(scene,axis)) if axis is not None else None,'clip_enabled':bool(q.use_clip_planes),'planes':flat})
    scene['quad_clip_regions_json']=json.dumps(mapping,separators=(',',':'))
    return len(qviews)

def _range_update(_self,_context):
    scene=bpy.context.scene
    if not scene:return
    apply_clips(scene)
    # Range changes invalidate prior vertex selection so an old off-range point cannot be F-connected.
    _deselect_anchor();scene['quad_clip_selection_reset']=True

def _region_axis_range(rd,scene):
    axis=_axis_for_region(rd)
    return axis,_axis_range(scene,axis) if axis is not None else None

def _clip_aware_pick(context,event,state):
    region,rd=quad._window_region_data(context,event)
    if region is None or rd is None:return None
    axis,interval=_region_axis_range(rd,bpy.context.scene)
    area=context.area;xy=(int(event.mouse_x)-region.x,int(event.mouse_y)-region.y)
    if not(0<=xy[0]<region.width and 0<=xy[1]<region.height):return None
    ray_o=view3d_utils.region_2d_to_origin_3d(region,rd,xy);ray_d=view3d_utils.region_2d_to_vector_3d(region,rd,xy).normalized();candidates=[]
    def test(kind,a,b,meta):
        av=list(a);bv=list(b);tlo,thi=(0.,1.)
        if axis is not None and interval is not None:
            clipped=_line_clip(av,bv,axis,*interval)
            if clipped is None:return
            tlo,thi=clipped;av=_lerp(a,b,tlo);bv=_lerp(a,b,thi)
        va,vb=Vector(av),Vector(bv);u=vb-va;w=ray_o-va;aa=u.dot(u);bb=u.dot(ray_d);dd=u.dot(w);ee=ray_d.dot(w);den=aa-bb*bb
        if aa<1e-12:return
        local=max(0.,min(1.,(dd-bb*ee)/den if abs(den)>1e-12 else .5));point=va+u*local;depth_along=(point-ray_o).dot(ray_d)
        if depth_along<=0:return
        p2=view3d_utils.location_3d_to_region_2d(region,rd,point)
        if p2 is None:return
        pix=math.hypot(float(p2.x)-xy[0],float(p2.y)-xy[1])
        if pix>12:return
        t=tlo+(thi-tlo)*local;fullpoint=_lerp(a,b,t)
        candidates.append({'kind':kind,'position':fullpoint,'pixel_distance':pix,'depth':depth_along,'t':t,**meta})
    for i,seg in enumerate(state['cache']['segments']):test('source_segment',seg['a'],seg['b'],{'segment_index':i})
    if state['bm'] is None:raise RuntimeError('Edit Mode is required for midpoint picking')
    intervals=mp._edge_interval_map(state['roots']);bm=state['bm'];bm.verts.ensure_lookup_table();bm.verts.index_update()
    for edge in bm.edges:
        va,vb=edge.verts;ida=state['id_by_index'].get(va.index);idb=state['id_by_index'].get(vb.index)
        if not ida or not idb:continue
        item=intervals.get(tuple(sorted((ida,idb))))
        if item is None:continue
        ri,tmap=item;pa=list(mp._world(state['obj'],va.co));pb=list(mp._world(state['obj'],vb.co));before=len(candidates)
        test('author_edge',pa,pb,{'root_index':ri,'root_t0':tmap[ida],'root_t1':tmap[idb],'edge':edge,'edge_start':va,'edge_pair_orientation':(ida,idb)})
        if len(candidates)>before:
            c=candidates[-1];c['root_t']=tmap[ida]+(tmap[idb]-tmap[ida])*c['t'];c['edge_t']=c['t']
    return min(candidates,key=lambda c:(c['depth'],c['pixel_distance'])) if candidates else None

def _clip_aware_marker_draw():
    context=bpy.context
    if not context or not context.scene or not context.scene.get('selected_point_overlay_enabled',True):return
    region=context.region;area=context.area;rd=context.region_data
    if area is None or area.type!='VIEW_3D' or region is None or region.type!='WINDOW' or rd is None:return
    axis,interval=_region_axis_range(rd,context.scene);points=marker.selected_world_points(context)
    if axis is not None and interval is not None:points=[p for p in points if interval[0]-1e-6<=p[1][axis]<=interval[1]+1e-6]
    if not points:return
    import gpu
    from gpu_extras.batch import batch_for_shader
    shader=gpu.shader.from_builtin('UNIFORM_COLOR');gpu.state.blend_set('ALPHA');gpu.state.line_width_set(2.)
    try:
        for _idx,world,active in points:
            xy=view3d_utils.location_3d_to_region_2d(region,rd,Vector(world))
            if xy is None:continue
            rings=[(11. if active else 9.5,(.01,.015,.02,.98)),(8. if active else 6.5,(1.,.48,.015,1.))]
            if active:rings.append((12.,(1.,1.,.92,1.)))
            for radius,color in rings:
                coords=[(xy.x+radius*math.cos(2*math.pi*i/24),xy.y+radius*math.sin(2*math.pi*i/24)) for i in range(25)]
                shader.bind();shader.uniform_float('color',color);batch_for_shader(shader,'LINE_STRIP',{'pos':coords}).draw(shader)
    finally:gpu.state.line_width_set(1.);gpu.state.blend_set('NONE')

def _solid_material_view():
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                shading=area.spaces.active.shading;shading.type='SOLID';shading.color_type='MATERIAL';shading.light='FLAT'

def _install_colors(scene=None):
    out=_ORIGINAL_INSTALL(scene);_solid_material_view();apply_clips(scene);return out

def install():
    global _REGISTERED
    if not hasattr(depth,'_view_clip_original_install'):depth._view_clip_original_install=depth._install_depth_materials
    depth._install_depth_materials=_install_colors;mp._screen_pick=_clip_aware_pick;marker._draw=_clip_aware_marker_draw
    if marker._HANDLER is not None:marker._ensure_handler()
    for name,label in (('minia_clip_z_start','上面 Z 開始%'),('minia_clip_z_end','上面 Z 終了%'),('minia_clip_y_start','前面 Y 開始%'),('minia_clip_y_end','前面 Y 終了%'),('minia_clip_x_start','側面 X 開始%'),('minia_clip_x_end','側面 X 終了%')):
        if not hasattr(bpy.types.Scene,name):setattr(bpy.types.Scene,name,bpy.props.FloatProperty(name=label,min=0.,max=100.,default=0. if name.endswith('start') else 100.,precision=1,update=_range_update))
    _REGISTERED=True
    return True

class MINI_A_PT_axis_clip(bpy.types.Panel):
    bl_label='各画面の表示範囲';bl_idname='MINIA_PT_axis_clip';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='MINI_A 色付き補強'
    def draw(self,context):
        s=context.scene;l=self.layout;l.label(text='各軸の最小0% → 最大100%')
        for label,a,b in (('上 • Z','minia_clip_z_start','minia_clip_z_end'),('前 • Y','minia_clip_y_start','minia_clip_y_end'),('横 • X','minia_clip_x_start','minia_clip_x_end')):
            row=l.row(align=True);row.label(text=label);row.prop(s,a,text='');row.prop(s,b,text='')
        l.label(text='範囲変更時は選択を解除します')
        l.label(text='アクソメは全体表示')

def register():
    global _REGISTERED
    install()
    if not hasattr(bpy.types,'MINI_A_PT_axis_clip'):
        bpy.utils.register_class(MINI_A_PT_axis_clip)
    scene=bpy.context.scene
    mins,maxs=_source_bounds(scene)
    scene['view_clip_source_bounds_json']=json.dumps({'min':mins,'max':maxs},separators=(',',':'))
    apply_clips(scene)
    _solid_material_view()
    return True
