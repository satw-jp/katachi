import bpy,sys,json
from pathlib import Path
import bmesh
out=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs')
sys.path.insert(0,str(out/'color_path_runtime'))
import color_path_runtime as rt, route_v2_panel
scene=bpy.context.scene;obj=bpy.data.objects.get(rt.ANCHOR)
assert obj is not None and bpy.context.mode=='EDIT_MESH'
audit=route_v2_panel.extract_current_edits(scene)
assert not audit['issues'],audit['issues']
report=json.loads(scene.get('color_map_report_json','{}'))
assert scene.get('color_map_state')=='CURRENT',scene.get('color_map_state')
assert report.get('added_edge_count')==1,report
assert audit['edge_count']==1,audit
assert len([o for o in bpy.data.collections[rt.DISPLAY_COLLECTION].objects if o.type=='CURVE' and o.name.startswith('Support distance •')])>=1
assert bpy.data.objects.get('AUTHOR INTENT • cyan display only') is not None
refs=[o for o in bpy.data.objects if o.get('source_reference')]
assert len(refs)==7 and all(o.hide_viewport and o.hide_render and o.hide_select for o in refs)
bm=bmesh.from_edit_mesh(obj.data)
assert not any(v.select for v in bm.verts)
result={'status':'TEST_SAVE_FRESH_REOPEN_PASS','blend':bpy.data.filepath,'edit_count':audit['edge_count'],'edited_edge_ids':[e['id'] for e in audit['edits']],'state':scene.get('color_map_state'),'report_edge_count':report['added_edge_count'],'author_preview_present':True,'anchor_vertices_deselected':True,'protected_refs_hidden':len(refs),'manufacturing_geometry_changed':scene.get('manufacturing_geometry_changed')}
(out/'COLOR_PATH_EDITOR_FRESH_REOPEN_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False),flush=True)
