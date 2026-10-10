"""MINIA display repair: preserve author editing, selection marker and shortcuts."""
import sys,bpy
from pathlib import Path
from bpy.app.handlers import persistent
OUT=Path(__file__).resolve().parent
for p in (OUT/'color_author_runtime',OUT/'selected_point_runtime'):
    if str(p) not in sys.path:sys.path.insert(0,str(p))
import author_scoring_runtime as author
import selected_point_overlay as marker
_depth=author.depth
# Keep one unwrapped base function across any same-session re-registration.
if not hasattr(_depth,'_display_fix_base_range'):
    _depth._display_fix_base_range=_depth._range
_base_range=_depth._display_fix_base_range
_depth.FAR_FACTOR=0.16
def _display_fix_range(direction):
    lo,hi=_base_range(direction);span=hi-lo
    return lo+span*0.10,hi-span*0.10
_depth._range=_display_fix_range

def _selection_snapshot():
    obj=bpy.data.objects.get(marker.ANCHOR)
    if obj is None or bpy.context.mode!='EDIT_MESH' or bpy.context.view_layer.objects.active!=obj:return None
    import bmesh
    bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();active=bm.select_history.active
    return ([v.index for v in bm.verts if v.select],active.index if isinstance(active,bmesh.types.BMVert) else -1)
def _selection_restore(snapshot):
    if snapshot is None:return
    import bmesh
    obj=bpy.data.objects.get(marker.ANCHOR)
    if obj is None:return
    if obj.mode!='EDIT':bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.select_history.clear();selected,active=snapshot;selected=set(selected)
    for v in bm.verts:v.select_set(v.index in selected)
    if 0<=active<len(bm.verts) and bm.verts[active].select:bm.select_history.add(bm.verts[active])
    bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
@persistent
def _activate_after_open(_unused):
    try:
        s=_selection_snapshot();author.register(enter_edit_mode=True);_selection_restore(s);marker.register();_depth._refresh_view(bpy.context.scene,force=True)
        bpy.context.scene['selected_point_overlay_state']='READY';bpy.context.scene['depth_display_fix']='FAR_016_RANGE_10_PERCENT'
    except Exception as exc:
        bpy.context.scene['selected_point_overlay_state']='HOLD';bpy.context.scene['selected_point_overlay_reason']=repr(exc)
if _activate_after_open not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_activate_after_open)
_initial=_selection_snapshot();author.register(enter_edit_mode=True);_selection_restore(_initial);marker.register();_depth._refresh_view(bpy.context.scene,force=True)
bpy.context.scene['selected_point_overlay_state']='READY';bpy.context.scene['depth_display_fix']='FAR_016_RANGE_10_PERCENT'
class MINIA_OT_quick_point(bpy.types.Operator):
    bl_idname='mini_a.quick_point';bl_label='途中に点を追加'
    @classmethod
    def poll(cls,c):return c.area is not None and c.area.type=='VIEW_3D' and c.mode=='EDIT_MESH' and c.active_object is not None and c.active_object.name==marker.ANCHOR
    def invoke(self,c,e):return bpy.ops.mini_a.add_midpoint('INVOKE_DEFAULT')
class MINIA_OT_quick_color(bpy.types.Operator):
    bl_idname='mini_a.quick_color';bl_label='色を更新'
    @classmethod
    def poll(cls,c):return MINIA_OT_quick_point.poll(c)
    def execute(self,c):return bpy.ops.mini_a.update_midpoint_colors('EXEC_DEFAULT')
class MINIA_PT_shortcuts(bpy.types.Panel):
    bl_label='操作ショートカット';bl_idname='MINIA_PT_shortcuts_display_fixed';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='MINI_A 色付き補強'
    def draw(self,c):
        self.layout.label(text='Ctrl + Shift + Alt + A : 途中点 → 線をクリック')
        self.layout.label(text='Ctrl + Shift + R : 色を更新')
        self.layout.label(text='奥行き: 手前は鮮明、奥も色が残ります')
for cls in (MINIA_OT_quick_point,MINIA_OT_quick_color,MINIA_PT_shortcuts):
    if not hasattr(bpy.types,cls.__name__):bpy.utils.register_class(cls)
_kc=bpy.context.window_manager.keyconfigs.addon
if _kc:
    _km=_kc.keymaps.get('Mesh') or _kc.keymaps.new(name='Mesh',space_type='EMPTY')
    _wanted=[('mini_a.quick_point','A',True),('mini_a.quick_color','R',False)]
    for op,key,alt in _wanted:
        exists=any(i.idname==op and i.type==key and i.ctrl and i.shift and i.alt==alt for i in _km.keymap_items)
        if not exists:_km.keymap_items.new(op,key,'PRESS',ctrl=True,shift=True,alt=alt)
bpy.context.scene['minia_shortcuts_registered']=2
print('MINIA_DISPLAY_FIXED_READY',_depth.FAR_FACTOR,'range_trim',.10,flush=True)
