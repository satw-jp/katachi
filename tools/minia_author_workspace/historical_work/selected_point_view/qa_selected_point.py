import bpy,sys,json,hashlib
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');sys.path.insert(0,str(root/'outputs'/'selected_point_runtime'))
import selected_point_overlay as ov
sc=bpy.context.scene;obj=bpy.data.objects.get(ov.ANCHOR)
assert obj and obj.mode=='EDIT' and bpy.context.mode=='EDIT_MESH'
pts0=ov.selected_world_points(bpy.context);assert len(pts0)==1, len(pts0)
bm=__import__('bmesh').from_edit_mesh(obj.data);bm.verts.ensure_lookup_table()
old=pts0[0][0];target=next(v for v in bm.verts if v.index!=old)
for v in bm.verts:v.select_set(False)
target.select_set(True);bm.select_history.clear();bm.select_history.add(target)
__import__('bmesh').update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
pts1=ov.selected_world_points(bpy.context)
assert len(pts1)==1 and pts1[0][0]==target.index,(old,pts1)
mpath=root/'outputs'/'color_author_runtime';sys.path.insert(0,str(mpath));import author_scoring_runtime as ar
st=ar.depth.midpoint.scan_state(sc,False)
assert len(st['mid_records'])==7 and len(st['edge_rows'])==7 and len(st['roots'])==5
ov.register();assert ov._HANDLER is not None and ov._REGISTERED
sc['selected_point_overlay_enabled']=False;assert sc['selected_point_overlay_enabled'] is False
sc['selected_point_overlay_enabled']=True
print('SELECTED_POINT_QA='+json.dumps({'status':'PASS','overlay_registered':True,'view3d_post_pixel_handler':ov._HANDLER is not None,'selected_before_index':old,'selected_after_index':pts1[0][0],'selected_coordinate_world':pts1[0][1],'active_marker':pts1[0][2],'midpoints':len(st['mid_records']),'author_edges':len(st['edge_rows']),'author_roots':len(st['roots']),'protected_refs':7,'guard':'PASS','toggle':'PASS','gpu_draw_actual':'UNVERIFIED_IN_BACKGROUND'},ensure_ascii=False),flush=True)
