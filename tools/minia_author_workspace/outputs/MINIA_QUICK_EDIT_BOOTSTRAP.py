"""Open the explicitly saved in-progress author file with a selection marker."""
import sys
from pathlib import Path
import bpy
from bpy.app.handlers import persistent
OUTPUTS=Path(__file__).resolve().parent
RUNTIME=OUTPUTS/'color_author_runtime'
MARKERS=OUTPUTS/'selected_point_runtime'
for p in (RUNTIME,MARKERS):
    if str(p) not in sys.path:sys.path.insert(0,str(p))
import author_scoring_runtime
import selected_point_overlay

def _selection_snapshot():
    """Preserve the author's current Edit-Mode selection across runtime setup."""
    obj=bpy.data.objects.get(selected_point_overlay.ANCHOR)
    if obj is None or bpy.context.mode!='EDIT_MESH' or bpy.context.view_layer.objects.active!=obj:
        return None
    import bmesh
    bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table()
    active=bm.select_history.active
    return ([v.index for v in bm.verts if v.select],active.index if isinstance(active,bmesh.types.BMVert) else -1)

def _selection_restore(snapshot):
    if snapshot is None:return
    import bmesh
    obj=bpy.data.objects.get(selected_point_overlay.ANCHOR)
    if obj is None:return
    if obj.mode!='EDIT':
        bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.select_history.clear()
    selected,active=snapshot;selected=set(selected)
    for v in bm.verts:v.select_set(v.index in selected)
    if 0<=active<len(bm.verts) and bm.verts[active].select:bm.select_history.add(bm.verts[active])
    bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)

@persistent
def _activate_after_open(_unused):
    try:
        selection=_selection_snapshot()
        author_scoring_runtime.register(enter_edit_mode=True)
        _selection_restore(selection)
        selected_point_overlay.register()
        bpy.context.scene['selected_point_overlay_state']='READY'
    except Exception as exc:
        if bpy.context.scene:
            bpy.context.scene['selected_point_overlay_state']='HOLD'
            bpy.context.scene['selected_point_overlay_reason']=repr(exc)

if _activate_after_open not in bpy.app.handlers.load_post:
    bpy.app.handlers.load_post.append(_activate_after_open)
_initial_selection=_selection_snapshot()
author_scoring_runtime.register(enter_edit_mode=True)
_selection_restore(_initial_selection)
selected_point_overlay.register()
bpy.context.scene['selected_point_overlay_state']='READY'

# Task-local keymap and stronger depth cue; no preferences or geometry are saved.
import math
_depth = author_scoring_runtime.depth
_original_depth_range = _depth._range
_depth.FAR_FACTOR = 0.035
def _strong_depth_range(direction):
    lo, hi = _original_depth_range(direction)
    span = hi-lo
    return lo+span*.20, hi-span*.20
_depth._range = _strong_depth_range
_depth._refresh_view(bpy.context.scene, force=True)

class MINIA_OT_quick_point(bpy.types.Operator):
    bl_idname='mini_a.quick_point'; bl_label='途中に点を追加'
    @classmethod
    def poll(cls, context):
        return context.area is not None and context.area.type=='VIEW_3D' and context.mode=='EDIT_MESH' and context.active_object is not None and context.active_object.name==selected_point_overlay.ANCHOR
    def invoke(self, context, event):
        return bpy.ops.mini_a.add_midpoint('INVOKE_DEFAULT')
class MINIA_OT_quick_color(bpy.types.Operator):
    bl_idname='mini_a.quick_color'; bl_label='色を更新'
    @classmethod
    def poll(cls, context):
        return MINIA_OT_quick_point.poll(context)
    def execute(self, context):
        return bpy.ops.mini_a.update_midpoint_colors('EXEC_DEFAULT')
class MINIA_PT_shortcuts(bpy.types.Panel):
    bl_label='操作ショートカット'; bl_idname='MINIA_PT_shortcuts'
    bl_space_type='VIEW_3D'; bl_region_type='UI'; bl_category='MINI_A 色付き補強'
    def draw(self, context):
        self.layout.label(text='Ctrl + Shift + Alt + A : 途中点 → 線をクリック')
        self.layout.label(text='Ctrl + Shift + R : 色を更新')
        self.layout.label(text='奥行き表示 : 強め（OFFは従来ボタン）')
for _cls in (MINIA_OT_quick_point, MINIA_OT_quick_color, MINIA_PT_shortcuts):
    bpy.utils.register_class(_cls)
_task_keys=[]
_kc=bpy.context.window_manager.keyconfigs.addon
if _kc:
    _km=_kc.keymaps.new(name='Mesh',space_type='EMPTY')
    for _id,_key in [('mini_a.quick_point','A'),('mini_a.quick_color','R')]:
        _kmi=_km.keymap_items.new(_id,_key,'PRESS',ctrl=True,shift=True,alt=(_key=='A'))
        _task_keys.append((_km,_kmi))
bpy.context.scene['minia_shortcuts_registered']=len(_task_keys)
print('MINIA_SHORTCUTS_READY',len(_task_keys),'DEPTH_FAR',_depth.FAR_FACTOR,flush=True)

