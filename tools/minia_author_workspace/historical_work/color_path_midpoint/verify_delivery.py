import bpy,sys,json,hashlib
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'color_path_midpoint'
sys.path.insert(0,str(out/'color_path_midpoint_runtime'))
import midpoint_runtime as rt
obj=bpy.data.objects[rt.ANCHOR]
assert bpy.context.mode=='EDIT_MESH' and bpy.context.view_layer.objects.active==obj
state=rt.scan_state(bpy.context.scene,True)
assert not state['edge_rows'] and not state['mid_records'] and not state['roots'] and not state['bm'].faces
assert len(set(r['branch_id'] for r in state['cache']['segments']))==9421
assert len(state['cache']['segments'])==35303
assert len([o for o in bpy.data.objects if o.get('source_reference')])==7
assert all(o.hide_viewport and o.hide_render for o in bpy.data.objects if o.get('source_reference'))
cache_sha,score_sha=rt._read_data(bpy.context.scene)[2:]
result={'status':'DELIVERY_BOOTSTRAP_PASS','blend':str(out/'MINIA_COLOR_PATH_MIDPOINT_EDITOR.blend'),'mode':bpy.context.mode,'anchor_vertices':len(obj.data.vertices),'anchor_edges':len(obj.data.edges),'midpoints':len(state['mid_records']),'author_roots':len(state['roots']),'source_branches':9421,'source_segments':35303,'refs':7,'source_refs_hidden':True,'cache_sha256':cache_sha,'score_sha256':score_sha,'manufacturing_geometry_changed':False}
(work/'MIDPOINT_QA_DELIVERY.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False),flush=True)
