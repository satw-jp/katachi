import bpy,runpy,json
from pathlib import Path
out=Path.cwd()/'outputs'
a=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D');assert not a.spaces.active.region_quadviews
before=(tuple(a.spaces.active.region_3d.view_rotation),tuple(a.spaces.active.region_3d.view_location),a.spaces.active.region_3d.view_distance)
runpy.run_path(str(out/'MINIA_SINGLE_VIEW_BOOTSTRAP.py'))
import single_view_clip_adapter as vc
s=bpy.context.scene
assert not a.spaces.active.region_quadviews and s['minia_single_view']
assert before==(tuple(a.spaces.active.region_3d.view_rotation),tuple(a.spaces.active.region_3d.view_location),a.spaces.active.region_3d.view_distance)
assert s.minia_clip_shared and s.minia_clip_z_start==0 and s.minia_clip_z_end==20
st=vc.mp.scan_state(s,False);assert len(st['mid_records'])==127 and len(st['edge_rows'])==207
r=vc._region_for_q(a,a.spaces.active.region_3d)
with bpy.context.temp_override(area=a,region=r):assert bpy.ops.mini_a.toggle_single()=={'FINISHED'}
assert len(a.spaces.active.region_quadviews)==4
assert [q.lock_rotation for q in a.spaces.active.region_quadviews]==[True,True,True,False]
p=out/'MINIA_SINGLE_TILTED_CLIP_QA.json';v=json.loads(p.read_text());v['single_fresh_reopen_and_quad_restore']='PASS';p.write_text(json.dumps(v,indent=2));print('FRESH_REOPEN_PASS',flush=True)
