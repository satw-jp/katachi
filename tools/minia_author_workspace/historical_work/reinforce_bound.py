import json,sys,math,collections
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
W=Path(__file__).resolve().parent;O=W.parent/'outputs';sys.path.insert(0,str(O/'color_path_runtime/networkx-3.6.1.zip'))
import networkx as nx
d=json.loads((W/'reinforce_input.json').read_text(encoding='utf-8'));plan=json.loads((W/'reinforce_plan.json').read_text(encoding='utf-8'))
g=nx.Graph();g.add_nodes_from(d['nodes']);g.add_edges_from(d['edges']);base=list(g.edges(data=True));seeds=set(d['seeds'])&set(g)
for r in plan['added']:g.add_edge(d['anchors'].get(r['a_id'],r['a_id']),d['anchors'].get(r['b_id'],r['b_id']),length_mm=r['length_mm'])
tree=KDTree(len(seeds))
for i,s in enumerate(seeds):tree.insert(Vector(g.nodes[s]['position']),i)
tree.balance();dist=nx.multi_source_dijkstra_path_length(g,seeds,weight='length_mm');aug=g.copy();aug.add_edges_from(('__ROOT__',s) for s in seeds);back=set()
for ee in nx.biconnected_component_edges(aug):
 if len(ee)>2 and any('__ROOT__' in e for e in ee):back.update(frozenset(e) for e in ee if '__ROOT__' not in e)
count=collections.Counter();worst=[]
for a,b,e in base:
 length=e['length_mm']
 if length<.01:continue
 effective=(min(dist.get(a,math.inf),dist.get(b,math.inf))+length/2)*(.65 if frozenset((a,b)) in back else 1.)
 near=min(tree.find(Vector(g.nodes[n]['position']))[2] for n in (a,b));lower=(near+length/2)*.65
 if effective>=25.65:count['remaining_original_red_length']+=length
 if lower>=25.65:count['unavoidable_red_length_euclidean']+=length
 if effective>=30:count['remaining_original_saturated_length']+=length
 if lower>=30:count['unavoidable_saturated_length_euclidean']+=length
 if effective>=25.65 and frozenset((a,b)) not in back:count['red_without_merge_bonus']+=length
 worst.append((effective,lower,length,a,b))
report={'counts':dict(count),'worst':sorted(worst,reverse=True)[:15]}
(W/'reinforce_bound.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('BOUND',json.dumps(report),flush=True)
