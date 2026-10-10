import bpy,sys,json,time
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'color_depth_view'
sys.path.insert(0,str(out/'color_depth_runtime'))
import depth_runtime as dr
started=time.perf_counter();scene=bpy.context.scene;obj=bpy.data.objects[dr.midpoint.ANCHOR]
assert bpy.context.mode=='EDIT_MESH' and bpy.context.view_layer.objects.active==obj
state=dr.midpoint.scan_state(scene,True)
assert not state['edge_rows'] and not state['mid_records'] and not state['roots'] and not state['bm'].faces
assert len(set(r['branch_id'] for r in state['cache']['segments']))==9421 and len(state['cache']['segments'])==35303
curves=[o for o in bpy.data.collections[dr.DISPLAY].objects if o.type=='CURVE' and o.name.startswith('Support distance •')]
assert curves and all(len(o.data.materials)==1 and o.data.materials[0].name.startswith('MINI_A depth color') for o in curves)
refs=dr.midpoint._verify_references(scene)
assert len(dr._MATERIALS)==34 and dr._MATERIALS[-2].name.endswith('cyan')
result={'status':'DELIVERY_FRESH_OPEN_PASS','mode':bpy.context.mode,'source_branches':9421,'source_segments':35303,'source_refs':refs,'display_curves':len(curves),'depth_materials':len(dr._MATERIALS),'cyan_material':dr._MATERIALS[-2].name,'anchor_edges':len(obj.data.edges),'midpoints':0,'source_fingerprint_unchanged':True,'viewport_type':next(a.spaces.active.shading.type for a in bpy.context.screen.areas if a.type=='VIEW_3D'),'use_scene_world':next(a.spaces.active.shading.use_scene_world for a in bpy.context.screen.areas if a.type=='VIEW_3D'),'elapsed_s':time.perf_counter()-started}
(work/'DEPTH_DELIVERY_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True)
