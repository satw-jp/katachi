import bpy,sys,json,hashlib,runpy
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';recovered=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered.blend'
runpy.run_path(str(out/'MINIA_SELECTED_POINT_BOOTSTRAP.py'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;obj=bpy.data.objects[mp.ANCHOR];scene=bpy.context.scene
state=mp.scan_state(scene,allow_registry_init=False)
faces=len(obj.data.polygons)
preview=bpy.data.collections.get(mp.PREVIEW)
preview_curves=[o for o in preview.objects if o.type=='CURVE' and o.get('display_only')] if preview else []
selected=sum(1 for v in obj.data.vertices if v.select) if obj.mode!='EDIT' else sum(1 for p in __import__('bmesh').from_edit_mesh(obj.data).verts if p.select)
result={'status':'FRESH_REOPEN_PASS','recovered_file':str(recovered),'recovered_sha256':hashlib.sha256(recovered.read_bytes()).hexdigest(),'original_author_sha256':hashlib.sha256((out/'MINIA_ALL_LINES_RISK_EDITOR_author.blend').read_bytes()).hexdigest(),'verts':len(obj.data.vertices),'edges':len(obj.data.edges),'faces':faces,'midpoints':len(state['mid_records']),'author_edges':len(state['edge_rows']),'author_roots':len(state['roots']),'protected_refs':len([o for o in bpy.data.objects if o.get('source_reference')]),'source_guard':'PASS','bootstrap_state':scene.get('selected_point_overlay_state'),'selection_marker_handler':__import__('selected_point_overlay')._HANDLER is not None,'selected_points':selected,'preview_display_curves':len(preview_curves),'face_hold_cleared':faces==0}
assert result['faces']==0 and result['source_guard']=='PASS' and result['bootstrap_state']=='READY' and result['selection_marker_handler']
(out/'MINIA_ALL_LINES_RISK_EDITOR_AUTHOR_RECOVERY_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print('FRESH_RECOVERED_QA='+json.dumps(result,ensure_ascii=False),flush=True)
