"""Region-correct picking, markers and quad-view setup for MINI_A."""
import bpy,math
from types import SimpleNamespace
from mathutils import Vector
from bpy_extras import view3d_utils
import author_scoring_runtime as author
import selected_point_overlay as marker
mp=author.depth.midpoint;depth=author.depth
_ORIGINAL_PICK=mp._screen_pick
_ORIGINAL_REFRESH=getattr(depth,'_quad_adapter_original_refresh',depth._refresh_view)

def _window_region_data(context,event):
    area=context.area
    if area is None or area.type!='VIEW_3D':return None,None
    x,y=int(event.mouse_x),int(event.mouse_y)
    found=[r for r in area.regions if r.type=='WINDOW' and r.x<=x<r.x+r.width and r.y<=y<r.y+r.height]
    if len(found)!=1:return None,None
    region=found[0]
    try:
        with bpy.context.temp_override(window=context.window,screen=context.screen,area=area,region=region):rd=bpy.context.region_data
    except Exception:return None,None
    return (region,rd) if rd is not None else (None,None)

def _quad_pick(context,event,state):
    region,rd=_window_region_data(context,event)
    if region is None:return None
    proxy=SimpleNamespace(area=SimpleNamespace(spaces=SimpleNamespace(active=SimpleNamespace(region_3d=rd)),regions=[region]))
    return _ORIGINAL_PICK(proxy,event,state)

def _force_flat_depth(scene=None):
    scene=scene or bpy.context.scene
    if not scene or not scene.get('quadview_depth_disabled',False):return
    for mat in depth._MATERIALS.values():
        if mat and mat.node_tree:
            node=next((n for n in mat.node_tree.nodes if n.bl_idname=='ShaderNodeMapRange'),None)
            if node:node.inputs['To Max'].default_value=1.0

def _quad_safe_refresh(scene=None,force=False,direction=None):
    out=_ORIGINAL_REFRESH(scene,force,direction);_force_flat_depth(scene);return out

def _marker_draw():
    context=bpy.context
    if not context or not context.scene or not context.scene.get('selected_point_overlay_enabled',True):return
    region=context.region;area=context.area;rd=context.region_data
    if area is None or area.type!='VIEW_3D' or region is None or region.type!='WINDOW' or rd is None:return
    points=marker.selected_world_points(context)
    if not points:return
    import gpu
    from gpu_extras.batch import batch_for_shader
    shader=gpu.shader.from_builtin('UNIFORM_COLOR');gpu.state.blend_set('ALPHA');gpu.state.line_width_set(2.0)
    try:
        for _idx,world,active in points:
            xy=view3d_utils.location_3d_to_region_2d(region,rd,Vector(world))
            if xy is None:continue
            rings=[(11.0 if active else 9.5,(.01,.015,.02,.98)),(8.0 if active else 6.5,(1,.48,.015,1))]
            if active:rings.append((12.0,(1,1,.92,1)))
            for radius,color in rings:
                coords=[(xy.x+radius*math.cos(2*math.pi*i/24),xy.y+radius*math.sin(2*math.pi*i/24)) for i in range(25)]
                shader.bind();shader.uniform_float('color',color);batch_for_shader(shader,'LINE_STRIP',{'pos':coords}).draw(shader)
    finally:gpu.state.line_width_set(1.0);gpu.state.blend_set('NONE')

def install():
    if not hasattr(depth,'_quad_adapter_original_refresh'):depth._quad_adapter_original_refresh=depth._refresh_view
    depth._refresh_view=_quad_safe_refresh;mp._screen_pick=_quad_pick;marker._draw=_marker_draw
    if marker._HANDLER is not None:marker._ensure_handler()
    return True

def _quad_orientations(area):
    space=area.spaces.active
    if len(space.region_quadviews)!=4:
        window=bpy.context.window;region=next((r for r in area.regions if r.type=='WINDOW'),None)
        if window is None or region is None:raise RuntimeError('active window/3D region unavailable for quad view')
        with bpy.context.temp_override(window=window,screen=window.screen,area=area,region=region):bpy.ops.screen.region_quadview()
        space=area.spaces.active
    qviews=space.region_quadviews
    if len(qviews)!=4:raise RuntimeError(f'quadview API produced {len(qviews)} views')
    from mathutils import Euler,Quaternion
    axo=Euler((math.radians(65),0,math.radians(45)),'XYZ').to_quaternion()
    rotations=(Quaternion((1,0,0,0)),Euler((math.pi/2,0,0),'XYZ').to_quaternion(),Euler((math.pi/2,0,math.pi/2),'XYZ').to_quaternion(),axo)
    obj=bpy.data.objects.get(marker.ANCHOR);points=[obj.matrix_world@v.co for v in obj.data.vertices]
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    center=Vector(tuple((lo[i]+hi[i])*.5 for i in range(3)));distance=max(hi[i]-lo[i] for i in range(3))*1.8
    for q,rotation in zip(qviews,rotations):q.view_rotation=rotation;q.view_perspective='ORTHO';q.view_location=center;q.view_distance=distance
    return {'qview_count':len(qviews),'center':list(center),'distance':float(distance),'window_region_count':len([r for r in area.regions if r.type=='WINDOW'])}

def configure():
    screen=bpy.context.window.screen if bpy.context.window else bpy.context.screen
    area=next((a for a in screen.areas if a.type=='VIEW_3D'),None) if screen else None
    if area is None:raise RuntimeError('active screen has no 3D View')
    info=_quad_orientations(area);scene=bpy.context.scene;scene['quadview_depth_disabled']=True;scene['quadview_enabled']=True
    import json
    scene['quadview_info_json']=json.dumps(info,separators=(',',':'))
    _force_flat_depth(scene)
    return info
