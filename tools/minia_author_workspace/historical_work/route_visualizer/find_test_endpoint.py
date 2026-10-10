import pathlib,json,math
from real_graph import Context
from route_analysis import failed_graph,reachable
c=Context(pathlib.Path(__file__).resolve().parents[2]/'outputs')
g,_=c.build(45.,'PERMANENT_ONLY_AFTER_REMOVAL')
cut=failed_graph(g,'branch','R0001');live=reachable(cut,['MODEL_BASE'])
mids={g.nodes[n].get('member_id') for n in live}
a=c.members['R5_F3457_P1']['points'][-1];rows=[]
for mid in mids:
 if mid not in c.members:continue
 r=c.members[mid]
 for param in [0,len(r['points'])-1]:
  p=r['points'][param]
  if p[2]>45:continue
  rows.append({'id':mid,'parameter':param,'point':p,'length':math.dist(a,p)})
print(json.dumps(sorted(rows,key=lambda x:x['length'])[:5],indent=2))
