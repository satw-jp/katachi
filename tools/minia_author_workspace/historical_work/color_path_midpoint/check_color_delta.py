import bpy,sys,json,math
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'color_path_midpoint'
sys.path.insert(0,str(out/'color_path_midpoint_runtime'))
import midpoint_runtime as rt
s=rt.scan_state(bpy.context.scene,True);g,display=rt._graph_state(s);after=rt.colorbase.score_graph(g,s['cache']['seeds']);baseg=rt.colorbase._graph(s['cache'],[]);before=rt.colorbase.score_graph(baseg,s['cache']['seeds'])
def binval(q):
 v=q.get('effective_distance_mm') if q else None
 return None if v is None else min(31,int(round(max(0.,v)/30*31)))
changed=[]
for seg in s['cache']['segments']:
 key=frozenset(seg['nodes'])
 if key in before and key in after and binval(before[key])!=binval(after[key]):changed.append({'branch_id':seg['branch_id'],'before_bin':binval(before[key]),'after_bin':binval(after[key])})
r={'status':'PASS' if changed else 'NO_BIN_CHANGE','baseline_segments_compared':35302,'changed_color_bins':len(changed),'sample':changed[:20]}
(work/'MIDPOINT_COLOR_DELTA_QA.json').write_text(json.dumps(r,indent=2),encoding='utf-8');print(json.dumps(r),flush=True)
