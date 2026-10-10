import bpy,runpy,json,sys
from pathlib import Path
out=Path.cwd()/'outputs'
assert all(a.spaces.active.shading.background_type=='VIEWPORT' for sc in bpy.data.screens for a in sc.areas if a.type=='VIEW_3D')
runpy.run_path(str(out/'MINIA_VIEW_CLIP_FIXED_BOOTSTRAP.py'))
import safe_view_clip_adapter as vc
mp=vc.mp;state=mp.scan_state(bpy.context.scene,False)
assert len(state['mid_records'])==106 and len(state['edge_rows'])==169
for screen in bpy.data.screens:
 for a in screen.areas:
  if a.type=='VIEW_3D':
   sh=a.spaces.active.shading
   assert sh.background_type=='VIEWPORT' and all(abs(x-y)<1e-6 for x,y in zip(sh.background_color,(.012,.016,.025)))
   assert all(not q.use_clip_planes for q in a.spaces.active.region_quadviews)
print('FRESH_REOPEN_PASS dark background, geometry guard, all clips off',flush=True)
p=out/'MINIA_CLIP_CRASH_FIX_QA.json';r=json.loads(p.read_text());r['fresh_reopen']='PASS';r['dark_background']=[.012,.016,.025];p.write_text(json.dumps(r,indent=2))

