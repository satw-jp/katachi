"""Four-pane MINI_A editor bootstrap with per-region pick/marker adapters."""
import bpy,sys,bmesh,math
from pathlib import Path
from bpy.app.handlers import persistent
OUT=Path(__file__).resolve().parent
for p in (OUT/'color_author_runtime',OUT/'selected_point_runtime',OUT/'quad_view_runtime'):
 if str(p) not in sys.path:sys.path.insert(0,str(p))
import author_scoring_runtime as author
import selected_point_overlay as marker
import quad_view_adapter as quad
quad.install();depth=author.depth
if not hasattr(depth,'_quad_display_base_range'):depth._quad_display_base_range=depth._range
_base=depth._quad_display_base_range;depth.FAR_FACTOR=.16
def _range(direction):
 lo,hi=_base(direction);span=hi-lo;return lo+span*.10,hi-span*.10
depth._range=_range

def _selection_snapshot():
 obj=bpy.data.objects.get(marker.ANCHOR)
 if obj is None or bpy.context.mode!='EDIT_MESH' or bpy.context.view_layer.objects.active!=obj:return None
 bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();active=bm.select_history.active
 return ([v.index for v in bm.verts if v.select],active.index if isinstance(active,bmesh.types.BMVert) else -1)
def _selection_restore(snap):
 if snap is None:return
 obj=bpy.data.objects.get(marker.ANCHOR)
 if obj is None:return
 if obj.mode!='EDIT':bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.select_history.clear();ids,active=snap;ids=set(ids)
 for v in bm.verts:v.select_set(v.index in ids)
 if 0<=active<len(bm.verts) and bm.verts[active].select:bm.select_history.add(bm.verts[active])
 bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
def _patch_depth_ui():
 def _draw_depth_off(self,c):
  self.layout.label(text='四画面では奥行き濃淡OFF')
  self.layout.label(text='誤った方向の濃淡を避けます')
  self.layout.label(text='危険色の色相は各面で維持')
 depth.MINI_A_PT_depth.draw=_draw_depth_off
def _activate():
 sel=_selection_snapshot();bpy.context.scene['quadview_depth_disabled']=True;bpy.context.scene['depth_cue_enabled']=False
 author.register(enter_edit_mode=True);_selection_restore(sel);_patch_depth_ui();quad.configure();marker.register();depth._refresh_view(bpy.context.scene,force=True)
 bpy.context.scene['quadview_state']='READY';bpy.context.scene['quadview_depth_disabled']=True;bpy.context.scene['depth_cue_enabled']=False
@persistent
def _load_post(_unused):
 try:_activate()
 except Exception as exc:bpy.context.scene['quadview_state']='HOLD';bpy.context.scene['quadview_error']=repr(exc)
if _load_post not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_load_post)
_initial=_selection_snapshot();bpy.context.scene['quadview_depth_disabled']=True;bpy.context.scene['depth_cue_enabled']=False
author.register(enter_edit_mode=True);_selection_restore(_initial);quad.configure();marker.register();depth._refresh_view(bpy.context.scene,force=True)
bpy.context.scene['quadview_state']='READY';bpy.context.scene['quadview_depth_disabled']=True;bpy.context.scene['depth_cue_enabled']=False;_patch_depth_ui()
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
class MINIA_PT_quad_note(bpy.types.Panel):
 bl_label='四画面';bl_idname='MINIA_PT_quad_note';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='MINI_A 色付き補強'
 def draw(self,c):
  l=self.layout;l.label(text='上 / 前 / 横 / アクソメ')
  l.label(text='四画面では危険色の色相を統一')
  l.label(text='奥行き濃淡OFF（誤表示を防止）')
  l.label(text='Ctrl+Shift+Alt+A: 点追加')
  l.label(text='Ctrl+Shift+R: 色更新')
for cls in (MINIA_OT_quick_point,MINIA_OT_quick_color,MINIA_PT_quad_note):
 if not hasattr(bpy.types,cls.__name__):bpy.utils.register_class(cls)
_kc=bpy.context.window_manager.keyconfigs.addon
if _kc:
 _km=_kc.keymaps.get('Mesh') or _kc.keymaps.new(name='Mesh',space_type='EMPTY')
 for op,key,alt in [('mini_a.quick_point','A',True),('mini_a.quick_color','R',False)]:
  if not any(i.idname==op and i.type==key and i.ctrl and i.shift and i.alt==alt for i in _km.keymap_items):_km.keymap_items.new(op,key,'PRESS',ctrl=True,shift=True,alt=alt)
bpy.context.scene['minia_shortcuts_registered']=2
print('MINIA_QUAD_READY',bpy.context.scene.get('quadview_info_json',''),flush=True)
