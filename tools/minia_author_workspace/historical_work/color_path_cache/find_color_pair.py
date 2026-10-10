exec(open('work/color_path_cache/verify_cache.py',encoding='utf-8-sig').read().split('far=max')[0])
endpoints=list(c['anchors'].items());positions={k:g.nodes[n]['position'] for k,n in endpoints}
from random import Random
rng=Random(42)
candidates=[(k,n) for k,n in endpoints if 16<dist[n]<45];rng.shuffle(candidates)
for k,a in candidates[:50]:
 near=min(endpoints,key=lambda kn:dist[kn[1]]+math.dist(positions[k],positions[kn[0]]))
 b=c['anchors'][near[0]];newdist=dist[b]+math.dist(positions[k],positions[near[0]])
 if dist[a]-newdist<8 or newdist>20:continue
 gg=g.copy();gg.add_edge(a,b,length_mm=math.dist(positions[k],positions[near[0]]));rr,dd=m.score_graph(gg,c['seeds'])
 bins=lambda v:min(31,round(v/30*31))
 changed=sum(bins(rr[frozenset(s['nodes'])]['effective_distance_mm'])!=bins(result[frozenset(s['nodes'])]['effective_distance_mm']) for s in c['segments'])
 if changed:
  print(json.dumps({'pair':[k,near[0]],'before':dist[a],'after':dd[a],'changed_color_bins':changed}));break
