import json,pathlib,sys
sys.path.append(r'J:\My Drive\codex\2026-09-05\files-mentioned-by-the-user-samples\work\r2\vendor')
import networkx as nx
from route_analysis import analyze,impact
R=pathlib.Path(__file__).resolve().parents[2]
cache=json.loads((R/'outputs/SELECTED_GEOMETRY_HEIGHT_CACHE.json').read_text())
rows=[]
for h in [42.2,42.6,43.2,44.,45.,48.]:
 s=next(x for x in cache['snapshots'] if x['model_z_mm']==h)
 for mode in ['PRINTING_WITH_SUPPORT','PERMANENT_ONLY_AFTER_REMOVAL']:
  g=nx.Graph();g.add_node('MODEL_BASE')
  for n in s['nodes']:
   if mode=='PERMANENT_ONLY_AFTER_REMOVAL' and n['role']=='SUPPORT':continue
   id=n['physical_member_id'];bbox=n['bbox_plate_mm']
   g.add_node(n['id'],branch_id=None if id=='F3457' else id,flower_ids=['F3457'] if id=='F3457' else [],bbox=[bbox[:3],bbox[3:]])
   if id=='S002463' and abs(bbox[2])<1e-5:
    g.add_edge(n['id'],'MODEL_BASE',joint_id='MODEL_BASE:S002463',evidence='MODEL_BASE_PLANE_CONTACT',contact_kind='BEARING_CONTACT')
  for c in s['contacts']:
   if c['a'] in g and c['b'] in g:g.add_edge(c['a'],c['b'],**{k:v for k,v in c.items() if k not in ('a','b')})
  for target in [n for n in g if n.startswith('F3457#')]:
   r=analyze(g,target,['MODEL_BASE'],False)
   rows.append({'model_z_mm':h,'mode':mode,'result':r,'S002463_failure':impact(g,['MODEL_BASE'],'branch','S002463') if mode=='PRINTING_WITH_SUPPORT' else None})
result={'scope':'Measured 16-member subgraph only; omitted global Permanent paths make zero an absence of verified paths in this subgraph, not proof of no actual path. No crop boundary used as base.','raft_to_model_mapping':'UNVERIFIED','physical_strength':'UNVERIFIED','results':rows}
(R/'work/route_visualizer/geometry_route_checks.json').write_text(json.dumps(result,indent=2))
print(json.dumps([{'z':r['model_z_mm'],'mode':r['mode'],'target':r['result']['target'],'count_in_measured_subgraph':r['result']['graph_count'],'common_branches_in_subgraph':r['result']['common_branch_failures']} for r in rows],indent=2))
