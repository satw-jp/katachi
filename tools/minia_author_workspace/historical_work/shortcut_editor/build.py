from pathlib import Path
out=Path.cwd()/'outputs'
base=(out/'MINIA_SELECTED_POINT_BOOTSTRAP.py').read_text(encoding='utf-8')
addon=r'''
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
        self.layout.label(text='Ctrl + Shift + A : 途中点 → 線をクリック')
        self.layout.label(text='Ctrl + Shift + R : 色を更新')
        self.layout.label(text='奥行き表示 : 強め（OFFは従来ボタン）')
for _cls in (MINIA_OT_quick_point, MINIA_OT_quick_color, MINIA_PT_shortcuts):
    bpy.utils.register_class(_cls)
_task_keys=[]
_kc=bpy.context.window_manager.keyconfigs.addon
if _kc:
    _km=_kc.keymaps.new(name='Mesh',space_type='EMPTY')
    for _id,_key in [('mini_a.quick_point','A'),('mini_a.quick_color','R')]:
        _kmi=_km.keymap_items.new(_id,_key,'PRESS',ctrl=True,shift=True)
        _task_keys.append((_km,_kmi))
bpy.context.scene['minia_shortcuts_registered']=len(_task_keys)
print('MINIA_SHORTCUTS_READY',len(_task_keys),'DEPTH_FAR',_depth.FAR_FACTOR,flush=True)
'''
(out/'MINIA_QUICK_EDIT_BOOTSTRAP.py').write_text(base+addon,encoding='utf-8')
