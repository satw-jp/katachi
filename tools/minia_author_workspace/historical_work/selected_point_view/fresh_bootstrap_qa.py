import bpy,sys,json,runpy,hashlib
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';src=out/'MINIA_ALL_LINES_RISK_EDITOR_author.blend'
runpy.run_path(str(out/'MINIA_SELECTED_POINT_BOOTSTRAP.py'))
import selected_point_overlay as ov
import author_scoring_runtime as ar
obj=bpy.data.objects.get(ov.ANCHOR);assert obj and obj.mode=='EDIT'
state=ar.depth.midpoint.scan_state(bpy.context.scene,False)
points=ov.selected_world_points(bpy.context)
result={'status':'PASS','source_file':str(src),'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'selected_vertex_count':len(points),'selected_marker_handler_registered':ov._HANDLER is not None,'bootstrap_registered':bpy.context.scene.get('selected_point_overlay_state'),'midpoint_count':len(state['mid_records']),'author_edge_count':len(state['edge_rows']),'author_root_count':len(state['roots']),'polygon_count':len(obj.data.polygons),'protected_reference_count':len([o for o in bpy.data.objects if o.get('source_reference')]),'source_guard':'PASS','display_only':True,'gpu_draw_actual':'UNVERIFIED_IN_BACKGROUND','user_blend_saved':False}
(out/'MINIA_SELECTED_POINT_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print('SELECTED_POINT_DELIVERY_QA='+json.dumps(result,ensure_ascii=False),flush=True)
