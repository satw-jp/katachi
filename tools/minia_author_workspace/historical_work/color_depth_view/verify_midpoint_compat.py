import bpy,sys,json,time
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'color_depth_view'
sys.path.insert(0,str(out/'color_depth_runtime'))
import depth_runtime as dr
started=time.perf_counter();scene=bpy.context.scene
state=dr.midpoint.scan_state(scene,True)
assert len(state['mid_records'])==3 and len(state['roots'])==2 and len(state['edge_rows'])==3 and not state['bm'].faces
before=len(state['edge_rows']);refs=dr.midpoint._verify_references(scene)
update=dr.midpoint.update_colors(scene)
assert update.get('status')=='CURRENT',update
assert dr.midpoint.update_colors is dr._update_colors
curves=[o for o in bpy.data.collections[dr.DISPLAY].objects if o.type=='CURVE' and o.name.startswith('Support distance •')]
assert curves and all(len(o.data.materials)==1 and o.data.materials[0].name.startswith('MINI_A depth color') for o in curves)
after_state=dr.midpoint.scan_state(scene,True);assert len(after_state['edge_rows'])==before and len(after_state['mid_records'])==3
assert dr.midpoint._verify_references(scene)==refs
cyan_preview=bpy.data.collections.get(dr.midpoint.PREVIEW)
if cyan_preview:
 assert all(o.type!='CURVE' or not o.get('display_only') or (o.data.materials and o.data.materials[0].name.endswith('cyan')) for o in cyan_preview.objects)
v0=dr.Vector((0,0,-1));v1=dr.Vector((1,0,0));dr._refresh_view(scene,True,direction=v0)
mat=dr._MATERIALS[15];dot=next(n for n in mat.node_tree.nodes if n.bl_idname=='ShaderNodeVectorMath')
assert tuple(round(float(x),4) for x in dot.inputs[1].default_value)==(0,0,-1)
dr._refresh_view(scene,True,direction=v1)
assert tuple(round(float(x),4) for x in dot.inputs[1].default_value)==(1,0,0)
result={'status':'MIDPOINT_SAVE_COMPAT_PASS','saved_midpoints_preserved':3,'saved_author_roots_preserved':2,'saved_author_edges_preserved':3,'depth_materials_after_recolor':len(dr._MATERIALS),'cyan_material_applied':True,'color_update_status':update['status'],'display_segments_after_recolor':update['display_segments'],'source_refs_unchanged':True,'view_forward_updates':'PASS','elapsed_s':time.perf_counter()-started}
(work/'DEPTH_MIDPOINT_COMPAT_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True)
