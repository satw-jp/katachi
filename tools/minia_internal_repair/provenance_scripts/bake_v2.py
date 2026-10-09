"""Run after opening the accepted V1 blend in background Blender."""
import bpy,sys,json,hashlib
from pathlib import Path
ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra')
WORK=ROOT/'work'/'luna_visualizer';DEV_RUNTIME=ROOT/'work'/'route_visualizer'
sys.path.insert(0,str(WORK));sys.path.insert(0,str(DEV_RUNTIME))
v1=Path(bpy.data.filepath);out=ROOT/'outputs'/'MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend'
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
expected='11be470c5194f17349eeb1ac4ba473af21275ffb2667f62dc7e8383396652c24'
if sha(v1)!=expected:raise RuntimeError('V1 SHA changed; refusing to clone a different baseline')
scene=bpy.context.scene;scene['route_output_root']=str(ROOT/'outputs');scene['route_v2_version']='MINIA_LAYERWISE_ROUTE_VISUALIZER_V2';scene['route_inputs_initialized']=True;scene['route_stale']=True;scene['route_state']='STALE';scene['route_stale_reason']='Initial evaluation pending';scene['route_interval_comparison_json']=''
import route_v2_panel as panel
panel.register(runtime_path=DEV_RUNTIME,initial_evaluate=False)
panel._failure_items(None,None)
scene.route_height=43.2;scene.route_mode='PRINTING_WITH_SUPPORT';scene.route_failure_kind='branch'
scene.route_failure_id=next(k for k,v in panel._FAILURE_ITEM_MAP.items() if v==('branch','A3457'))
scene['route_failure_real_id']='A3457';scene['route_failure_real_kind']='branch'
panel.reevaluate(scene,runtime_path=DEV_RUNTIME)
if scene.get('route_state')!='CURRENT':raise RuntimeError('V2 initial evaluation did not reach CURRENT: '+str(scene.get('route_guard_issues_json')))
panel._BUSY=True
bpy.ops.wm.save_as_mainfile(filepath=str(out))
print(json.dumps({'status':'V2_INITIAL_CURRENT','v1_sha256':expected,'v2_path':str(out),'v2_bytes':out.stat().st_size,'v2_sha256':sha(out),'panel_status':scene.get('route_state'),'summary':json.loads(scene['route_summary_json'])},indent=2),flush=True)
