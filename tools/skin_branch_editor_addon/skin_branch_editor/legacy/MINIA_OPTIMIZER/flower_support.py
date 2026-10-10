"""Count up to three locally independent inward support routes per flower."""
import heapq,math,collections
from mathutils import Vector

def prepare(c):
    groups=collections.defaultdict(set)
    for sid,fid in c['contacts'].items():groups[fid].add(c['state']['cache']['anchors'].get(sid,sid))
    c['flower_nodes']=groups;c['node_flowers']=collections.defaultdict(set)
    for fid,ns in groups.items():
        for n in ns:c['node_flowers'][n].add(fid)
    c['depth_cache']={n:c['depth'](r['position']) for n,r in c['graph'].nodes(data=True)}
    c['support_counts']={};c['support_regions']={};c['support_index']=collections.defaultdict(set)

def count(c,g,fid):
    starts=set(c['flower_nodes'].get(fid,()))&set(g)
    if not starts:return 0,set()
    normal=-Vector(c['flowers'][fid]['normal']).normalized()
    origin=sum((Vector(g.nodes[n]['position']) for n in starts),Vector())/len(starts)
    distance={n:0. for n in starts};queue=[(0.,n) for n in sorted(starts)];heapq.heapify(queue);terminals=set();edges=set()
    while queue:
        value,n=heapq.heappop(queue)
        if value!=distance[n]:continue
        delta=Vector(g.nodes[n]['position'])-origin
        if n not in starts and c['depth_cache'][n]>=5 and delta.length>=4 and delta.normalized().dot(normal)>=.7:
            terminals.add(n);continue
        for v,e in g[n].items():
            if c['node_flowers'].get(v,set())-{fid}:continue
            nd=value+e['length_mm']
            if nd>20:continue
            edges.add(frozenset((n,v)))
            if nd<distance.get(v,math.inf):distance[v]=nd;heapq.heappush(queue,(nd,v))
    region=set(distance)
    if not terminals:return 0,region
    nx=c['mp'].nx;flow=nx.DiGraph();source=('FLOWER',fid);sink=('DEEP',fid)
    for n in region:flow.add_edge(('in',n),('out',n),capacity=3 if n in starts else 1)
    for n in starts:flow.add_edge(source,('in',n),capacity=3)
    for edge in edges:
        a,b=tuple(edge)
        if a not in terminals:flow.add_edge(('out',a),('in',b),capacity=3)
        if b not in terminals:flow.add_edge(('out',b),('in',a),capacity=3)
    for n in terminals:
        if n.startswith('SMID:'):group=c['state']['cache']['segments'][int(n.split(':')[1])]['branch_id']
        elif n.startswith('AMID:'):group=n.split(':')[1]
        else:group=n.split(':')[0]
        gate=('branch',group);flow.add_edge(('out',n),gate,capacity=1);flow.add_edge(gate,sink,capacity=1)
    result=nx.algorithms.flow.edmonds_karp(flow,source,sink,cutoff=3)
    return min(3,int(result.graph['flow_value'])),region

def commit(c,updates):
    for fid,(number,region) in updates.items():
        for n in c['support_regions'].get(fid,set()):c['support_index'][n].discard(fid)
        c['support_counts'][fid]=number;c['support_regions'][fid]=region
        for n in region:c['support_index'][n].add(fid)

def refresh(c,g):
    for fid in sorted(c['flowers']):commit(c,{fid:count(c,g,fid)})

def trial(c,g,a,b):
    affected=c['support_index'].get(a,set())|c['support_index'].get(b,set())|c['node_flowers'].get(a,set())|c['node_flowers'].get(b,set())
    return {fid:count(c,g,fid) for fid in sorted(affected)}

def summary(c,updates=None):
    counts=dict(c['support_counts'])
    if updates:counts.update({fid:r[0] for fid,r in updates.items()})
    hist=collections.Counter(counts.values())
    return {'flower_support_0':hist[0],'flower_support_1':hist[1],'flower_support_2':hist[2],'flower_support_3_or_more':hist[3],
            'flower_deficit_to_2':sum(max(0,2-n) for n in counts.values()),'flower_deficit_to_3':sum(max(0,3-n) for n in counts.values())}
