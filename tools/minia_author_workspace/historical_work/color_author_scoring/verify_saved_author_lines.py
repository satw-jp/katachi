import bpy,sys,json,time
from pathlib import Path
ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');OUT=ROOT/'outputs';WORK=ROOT/'work'/'color_author_scoring'
sys.path.insert(0,str(OUT/'color_author_runtime'))
import author_scoring_runtime as ar
dr=ar.depth;mp=ar.midpoint;scene=bpy.context.scene;started=time.perf_counter()
state=mp.scan_state(scene,True)
assert len(state['mid_records'])==3 and len(state['roots'])==2 and len(state['edge_rows'])==3
refs=mp._verify_references(scene)
update=mp.update_colors(scene);assert update.get('status')=='CURRENT',update
report=json.loads(scene['author_line_color_report_json'])
assert report['author_root_count']==2 and report['author_display_segment_count']>3
assert len(report['colored_bins'])>=2,report
assert any(len(x['bins'])>=2 and x['length_mm']>2 for x in report['roots']),report
preview=bpy.data.collections[mp.PREVIEW]
objs=[o for o in preview.objects if o.type=='CURVE' and o.get('display_only')]
assert objs and all(0<=int(o.get('color_bin',-1))<32 for o in objs)
assert all(o.data.materials and o.data.materials[0].name.startswith('MINI_A depth color') for o in objs)
assert len(dr._MATERIALS)==33 and mp._verify_references(scene)==refs
after=mp.scan_state(scene,True);assert len(after['mid_records'])==3 and len(after['edge_rows'])==3
result={'status':'AUTHOR_LINE_GRADING_PASS','saved_midpoints_preserved':len(after['mid_records']),'author_edges_preserved':len(after['edge_rows']),'author_root_count':report['author_root_count'],'author_display_subsegments':report['author_display_segment_count'],'color_bins_used':report['colored_bins'],'long_root_bin_ranges':[{'length_mm':r['length_mm'],'bins':r['bins'],'distance_range':[r['min_effective_distance_mm'],r['max_effective_distance_mm']]} for r in report['roots']],'depth_materials':len(dr._MATERIALS),'source_refs_unchanged':True,'update_status':update['status'],'elapsed_s':time.perf_counter()-started}
(WORK/'AUTHOR_LINE_GRADING_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True)
