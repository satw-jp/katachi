import sys,json,math,collections
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
W=Path(__file__).parent;O=W.parent/'outputs';sys.path.insert(0,str(O/'color_path_runtime/networkx-3.6.1.zip'))
import networkx as nx
d=json.loads((W/'lower70_input.json').read_text());plan=json.loads((W/'lower70_plan.json').read_text());g=nx.Graph();g.add_nodes_from(d['nodes'])
for r in plan['new_points']:g.add_node(r['id'],position=r['position'])
g.add_edges_from(json.loads((W/'lower70_expected_graph.json').read_text()));seeds=set(d['seeds'])&set(g);zlo,zmax=plan['report']['z_range_mm']
# Reuse the unchanged score formula.
src=(W/'lower70_plan.py').read_text(encoding='utf-8-sig');exec(src[src.index('def measure(graph):'):src.index('seedtree=KDTree')])
h=np.load(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_D6_SIZE_RHYTHM_V2\data\host.npz');v=h['vertices']*d['source_to_plate']['scale']+np.array(d['source_to_plate']['translation_mm']);host=BVHTree.FromPolygons(v.tolist(),h['faces'].tolist(),all_triangles=True)
def depth(p):
 q,n,f,dst=host.find_nearest(p);return dst if (p-q).dot(n)<0 else -dst
positions={**d['positions'],**{r['id']:r['position'] for r in plan['new_points']}};node=lambda sid:d['anchors'].get(sid,sid)
ids=[sid for sid,p in positions.items() if node(sid) in g and g.degree(node(sid))>=2 and zlo<=p[2]<=zmax and depth(Vector(p))>=4]
kd=KDTree(len(ids))
for i,sid in enumerate(ids):kd.insert(Vector(positions[sid]),i)
kd.balance();dd=nx.multi_source_dijkstra_path_length(g,seeds,weight='length_mm');aug=g.copy();aug.add_edges_from(('__ROOT__',s) for s in seeds);back=set()
for ee in nx.biconnected_component_edges(aug):
 if len(ee)>2 and any('__ROOT__' in e for e in ee):back.update(frozenset(e) for e in ee if '__ROOT__' not in e)
rednodes={n for a,b,e in g.edges(data=True) if frozenset((a,b)) not in back and min(dd.get(a,math.inf),dd.get(b,math.inf))+e['length_mm']/2>=25.65 for n in (a,b)}
forbidden={frozenset((node(r['a_id']),node(r['b_id']))) for r in d['roots']}
for r in plan['replacements']:forbidden.add(frozenset((node(r['path'][0]),node(r['path'][-1]))))
candidates=[]
for i,sid in enumerate(ids):
 a=node(sid)
 if a not in rednodes:continue
 for q,j,length in kd.find_range(Vector(positions[sid]),7):
  b=node(ids[j])
  if j==i or length<1 or g.has_edge(a,b) or frozenset((a,b)) in forbidden:continue
  if max(dd.get(a,math.inf),dd.get(b,math.inf))>39:continue
  if b in nx.single_source_dijkstra_path_length(g,a,cutoff=length*2.5,weight='length_mm'):continue
  candidates.append((length,i,j))
current=measure(g);accepted=0;seen=set();degrees=collections.Counter()
for length,i,j in sorted(candidates):
 a,b=node(ids[i]),node(ids[j]);pair=frozenset((a,b))
 if pair in seen or degrees[a]>=2 or degrees[b]>=2:continue
 seen.add(pair)
 pa,pb=Vector(positions[ids[i]]),Vector(positions[ids[j]]);steps=math.ceil(length/.2);bound=min(depth(pa.lerp(pb,t/steps)) for t in range(steps+1))-length/steps/2
 if bound<.145:continue
 g.add_edge(a,b,length_mm=length,kind='LOWER70_LOCAL');trial=measure(g)
 if trial['red_length_mm']>=current['red_length_mm']-.5:g.remove_edge(a,b);continue
 current=trial;degrees[a]+=1;degrees[b]+=1;accepted+=1
 plan['added'].append({'a_id':ids[i],'b_id':ids[j],'a':list(pa),'b':list(pb),'length_mm':length,'reason':'lower70_alternate_route','clearance_mm':bound})
 print('ACCEPT',accepted,'RED',round(current['red_length_mm'],2),flush=True)
 if accepted>=60:break
sys.path.insert(0,str(W));from straight_audit import audit
plan['report']['after']=current;plan['report']['straight_members']=audit(g,zlo,zmax);assert not plan['report']['straight_members']['over_limit_count']
plan['report']['added_short_edges']=len(plan['added']);plan['report']['reasons']=dict(collections.Counter(r['reason'] for r in plan['added']))
(W/'lower70_plan.json').write_text(json.dumps(plan,indent=2));(W/'lower70_expected_graph.json').write_text(json.dumps(list(g.edges(data=True))))
print('IMPROVE_PASS',accepted, len(candidates),len(seen),current,flush=True)
