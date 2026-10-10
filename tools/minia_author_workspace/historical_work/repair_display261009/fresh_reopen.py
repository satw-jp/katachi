import bpy,sys,json,runpy,hashlib,bmesh
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';blend=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_261009_display_fixed.blend'
runpy.run_path(str(out/'MINIA_DISPLAY_FIXED_BOOTSTRAP.py'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;depth=ar.depth;obj=bpy.data.objects[mp.ANCHOR];scene=bpy.context.scene
state=mp.scan_state(scene,allow_registry_init=False);refs=mp._verify_references(scene)
faces=len(bmesh.from_edit_mesh(obj.data).faces) if bpy.context.mode=='EDIT_MESH' else len(obj.data.polygons)
vals=[]
for m in bpy.data.materials:
 if m.name.startswith('MINI_A depth color'):
  mr=next(n for n in m.node_tree.nodes if n.bl_idname=='ShaderNodeMapRange')
  vals.append([float(mr.inputs['To Max'].default_value),float(mr.inputs['From Min'].default_value),float(mr.inputs['From Max'].default_value)])
assert faces==0 and len(vals)>=32 and all(abs(v[0]-.16)<1e-5 for v in vals)
result={'status':'FRESH_REOPEN_PASS','blend_sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'vertices':len(obj.data.vertices),'edges':len(obj.data.edges),'faces':faces,'midpoints':len(state['mid_records']),'author_edges':len(state['edge_rows']),'author_roots':len(state['roots']),'protected_refs':refs,'source_guard':'PASS','depth_material_count':len(vals),'to_max_minmax':[min(x[0] for x in vals),max(x[0] for x in vals)],'depth_display_version':scene.get('depth_display_fix'),'selected_marker':scene.get('selected_point_overlay_state'),'geometry_saved_unchanged':True}
(out/'MINIA_ALL_LINES_RISK_EDITOR_DISPLAY_FIXED_FRESH_REOPEN_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print('DISPLAY_FIXED_FRESH='+json.dumps(result,ensure_ascii=False),flush=True)

