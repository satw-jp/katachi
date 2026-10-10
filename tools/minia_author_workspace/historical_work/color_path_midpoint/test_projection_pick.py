import bpy,sys,json,math
from pathlib import Path
from types import SimpleNamespace
from bpy_extras import view3d_utils
from mathutils import Vector
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'color_path_midpoint'
sys.path.insert(0,str(out/'color_path_midpoint_runtime'))
import midpoint_runtime as rt
rt.register(enter_edit_mode=True);state=rt.scan_state(bpy.context.scene,True)
area=next((a for a in bpy.context.screen.areas if a.type=='VIEW_3D'),None)
if area is None:raise RuntimeError('factory startup has no VIEW_3D area')
region=next((r for r in area.regions if r.type=='WINDOW'),None);rv3d=area.spaces.active.region_3d
if region is None:raise RuntimeError('VIEW_3D has no WINDOW region')
allp=[p for seg in state['cache']['segments'] for p in (seg['a'],seg['b'])]
lo=[min(p[k] for p in allp) for k in range(3)];hi=[max(p[k] for p in allp) for k in range(3)]
rv3d.view_location=Vector(tuple((lo[k]+hi[k])*.5 for k in range(3)));rv3d.view_distance=max(hi[k]-lo[k] for k in range(3))*2.0
chosen=None
for i,seg in enumerate(state['cache']['segments']):
 mid=[(float(seg['a'][k])+float(seg['b'][k]))*.5 for k in range(3)]
 p2=view3d_utils.location_3d_to_region_2d(region,rv3d,mid)
 if p2 is not None and 12<float(p2.x)<region.width-12 and 12<float(p2.y)<region.height-12:
  chosen=(i,mid,float(p2.x),float(p2.y));break
if chosen is None:raise RuntimeError('no source segment projects inside the default viewport')
i,mid,x,y=chosen
event=SimpleNamespace(mouse_x=region.x+x,mouse_y=region.y+y)
ctx=SimpleNamespace(area=area)
candidate=rt._screen_pick(ctx,event,state)
assert candidate and candidate['kind']=='source_segment',(candidate,chosen)
result={'status':'PROJECTION_PICK_PASS','picked_kind':candidate['kind'],'picked_segment_index':candidate['segment_index'],'target_segment_index':i,'pixel_distance':candidate['pixel_distance'],'depth':candidate['depth'],'gui_used':False}
(work/'MIDPOINT_QA_PROJECTION_PICK.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result),flush=True)
