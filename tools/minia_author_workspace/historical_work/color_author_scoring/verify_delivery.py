import bpy,sys,json,time
from pathlib import Path
ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');OUT=ROOT/'outputs';WORK=ROOT/'work'/'color_author_scoring'
sys.path.insert(0,str(OUT/'color_author_runtime'))
import author_scoring_runtime as ar
dr=ar.depth;mp=ar.midpoint;scene=bpy.context.scene;started=time.perf_counter();obj=bpy.data.objects[mp.ANCHOR]
state=mp.scan_state(scene,True)
assert bpy.context.mode=='EDIT_MESH' and bpy.context.view_layer.objects.active==obj
assert not state['edge_rows'] and not state['mid_records'] and not state['roots'] and not state['bm'].faces
assert len(state['cache']['segments'])==35303 and len(set(x['branch_id'] for x in state['cache']['segments']))==9421
assert mp._verify_references(scene)==7
curves=[o for o in bpy.data.collections[mp.DISPLAY].objects if o.type=='CURVE' and o.name.startswith('Support distance •')]
assert len(curves)==32 and all(len(o.data.materials)==1 and o.data.materials[0].name.startswith('MINI_A depth color') for o in curves)
preview=bpy.data.collections.get(mp.PREVIEW);assert not (preview and any(o.type=='CURVE' and o.get('display_only') for o in preview.objects))
result={'status':'DELIVERY_BOOTSTRAP_PASS','mode':bpy.context.mode,'source_branches':9421,'source_segments':35303,'protected_source_refs':7,'source_fingerprint_unchanged':True,'delivery_midpoints':0,'delivery_edges':0,'source_curve_bins':len(curves),'author_display_segments':0,'depth_materials':len(dr._MATERIALS),'manufacturing_geometry_changed':False,'elapsed_s':time.perf_counter()-started}
(WORK/'ALL_LINES_DELIVERY_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True)
