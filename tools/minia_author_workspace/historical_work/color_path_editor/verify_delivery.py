import bpy,sys,json,hashlib
from pathlib import Path
out=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs')
sys.path.insert(0,str(out/'color_path_runtime'))
import color_path_runtime as rt, route_v2_panel
scene=bpy.context.scene;obj=bpy.data.objects[rt.ANCHOR]
audit=route_v2_panel.extract_current_edits(scene)
assert not audit['issues'],audit['issues']
assert audit['edge_count']==0,audit
assert scene.get('color_map_state')=='CURRENT',scene.get('color_map_state')
coll=bpy.data.collections[rt.DISPLAY_COLLECTION]
curves=[o for o in coll.objects if o.type=='CURVE' and o.name.startswith('Support distance •')]
assert len(curves)==32,len(curves)
assert sum(int(o.get('segment_count',0)) for o in curves)==35303
refs=[o for o in bpy.data.objects if o.get('source_reference')]
assert len(refs)==7 and all(o.hide_viewport and o.hide_render and o.hide_select for o in refs)
assert all(o.hide_select for o in bpy.data.objects if o!=obj)
assert not bpy.data.objects.get('AUTHOR INTENT • cyan display only')
assert scene.get('manufacturing_geometry_changed') is False
assert scene.get('new_slice')==0 and scene.get('send')==0 and scene.get('print')==0
cache,score,cache_sha,score_sha=rt._read_data(scene)
assert len({s['branch_id'] for s in cache['segments']})==9421
assert cache_sha==scene.get('color_cache_sha256') and score_sha==scene.get('color_score_source_sha256')
result={'status':'DELIVERY_FRESH_REOPEN_PASS','blend':bpy.data.filepath,'mode':bpy.context.mode,'active_object':bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None,'edit_count':audit['edge_count'],'branches':9421,'display_subsegments':35303,'color_bins':len(curves),'only_anchor_selectable':True,'source_refs_hidden':len(refs),'cache_sha256':cache_sha,'score_sha256':score_sha,'new_slice':0,'send':0,'print':0,'manufacturing_geometry_changed':False}
(out/'COLOR_PATH_EDITOR_DELIVERY_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False),flush=True)
