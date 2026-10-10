import sys,json,gzip,math,hashlib,importlib.util
from pathlib import Path
r=Path.cwd();o=r/'outputs'
spec=importlib.util.spec_from_file_location('scoring',r/'work/support_distance_colors.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with gzip.open(o/'COLOR_PATH_GRAPH.json.gz','rt',encoding='utf8') as f:c=json.load(f)
g=m.nx.Graph();g.add_nodes_from(c['nodes'])
for a,b,d in c['edges']:g.add_edge(a,b,**d)
original=json.loads((o/'SUPPORT_DISTANCE_COLORS.json').read_text(encoding='utf8'))
result,dist=m.score_graph(g,c['seeds'])
assert len(c['segments'])==len(original['segments'])
for s,expected in zip(c['segments'],original['segments']):
 got=result[frozenset(s['nodes'])]
 assert s['branch_id']==expected['branch_id']
 assert abs(got['effective_distance_mm']-expected['effective_distance_mm'])<1e-8
far=max(c['anchors'],key=lambda a:dist.get(c['anchors'][a],-1));a=c['anchors'][far]
seed=min(c['seeds'],key=lambda b:math.dist(g.nodes[a]['position'],g.nodes[b]['position']))
# Test a possible author connection to another existing anchor, not a support hub.
near=min(c['anchors'],key=lambda k:dist[c['anchors'][k]]+math.dist(g.nodes[a]['position'],g.nodes[c['anchors'][k]]['position']))
b=c['anchors'][near];length=math.dist(g.nodes[a]['position'],g.nodes[b]['position'])
g.add_edge(a,b,length_mm=length);after,dd=m.score_graph(g,c['seeds'])
changed=sum(abs(after[frozenset(s['nodes'])]['effective_distance_mm']-result[frozenset(s['nodes'])]['effective_distance_mm'])>1e-8 for s in c['segments'])
assert changed>0 and dd[a]<dist[a]
report={'status':'PASS','baseline_segment_matches':len(c['segments']),'shortcut_test_only':[far,near],'before_distance_mm':dist[a],'after_distance_mm':dd[a],'changed_segments':changed,'cache_sha256':hashlib.sha256((o/'COLOR_PATH_GRAPH.json.gz').read_bytes()).hexdigest()}
(o/'COLOR_PATH_CACHE_QA.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
