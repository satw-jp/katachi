"""Screen-space selection marker for the author's in-progress MINI_A mesh."""
import bpy, bmesh, gpu
from bpy.app.handlers import persistent
from gpu_extras.batch import batch_for_shader
from mathutils import Vector

ANCHOR = 'AUTHOR_EDIT_ALL • protected point baseline'
PANEL_ID = 'VIEW3D_PT_minia_selected_point_overlay'
_HANDLER = None
_REGISTERED = False


def selected_world_points(context):
    """Read live Edit-Mode selection; return stable indices, world coords, active flag."""
    obj = bpy.data.objects.get(ANCHOR)
    if obj is None or context.mode != 'EDIT_MESH' or context.view_layer.objects.active != obj:
        return []
    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    active = bm.select_history.active
    active_index = active.index if isinstance(active, bmesh.types.BMVert) else -1
    out = []
    for v in bm.verts:
        if v.select:
            p = obj.matrix_world @ v.co
            out.append((int(v.index), (float(p.x), float(p.y), float(p.z)), v.index == active_index))
    return out


def _circle(shader, xy, radius, color, segments=24):
    coords=[]
    for i in range(segments+1):
        a=(i/segments)*6.283185307179586
        coords.append((xy[0]+radius*__import__('math').cos(a),xy[1]+radius*__import__('math').sin(a)))
    batch_for_shader(shader,'LINE_STRIP',{'pos':coords}).draw(shader)


def _draw():
    context=bpy.context
    if not context or not context.scene or not context.scene.get('selected_point_overlay_enabled', True):
        return
    if context.area is None or context.area.type!='VIEW_3D':
        return
    region=context.region
    if region is None or region.type!='WINDOW':
        return
    space=context.space_data
    rv3d=space.region_3d if space else None
    if rv3d is None:
        return
    from bpy_extras import view3d_utils
    points=selected_world_points(context)
    if not points:
        return
    shader=gpu.shader.from_builtin('UNIFORM_COLOR')
    gpu.state.blend_set('ALPHA')
    gpu.state.line_width_set(2.0)
    try:
        for _idx,world,is_active in points:
            xy=view3d_utils.location_3d_to_region_2d(region,rv3d,Vector(world))
            if xy is None:
                continue
            # Dark halo keeps the marker readable over all risk colors; orange fill
            # identifies selected points, and active vertex receives a white outer ring.
            shader.bind();shader.uniform_float('color',(0.015,0.02,0.025,0.98))
            _circle(shader,xy,11.0 if is_active else 9.5,(0,0,0,1))
            shader.bind();shader.uniform_float('color',(1.0,0.48,0.015,1.0))
            _circle(shader,xy,8.0 if is_active else 6.5,(1,0.48,0.015,1))
            if is_active:
                shader.bind();shader.uniform_float('color',(1.0,1.0,0.92,1.0))
                _circle(shader,xy,12.0,(1,1,1,1))
    finally:
        gpu.state.line_width_set(1.0)
        gpu.state.blend_set('NONE')


class VIEW3D_PT_minia_selected_point_overlay(bpy.types.Panel):
    bl_label='選択点マーカー'
    bl_idname=PANEL_ID
    bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='MINI_A'
    def draw(self,context):
        col=self.layout.column(align=True)
        col.prop(context.scene,'selected_point_overlay_enabled',text='選択点を大きく表示')
        col.label(text='選択点のみ画面上で強調します')
        col.label(text='編集メッシュや未選択点は変更しません')


@persistent
def _load_post(_unused):
    _ensure_handler()


def _ensure_handler():
    global _HANDLER
    if _HANDLER is not None:
        try:bpy.types.SpaceView3D.draw_handler_remove(_HANDLER,'WINDOW')
        except Exception:pass
    _HANDLER=bpy.types.SpaceView3D.draw_handler_add(_draw,(), 'WINDOW','POST_PIXEL')


def register():
    global _REGISTERED
    if not hasattr(bpy.types.Scene,'selected_point_overlay_enabled'):
        bpy.types.Scene.selected_point_overlay_enabled=bpy.props.BoolProperty(name='選択点マーカー',default=True)
    if not _REGISTERED:
        bpy.utils.register_class(VIEW3D_PT_minia_selected_point_overlay)
        _REGISTERED=True
    if _load_post not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_load_post)
    _ensure_handler()
    return True


def unregister():
    global _HANDLER,_REGISTERED
    if _HANDLER is not None:
        try:bpy.types.SpaceView3D.draw_handler_remove(_HANDLER,'WINDOW')
        except Exception:pass
        _HANDLER=None
    if _load_post in bpy.app.handlers.load_post:bpy.app.handlers.load_post.remove(_load_post)
    if _REGISTERED:
        bpy.utils.unregister_class(VIEW3D_PT_minia_selected_point_overlay);_REGISTERED=False
    if hasattr(bpy.types.Scene,'selected_point_overlay_enabled'):
        del bpy.types.Scene.selected_point_overlay_enabled
