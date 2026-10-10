import sys,math,types
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE.parent/'color_path_runtime/networkx-3.6.1.zip'))
import networkx as nx
import optimizer as opt
import flower_support as fs
from straight_audit import audit

def support_case(points,edges):
    g=nx.Graph()
    for n,p in points.items():g.add_node(n,position=p)
    for a,b in edges:g.add_edge(a,b,length_mm=math.dist(points[a],points[b]))
    c={'mp':types.SimpleNamespace(nx=nx),'contacts':{'F:0':'F'},'state':{'cache':{'anchors':{},'segments':[]}},'graph':g,'depth':lambda p:p[0],'flowers':{'F':{'normal':[-1,0,0]}}}
    fs.prepare(c);return fs.count(c,g,'F')[0]
points={'F:0':[0,0,0],'I:1':[3,-1,0],'I:2':[3,1,0],'B1:0':[6,-2,0],'B2:0':[6,2,0]}
assert support_case(points,[('F:0','I:1'),('I:1','B1:0'),('F:0','I:2'),('I:2','B2:0')])==2
assert support_case(points,[('F:0','I:1'),('I:1','B1:0'),('I:1','I:2'),('I:2','B2:0')])==1
same={**points,'B1:1':points['B2:0']};same.pop('B2:0')
assert support_case(same,[('F:0','I:1'),('I:1','B1:0'),('F:0','I:2'),('I:2','B1:1')])==1
surface={k:[p[0]*.3,p[1],p[2]] for k,p in points.items()}
assert support_case(surface,[('F:0','I:1'),('I:1','B1:0'),('F:0','I:2'),('I:2','B2:0')])==0
g=nx.path_graph([str(i) for i in range(13)])
for n in g:g.nodes[n]['position']=[int(n)*5,0,0]
g.add_node('branch',position=[30,5,0]);g.add_edge('6','branch')
assert audit(g,-math.inf,math.inf)['over_limit_count']>0
g.remove_edge('6','7');g.add_node('bend',position=[32,3,0]);g.add_edges_from([('6','bend'),('bend','7')])
assert audit(g,-math.inf,math.inf)['over_limit_count']==0
cfg=opt.read_json(HERE/'settings.json')
c={'cfg':cfg,'state':{'id_to_pos':{'flower':[9,0,0],'deep':[4,0,0],'tangent':[9,5,0]}},'depth':lambda p:10-max(abs(x) for x in p),'contacts':{'flower':'F'},'flowers':{'F':{'normal':[1,0,0]}}}
assert opt.geometry(c,'flower','deep') is not None
assert opt.geometry(c,'flower','tangent') is None
c['contacts']={};c['state']['id_to_pos']={'a':[-3,0,0],'b':[3,0,0]};c['depth']=lambda p:-1 if abs(p[0])<1 else 5
assert opt.geometry(c,'a','b') is None
print('RULE_TESTS_PASS: independent paths, shared bottleneck, same branch, surface-only, collinear subdivisions, real bend, inward flower link, whole-line protrusion',flush=True)
