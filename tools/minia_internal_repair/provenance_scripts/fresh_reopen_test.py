import bpy,sys,json,time
from pathlib import Path
out=Path(__file__).resolve().parents[1].parent/'outputs'
sys.path.insert(0,str(out));sys.path.insert(0,str(out/'route_runtime'))
import MINIA_ROUTE_BOOTSTRAP
boot=MINIA_ROUTE_BOOTSTRAP.register_for_current_file()
scene=bpy.context.scene
summary=json.loads(scene['route_summary_json']);result={'status':scene.get('route_state'),'register':boot,'fresh_open_edge_count':summary.get('edit_count'),'edit_sha256':summary.get('edit_sha256'),'author_output_path':str(out/'MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend')}
assert result['status']=='CURRENT' and result['fresh_open_edge_count']==2
(out/'MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_FRESH_REOPEN.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(result,indent=2,ensure_ascii=False),flush=True)
