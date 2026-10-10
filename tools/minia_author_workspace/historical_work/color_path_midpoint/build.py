import bpy, sys, json, time
from pathlib import Path

ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra')
OUT=ROOT/'outputs'; WORK=ROOT/'work'/'color_path_midpoint'
sys.path.insert(0,str(OUT/'color_path_midpoint_runtime'))
import midpoint_runtime as rt

started=time.perf_counter(); scene=bpy.context.scene
obj=rt.ensure_midpoint_attributes()
scene['midpoint_author_root_registry']='[]'
scene['midpoint_editor_state']='STALE'
scene['midpoint_editor_reason']='中点対応版: 初回「色を更新」で保護・色表示を確認してください。'
scene['midpoint_cache_sha256']=rt._sha(OUT/'COLOR_PATH_GRAPH.json.gz')
scene['midpoint_score_sha256']=rt._sha(OUT/'SUPPORT_DISTANCE_COLORS.json')
scene['midpoint_author_root_registry']='[]'
scene['midpoint_manufacturing_geometry_changed']=False
scene['midpoint_new_slice']=0;scene['midpoint_send']=0;scene['midpoint_print']=0
scene['midpoint_anchor_signature']=rt._signature()
report=rt.update_colors(scene)
assert report.get('status')=='CURRENT',report
assert report['source_midpoint_count']==0 and report['author_midpoint_count']==0
assert report['author_edge_count']==0
assert len(obj.data.polygons)==0
scene['midpoint_build_qa_json']=json.dumps({'status':'BUILD_PASS','baseline_zero_midpoints':True,'baseline_zero_author_edges':True,'source_branches':report['source_branches'],'source_segments':report['source_segments'],'display_segments':report['display_segments'],'reference_count':report['source_reference_count'],'cache_sha256':report['cache_sha256'],'score_sha256':report['score_sha256'],'manufacturing_geometry_changed':False,'elapsed_s':time.perf_counter()-started},separators=(',',':'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'MINIA_COLOR_PATH_MIDPOINT_EDITOR.blend'))
print(scene['midpoint_build_qa_json'],flush=True)
