"""Independent axis clipping, clip-aware picking and visible selection for MINI_A quad panes."""
import bpy,math,json
from types import SimpleNamespace
from mathutils import Vector,Euler,Matrix
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
    screen=bpy.context.screen
    if screen:
        for area in screen.areas:
            if area.type!='VIEW_3D':continue
            qs=area.spaces.active.region_quadviews
            if len(qs)!=4:continue
            for i,q in enumerate(qs):
                if rd.as_pointer()==q.as_pointer():return (2,1,0,None)[i]
    return None


def _pct(scene,axis):
    a,b=_AXIS_PROPS[axis];lo=max(0.,min(100.,float(getattr(scene,a))));hi=max(0.,min(100.,float(getattr(scene,b))))
    if lo>hi:lo,hi=hi,lo
    return lo,hi

_PROJECTED_BOUNDS={}
def _clip_direction(scene,axis):
    n=Vector(tuple(1. if i==axis else 0. for i in range(3)))
    if scene.minia_clip_shared and scene.minia_clip_tilt:
        angles=[math.radians(getattr(scene,'minia_clip_tilt_'+a)) for a in 'xyz']
        n=Euler(angles,'XYZ').to_matrix()@n
    return n.normalized()

def _projection_bounds(scene,axis):
    n=_clip_direction(scene,axis);key=tuple(round(v,10) for v in n)
    if key not in _PROJECTED_BOUNDS:
        cache,_,_,_=mp._read_data(scene)
        values=[n.dot(Vector(p)) for seg in cache['segments'] for p in (seg['a'],seg['b'])]
        _PROJECTED_BOUNDS.clear();_PROJECTED_BOUNDS[key]=(min(values),max(values))
    return _PROJECTED_BOUNDS[key]

def _applied_direction(scene,axis):
    if axis is None:return None
    values=json.loads(scene.get('view_clip_applied_directions','{}'))
    return Vector(values.get(str(axis),tuple(1. if i==axis else 0. for i in range(3))))

def _axis_range(scene,axis):
    lo,hi=_pct(scene,axis)
    if lo<=1e-7 and hi>=100.-1e-7:return None
    lower,upper=_projection_bounds(scene,axis);return lower+(upper-lower)*lo/100.,lower+(upper-lower)*hi/100.

def _line_clip(a,b,axis,low,high,direction=None):
    """Return visible interval t0,t1 in original segment coordinates, or None."""
    av=Vector(a).dot(direction) if direction is not None else float(a[axis]);bv=Vector(b).dot(direction) if direction is not None else float(b[axis]);d=bv-av
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

def _region_for_q(area,q):
    for region in area.regions:
        if region.type!='WINDOW':continue
        with bpy.context.temp_override(area=area,region=region):
            rd=bpy.context.region_data
            if rd and rd.as_pointer()==q.as_pointer():return region
    raise RuntimeError('3D pane unavailable')


def _clear_native_clip(q):
    if not q.use_clip_planes:return
    if bpy.app.background:
        q.use_clip_planes=False
    else:
        bpy.ops.view3d.clip_border('INVOKE_DEFAULT')
        if q.use_clip_planes:
            q.use_clip_planes=False
            raise RuntimeError('Clip reset failed; clipping disabled')


def _set_planes(q,axis,scene):
    # Never set use_clip_planes=True directly: Blender 5.2.2 requires clipbb,
    # allocated and populated only by its native clip_border operator.
    area=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
    region=_region_for_q(area,q)
    interval=_axis_range(scene,axis) if axis is not None else None
    with bpy.context.temp_override(area=area,region=region):
        _clear_native_clip(q)
        if interval is None:return
        if bpy.app.background:
            scene['view_clip_state']='DEFERRED_TO_VIEWPORT'
            return
        from mathutils import Euler,Quaternion
        old=(q.view_rotation.copy(),q.view_location.copy(),q.view_distance,q.view_perspective)
        try:
            lo,hi=interval
            if hi-lo<1e-6:hi=lo+1e-6
            mins,maxs=_source_bounds(scene)
            center=Vector([(mins[i]+maxs[i])*.5 for i in range(3)])
            normal=_clip_direction(scene,axis)
            center+=normal*((lo+hi)*.5-center.dot(normal))
            # Construct the depth slab from a perpendicular temporary view.
            helper=Vector((0,0,1)) if abs(normal.z)<.9 else Vector((0,1,0))
            up=(helper-normal*helper.dot(normal)).normalized()
            look=normal.cross(up).normalized()
            q.view_rotation=Matrix((normal,up,look)).transposed().to_quaternion()
            q.view_location=center;q.view_perspective='ORTHO'
            q.view_distance=max(maxs[i]-mins[i] for i in range(3))*2
            q.update()
            component=0
            size=region.width if component==0 else region.height
            edge0=max(1,size//4);edge1=size-edge0
            p0=center+normal*(lo-(lo+hi)*.5);p1=center+normal*(hi-(lo+hi)*.5)
            def project(p):return view3d_utils.location_3d_to_region_2d(region,q,p)
            u,v=project(p0),project(p1)
            q.view_distance*=abs(v[component]-u[component])/(edge1-edge0)
            q.update()
            u,v=project(p0),project(p1)
            if u is None or v is None:raise RuntimeError('Cannot project clip interval')
            low,high=sorted((round(u[component]),round(v[component])))
            if high<=low:raise RuntimeError('Clip interval too narrow')
            # The other screen axis and projection depth cover the model.
            corners=[Vector((x,y,z)) for x in (mins[0],maxs[0]) for y in (mins[1],maxs[1]) for z in (mins[2],maxs[2])]
            side=[project(p)[1-component] for p in corners]
            pad=max(10.,(max(side)-min(side))*.1)
            side0=math.floor(min(side)-pad);side1=math.ceil(max(side)+pad)
            box=dict(xmin=low,xmax=high,ymin=side0,ymax=side1) if component==0 else dict(xmin=side0,xmax=side1,ymin=low,ymax=high)
            result=bpy.ops.view3d.clip_border('EXEC_DEFAULT',**box)
            if 'FINISHED' not in result:raise RuntimeError('Native clipping initialization failed')
            # Native border creates four side planes; discard stale old 6-plane values.
            for i in (4,5):
                for j in range(4):q.clip_planes[i][j]=0.
            scene['view_clip_state']='READY'
        except Exception:
            _clear_native_clip(q)
            raise
        finally:
            q.view_rotation,q.view_location,q.view_distance,q.view_perspective=old
            q.update()
            area.tag_redraw()


def apply_clips(scene=None):
    scene=scene or bpy.context.scene
    screen=bpy.context.window.screen if bpy.context.window else bpy.context.screen
    area=next((a for a in screen.areas if a.type=='VIEW_3D'),None) if screen else None
    if area is None:return 0
    space=area.spaces.active;qviews=list(space.region_quadviews)
    if not qviews:qviews=[space.region_3d]
    for q in qviews:
        if q.use_box_clip:q.use_box_clip=False
    if len(qviews) not in (1,4):return 0
    mapping=[]
    for q in qviews:
        axis=int(scene.minia_clip_shared_axis) if scene.minia_clip_shared else _axis_for_region(q);_set_planes(q,axis,scene)
        flat=([float(v) for p in q.clip_planes for v in p] if len(q.clip_planes)==6 else [float(v) for v in q.clip_planes])
        mapping.append({'axis':axis,'range_pct':list(_pct(scene,axis)) if axis is not None else None,'clip_enabled':bool(q.use_clip_planes),'planes':flat})
    scene['quad_clip_regions_json']=json.dumps(mapping,separators=(',',':'))
    scene['view_clip_applied_shared']=bool(scene.minia_clip_shared)
    scene['view_clip_applied_axis']=int(scene.minia_clip_shared_axis)
    scene['view_clip_applied_directions']=json.dumps({str(i):list(_clip_direction(scene,i)) for i in range(3)})
    scene['view_clip_applied_json']=json.dumps({str(i):_axis_range(scene,i) for i in range(3)})
    return len(qviews)

def _range_update(_self,_context):
    # Do not invoke viewport operators inside RNA numeric-drag callbacks.
    _self['view_clip_state']='PENDING'

class MINIA_OT_apply_ranges(bpy.types.Operator):
    bl_idname='mini_a.apply_view_ranges';bl_label='表示範囲を反映'
    def execute(self,context):
        try:
            apply_clips(context.scene);_deselect_anchor()
            context.scene['view_clip_state']='READY' if not bpy.app.background else 'DEFERRED_TO_VIEWPORT'
        except Exception as exc:
            context.scene['view_clip_state']='HOLD';context.scene['view_clip_error']=str(exc)
            self.report({'ERROR'},str(exc));return {'CANCELLED'}
        return {'FINISHED'}

class MINIA_OT_ortho_pan(bpy.types.Operator):
    bl_idname='mini_a.ortho_pan';bl_label='平行ビューをパン'
    @classmethod
    def poll(cls,c):
        return c.area is not None and c.area.type=='VIEW_3D' and c.region_data is not None and _axis_for_region(c.region_data) is not None
    def invoke(self,c,e):
        return bpy.ops.view3d.move('INVOKE_DEFAULT')

def _view_state(q):
    return dict(rotation=list(q.view_rotation),location=list(q.view_location),distance=q.view_distance,perspective=q.view_perspective,locked=q.lock_rotation)

def _restore_view(q,state):
    q.view_rotation=state['rotation'];q.view_location=state['location'];q.view_distance=state['distance'];q.view_perspective=state['perspective']
    if q.lock_rotation!=state['locked']:q.lock_rotation=state['locked']

class MINIA_OT_toggle_single(bpy.types.Operator):
    bl_idname='mini_a.toggle_single';bl_label='1画面 / 4画面 切替'
    @classmethod
    def poll(cls,c):return c.area is not None and c.area.type=='VIEW_3D'
    def execute(self,c):
        area=c.area;space=area.spaces.active;scene=c.scene;qs=list(space.region_quadviews)
        if len(qs)==4:
            saved=[_view_state(q) for q in qs]
            scene['minia_saved_quad_views']=json.dumps(saved)
            for q in qs:
                r=_region_for_q(area,q)
                with bpy.context.temp_override(area=area,region=r):_clear_native_clip(q)
            region=_region_for_q(area,qs[3])
            with bpy.context.temp_override(area=area,region=region):bpy.ops.screen.region_quadview()
            _restore_view(space.region_3d,saved[3]);scene['minia_single_view']=True
        else:
            saved=json.loads(scene.get('minia_saved_quad_views','[]'))
            if len(saved)!=4:
                self.report({'ERROR'},'戻す4画面の情報がありません');return {'CANCELLED'}
            region=_region_for_q(area,space.region_3d)
            with bpy.context.temp_override(area=area,region=region):
                _clear_native_clip(space.region_3d);bpy.ops.screen.region_quadview()
            for q in space.region_quadviews:
                if q.use_box_clip:q.use_box_clip=False
            for q,state in reversed(list(zip(space.region_quadviews,saved))):_restore_view(q,state)
            scene['minia_single_view']=False
        apply_clips(scene);area.tag_redraw()
        return {'FINISHED'}

def _lock_orthographic_views():
    from mathutils import Quaternion,Euler
    rotations=(Quaternion((1,0,0,0)),Euler((math.pi/2,0,0)).to_quaternion(),Euler((math.pi/2,0,math.pi/2)).to_quaternion())
    for a in bpy.context.screen.areas:
        if a.type!='VIEW_3D':continue
        qs=a.spaces.active.region_quadviews
        if len(qs)!=4:continue
        for q,rot in zip(qs,rotations):
            q.view_rotation=rot;q.view_perspective='ORTHO';q.lock_rotation=True
    for cls in (MINIA_OT_ortho_pan,MINIA_OT_apply_ranges,MINIA_OT_toggle_single):
        if not hasattr(bpy.types,cls.__name__):bpy.utils.register_class(cls)
    kc=bpy.context.window_manager.keyconfigs.addon
    if kc:
        km=kc.keymaps.get('3D View') or kc.keymaps.new(name='3D View',space_type='VIEW_3D')
        if not any(k.idname=='mini_a.ortho_pan' for k in km.keymap_items):km.keymap_items.new('mini_a.ortho_pan','MIDDLEMOUSE','PRESS',head=True)


def _region_axis_range(rd,scene):
    axis=int(scene.get('view_clip_applied_axis',2)) if scene.get('view_clip_applied_shared',False) else _axis_for_region(rd)
    applied=json.loads(scene.get('view_clip_applied_json','{}'))
    value=applied.get(str(axis))
    return axis,tuple(value) if value is not None else None

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
            clipped=_line_clip(av,bv,axis,*interval,direction=_applied_direction(bpy.context.scene,axis))
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
    if axis is not None and interval is not None:points=[p for p in points if interval[0]-1e-6<=Vector(p[1]).dot(_applied_direction(context.scene,axis))<=interval[1]+1e-6]
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
                shading=area.spaces.active.shading;shading.type='SOLID';shading.color_type='MATERIAL';shading.light='FLAT';shading.background_type='VIEWPORT';shading.background_color=(.012,.016,.025)

def _install_colors(scene=None):
    out=_ORIGINAL_INSTALL(scene);_solid_material_view();apply_clips(scene);return out

def install():
    global _REGISTERED
    if not hasattr(depth,'_view_clip_original_install'):depth._view_clip_original_install=depth._install_depth_materials
    depth._install_depth_materials=_install_colors;mp._screen_pick=_clip_aware_pick;marker._draw=_clip_aware_marker_draw
    if marker._HANDLER is not None:marker._ensure_handler()
    for name,label in (('minia_clip_z_start','上面 Z 開始%'),('minia_clip_z_end','上面 Z 終了%'),('minia_clip_y_start','前面 Y 開始%'),('minia_clip_y_end','前面 Y 終了%'),('minia_clip_x_start','側面 X 開始%'),('minia_clip_x_end','側面 X 終了%')):
        if not hasattr(bpy.types.Scene,name):setattr(bpy.types.Scene,name,bpy.props.FloatProperty(name=label,min=0.,max=100.,default=0. if name.endswith('start') else 100.,precision=1,update=_range_update))
    if not hasattr(bpy.types.Scene,'minia_clip_shared'):
        bpy.types.Scene.minia_clip_shared=bpy.props.BoolProperty(name='全ビュー共通',default=False,update=_range_update)
        bpy.types.Scene.minia_clip_shared_axis=bpy.props.EnumProperty(name='共通にする軸',items=[('2','Z','Zの範囲を4画面に適用'),('1','Y','Yの範囲を4画面に適用'),('0','X','Xの範囲を4画面に適用')],default='2',update=_range_update)
    if not hasattr(bpy.types.Scene,'minia_clip_tilt'):
        bpy.types.Scene.minia_clip_tilt=bpy.props.BoolProperty(name='クリップ面を傾ける',default=False,update=_range_update)
        for axis in 'xyz':
            setattr(bpy.types.Scene,'minia_clip_tilt_'+axis,bpy.props.FloatProperty(name=axis.upper()+'回転 (度)',default=0.,min=-180.,max=180.,precision=1,update=_range_update))
    _REGISTERED=True
    return True

class MINI_A_PT_axis_clip(bpy.types.Panel):
    bl_label='各画面の表示範囲';bl_idname='MINIA_PT_axis_clip';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='MINI_A 色付き補強'
    def draw(self,context):
        s=context.scene;l=self.layout
        single=not bool(context.space_data.region_quadviews)
        l.operator('mini_a.toggle_single',text='4画面に戻す' if single else 'アクソメを1画面にする')
        l.prop(s,'minia_clip_shared')
        if s.minia_clip_shared:
            l.prop(s,'minia_clip_shared_axis',expand=True)
            l.prop(s,'minia_clip_tilt')
            if s.minia_clip_tilt:
                for axis in 'xyz':l.prop(s,'minia_clip_tilt_'+axis)
                l.label(text='傾けた方向の最小0% → 最大100%')
        l.label(text='各軸の最小0% → 最大100%')
        for label,a,b in (('上 • Z','minia_clip_z_start','minia_clip_z_end'),('前 • Y','minia_clip_y_start','minia_clip_y_end'),('横 • X','minia_clip_x_start','minia_clip_x_end')):
            row=l.row(align=True)
            row.enabled=not s.minia_clip_shared or a=='minia_clip_'+{'2':'z','1':'y','0':'x'}[s.minia_clip_shared_axis]+'_start'
            row.label(text=label);row.prop(s,a,text='');row.prop(s,b,text='')
        l.operator('mini_a.apply_view_ranges',text='表示範囲を反映')
        l.label(text='数値入力後に反映を押してください')
        l.label(text='反映時は選択を解除します')
        l.label(text='4画面に同じ範囲を表示' if s.minia_clip_shared else 'アクソメは全体表示')
        if s.get('view_clip_state')=='HOLD':l.label(text=s.get('view_clip_error','範囲設定エラー'),icon='ERROR')

def register():
    global _REGISTERED
    install()
    if not hasattr(bpy.types,'MINI_A_PT_axis_clip'):
        bpy.utils.register_class(MINI_A_PT_axis_clip)
    scene=bpy.context.scene
    mins,maxs=_source_bounds(scene)
    scene['view_clip_source_bounds_json']=json.dumps({'min':mins,'max':maxs},separators=(',',':'))
    _lock_orthographic_views()
    _solid_material_view()
    apply_clips(scene)
    return True

