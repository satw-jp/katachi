import json,sys,math,heapq,collections,time
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
W=Path(__file__).resolve().parent;O=W.parent/'outputs';sys.path.insert(0,str(O/'color_path_runtime/networkx-3.6.1.zip'))
import networkx as nx
d=json.loads((W/'lower50_input.json').read_text(encoding='utf-8'))
hp=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_D6_SIZE_RHYTHM_V2\data\host.npz')
h=np.load(hp);vv=h['vertices']*d['source_to_plate']['scale']+np.array(d['source_to_plate']['translation_mm']);host=BVHTree.FromPolygons(vv.tolist(),h['faces'].tolist(),all_triangles=True)
def depth(p):
    q,n,f,v=host.find_nearest(p);return v if (p-q).dot(n)<0 else -v
ids=list(d['positions']);positions=[Vector(d['positions'][i]) for i in ids];index={v:i for i,v in enumerate(ids)}
nodes=[d['anchors'].get(i,i) for i in ids];clear=[depth(p) for p in positions]
zlo=min(min(s['a'][2],s['b'][2]) for s in d['segments']);zhi=max(max(s['a'][2],s['b'][2]) for s in d['segments']);zmax=(zlo+zhi)/2
inside_scope=lambda p:zlo-1e-6<=p.z<=zmax+1e-6
g=nx.Graph();g.add_nodes_from(d['nodes']);g.add_edges_from(d['edges']);original=g.copy();seeds=set(d['seeds'])&set(g)
prospective={}
for si,seg in enumerate(d['segments']):
    sid=f'SMID:{si}:0.50000000';p=Vector(seg['a']).lerp(Vector(seg['b']),.5)
    if sid in index or not inside_scope(p) or not g.has_edge(*seg['nodes']):continue
    dp=depth(p)
    if dp<4.:continue
    index[sid]=len(ids);ids.append(sid);positions.append(p);nodes.append(sid);clear.append(dp)
    prospective[sid]={'kind':'source','segment_index':si,'t':.5,'id':sid,'position':list(p),'graph_edge':seg['nodes']}
kd=KDTree(len(ids))
for i,p in enumerate(positions):kd.insert(p,i)
kd.balance();cache={}
def safe(i,j):
    key=tuple(sorted((i,j)))
    if key in cache:return cache[key]
    a,b=positions[i],positions[j];length=(b-a).length;n=max(1,math.ceil(length/.25))
    if min(clear[i],clear[j])<.145+length/n/2:cache[key]=None;return None
    bound=min(depth(a.lerp(b,k/n)) for k in range(n+1))-length/n/2
    cache[key]=bound if bound>=.145 else None;return cache[key]
def owner(sid):
    if sid.startswith('SMID:'):return d['segments'][int(sid.split(':')[1])]['branch_id']
    return sid.split(':')[1] if sid.startswith('AMID:') else sid.split(':')[0]
owners=[owner(i) for i in ids]
flowerids={f['id'] for f in d['flowers']};contacts={}
for r in d['records']:
    for field,end in [('parent_id','START'),('target_id','END')]:
        if r['source_record'].get(field) in flowerids:contacts[r['id']+':'+end]=r['source_record'][field]
normals={f['id']:Vector(f['normal']).normalized() for f in d['flowers']}
dist=nx.multi_source_dijkstra_path_length(g,seeds,weight='length_mm')
def graph_id(sid):return d['anchors'].get(sid,sid)
forbidden={frozenset((graph_id(r['a_id']),graph_id(r['b_id']))) for r in d['roots']}
for root in d['roots']:
    chain=[(root['a_id'],0.)]+[(c['id'],c['t']) for c in root['cuts']]+[(root['b_id'],1.)]
    for mask in d['deleted']:
        if mask['kind']!='author' or mask['root']!=root['root_id']:continue
        for (a,lo),(b,hi) in zip(chain,chain[1:]):
            if mask['lo']<=lo+1e-6 and mask['hi']>=hi-1e-6:forbidden.add(frozenset((graph_id(a),graph_id(b))))
added=[];replacements=[];used=set();counts=collections.Counter();degree=collections.Counter();pending=[];new_points=[]
def available(k):
    n=nodes[k]
    return g.degree(n)>=2 if n in g else n in prospective and g.has_edge(*prospective[n]['graph_edge'])
def activate(k):
    sid=ids[k]
    if nodes[k] in g:return
    rec=prospective[sid];u,v=rec['graph_edge'];old=dict(g[u][v]);g.remove_edge(u,v);g.add_node(sid,position=list(positions[k]))
    for n in (u,v):g.add_edge(n,sid,**{**old,'length_mm':math.dist(g.nodes[n]['position'],positions[k])})
    branch=d['segments'][rec['segment_index']]['branch_id']
    oldseg=next(s for s in displayby[branch] if set(s['nodes'])==set((u,v)))
    displayby[branch].remove(oldseg)
    displayby[branch].extend([{'branch_id':branch,'a':list(g.nodes[u]['position']),'b':list(positions[k]),'nodes':[u,sid]},{'branch_id':branch,'a':list(positions[k]),'b':list(g.nodes[v]['position']),'nodes':[sid,v]}])
    dist[sid]=min(dist.get(n,math.inf)+g[n][sid]['length_mm'] for n in (u,v))
    new_points.append({k:v for k,v in rec.items() if k!='graph_edge'})
def new_edge(i,j,reason):
    assert frozenset((nodes[i],nodes[j])) not in forbidden
    pair=tuple(sorted((ids[i],ids[j])))
    if pair in used:return
    activate(i);activate(j)
    if not g.has_edge(nodes[i],nodes[j]):
        length=(positions[i]-positions[j]).length
        g.add_edge(nodes[i],nodes[j],length_mm=length,kind='LOWER50_LOCAL')
        added.append({'a_id':ids[i],'b_id':ids[j],'a':list(positions[i]),'b':list(positions[j]),'length_mm':length,'reason':reason,'clearance_mm':safe(i,j)})
        used.add(pair);degree[i]+=1;degree[j]+=1
    else:raise RuntimeError('Replacement pair already belongs to another graph edge')

# Match source display pieces to their original branch arc intervals.
arcs={};tables=collections.defaultdict(list)
for si,s in enumerate(d['segments']):
    start=tables[s['branch_id']][-1][2] if tables[s['branch_id']] else 0.;length=math.dist(s['a'],s['b'])
    tables[s['branch_id']].append((si,start,start+length));arcs[si]=(start,length)
def arc(branch,p):
    best=None
    for si,start,end in tables[branch]:
        seg=d['segments'][si];a=Vector(seg['a']);v=Vector(seg['b'])-a;t=max(0.,min(1.,(Vector(p)-a).dot(v)/max(v.length_squared,1e-12)))
        item=((Vector(p)-a-v*t).length,start+t*(end-start))
        if best is None or item<best:best=item
    return best[1]
displayby=collections.defaultdict(list)
for s in d['display']:displayby[s['branch_id']].append(s)
roots={r['root_id']:r for r in d['roots']}
for key,row in d['catalog'].items():
    if not row['protected']:continue
    a,b=row['ids'];i=index[a];j=index[b];pa,pb=positions[i],positions[j]
    full_length=tables[row['branch']][-1][2] if row['kind']=='source' else math.dist(roots[row['root']]['a_position'],roots[row['root']]['b_position'])
    if full_length<8. or (pb-pa).length<5.5:continue
    if not all(inside_scope(Vector(p)) for piece in row['pieces'] for p in piece):continue
    counts['eligible_long_intervals']+=1
    pending.append((key,row))
    remove=[]
    if row['kind']=='source':
        pieces=[s for s in displayby[row['branch']] if row['lo']-1e-5<arc(row['branch'],[(s['a'][k]+s['b'][k])/2 for k in range(3)])<row['hi']+1e-5]
        remove=[tuple(s['nodes']) for s in pieces]
        allowed={frozenset(e) for e in remove};interior={n for e in remove for n in e}-{nodes[i],nodes[j]}
        if any(n in seeds or any(frozenset((n,v)) not in allowed for v in g[n]) for n in interior):counts['kept_existing_junctions']+=1;continue
    else:remove=[(nodes[i],nodes[j])]
    direction=pb-pa;length=direction.length;choices=[]
    for p,k,lk in kd.find_range(pa,6.):
        if k in (i,j) or ids[k] in contacts or owners[k] in (owners[i],owners[j]):continue
        if not inside_scope(p) or clear[k]<4. or degree[k]>=3 or not available(k):continue
        lj=(p-pb).length
        if min(lk,lj)<1. or lj>6. or lk+lj>length*1.65:continue
        if g.has_edge(nodes[i],nodes[k]) or g.has_edge(nodes[k],nodes[j]):continue
        if frozenset((nodes[i],nodes[k])) in forbidden or frozenset((nodes[k],nodes[j])) in forbidden:continue
        t=max(0.,min(1.,(p-pa).dot(direction)/direction.length_squared));offset=(p-(pa+direction*t)).length
        cosine=(p-pa).normalized().dot((pb-p).normalized());turn=math.degrees(math.acos(max(-1,min(1,cosine))))
        if offset<1. or turn<25. or turn>105.:continue
        okay=True
        for end in (i,j):
            if ids[end] in contacts:
                f=contacts[ids[end]]
                if clear[k]<5. or clear[k]-clear[end]<4. or (p-positions[end]).normalized().dot(-normals[f])<.7:okay=False
        if not okay or safe(i,k) is None or safe(k,j) is None:continue
        choices.append((.2*dist.get(nodes[k],150)+lk+lj,k,turn,offset))
    if not choices:counts['no_safe_short_bent_route']+=1;continue
    _,k,turn,offset=min(choices)
    for u,v in remove:
        if g.has_edge(u,v):g.remove_edge(u,v)
    new_edge(i,k,'flower_bent_route');new_edge(k,j,'flower_bent_route')
    mask={k:v for k,v in row.items() if k in ('kind','branch','root','lo','hi')}
    replacements.append({'mask':mask,'path':[a,ids[k],b],'turn_degrees':turn,'offset_mm':offset,'old_length_mm':length,'removed_graph_edges':remove})
    pending.pop()
print('REROUTED',len(replacements),dict(counts),flush=True)

# When a bend cannot retain existing junctions, split at a real branched junction.
for key,row in pending:
    a,b=row['ids'];i=index[a];j=index[b];pa,pb=positions[i],positions[j]
    if row['kind']=='author':
        root=roots[row['root']];t=round((row['lo']+row['hi'])/2,6);sid=f"AMID:{row['root']}:{t:.8f}"
        pm=Vector(root['a_position']).lerp(Vector(root['b_position']),t)
        provenance={'kind':'author','root':row['root'],'t':t,'edge_ids':[a,b]};split_edges=[(nodes[i],nodes[j])]
    else:
        distance=(row['lo']+row['hi'])/2
        si,start,end=next(r for r in tables[row['branch']] if r[1]<=distance<=r[2])
        t=round(max(.00001,min(.99999,(distance-start)/(end-start))),6)
        seg=d['segments'][si];sid=f'SMID:{si}:{t:.8f}';pm=Vector(seg['a']).lerp(Vector(seg['b']),t)
        provenance={'kind':'source','segment_index':si,'t':t}
        pieces=displayby[row['branch']];actual_distance=start+t*(end-start)
        target=next(s for s in pieces if min(arc(row['branch'],s['a']),arc(row['branch'],s['b']))-1e-6<=actual_distance<=max(arc(row['branch'],s['a']),arc(row['branch'],s['b']))+1e-6)
        split_edges=[tuple(target['nodes'])]
    if sid in d['positions'] or sid in g or not g.has_edge(*split_edges[0]):continue
    middepth=depth(pm)
    if sid in index:m=index[sid]
    else:
        m=len(ids);ids.append(sid);index[sid]=m;positions.append(pm);clear.append(middepth);owners.append(owners[i]);nodes.append(sid)
    choices=[];chord=(pb-pa).normalized()
    for q,k,length in kd.find_range(pm,6.):
        if k in (i,j) or ids[k] in contacts or owners[k]==owners[i] or degree[k]>=3:continue
        if not inside_scope(q) or clear[k]<max(4.,middepth+.5) or length<1. or not available(k):continue
        angle=math.degrees(math.acos(min(1.,abs((q-pm).normalized().dot(chord)))))
        if angle<25. or safe(m,k) is None:continue
        if frozenset((nodes[m],nodes[k])) in forbidden:continue
        choices.append((.3*dist.get(nodes[k],150)+length,k,angle))
    if not choices:continue
    _,k,angle=min(choices);u,v=split_edges[0];old=dict(g[u][v]);g.remove_edge(u,v);g.add_node(sid,position=list(pm))
    for n in (u,v):g.add_edge(n,sid,**{**old,'length_mm':math.dist(g.nodes[n]['position'],pm)})
    if row['kind']=='source':
        branch=row['branch'];displayby[branch].remove(target)
        displayby[branch].extend([{'branch_id':branch,'a':list(g.nodes[u]['position']),'b':list(pm),'nodes':[u,sid]},{'branch_id':branch,'a':list(pm),'b':list(g.nodes[v]['position']),'nodes':[sid,v]}])
    new_edge(m,k,'flower_midpoint_branch')
    new_points.append({**provenance,'id':sid,'position':list(pm),'branch_target':ids[k],'branch_angle_degrees':angle,'catalog_key':key})
print('BRANCHED_MIDPOINTS',len(new_points),flush=True)

# Short interior cross-links in the requested slab. Flower/outer ends are excluded.
dist=nx.multi_source_dijkstra_path_length(g,seeds,weight='length_mm')
def relax(u,v,length):
    heap=[]
    for a,b in ((u,v),(v,u)):
        nd=dist.get(a,math.inf)+length
        if nd<dist.get(b,math.inf):dist[b]=nd;heapq.heappush(heap,(nd,b))
    while heap:
        value,a=heapq.heappop(heap)
        if value!=dist[a]:continue
        for b,e in g[a].items():
            nd=value+e['length_mm']
            if nd<dist.get(b,math.inf)-1e-9:dist[b]=nd;heapq.heappush(heap,(nd,b))
candidate={}
for i,p in enumerate(positions):
    if nodes[i] not in g or not inside_scope(p) or clear[i]<4. or ids[i] in contacts:continue
    for q,j,length in sorted(kd.find_range(p,8.),key=lambda r:r[2])[:64]:
        if j<=i or nodes[j] not in g or length<1 or clear[j]<4 or not inside_scope(q) or ids[j] in contacts or owners[i]==owners[j]:continue
        if g.has_edge(nodes[i],nodes[j]):continue
        if frozenset((nodes[i],nodes[j])) in forbidden:continue
        candidate[(i,j)]=length
for sweep in range(4):
    benefit=lambda ij:abs(dist.get(nodes[ij[0]],math.inf)-dist.get(nodes[ij[1]],math.inf))-candidate[ij]
    count=0
    for i,j in sorted(candidate,key=benefit,reverse=True):
        length=candidate[(i,j)]
        if degree[i]>=3 or degree[j]>=3 or g.has_edge(nodes[i],nodes[j]):continue
        if benefit((i,j))<1. or max(dist.get(nodes[i],0),dist.get(nodes[j],0))<32.:continue
        if safe(i,j) is None:continue
        new_edge(i,j,'lower50_short_link');relax(nodes[i],nodes[j],length);count+=1
    print('SHORT_LINKS',sweep,count,flush=True)
    if not count:break
def measure(graph):
    dd=nx.multi_source_dijkstra_path_length(graph,seeds,weight='length_mm');aug=graph.copy();aug.add_edges_from(('__ROOT__',s) for s in seeds);back=set()
    for ee in nx.biconnected_component_edges(aug):
        if len(ee)>2 and any('__ROOT__' in e for e in ee):back.update(frozenset(e) for e in ee if '__ROOT__' not in e)
    red=total=0.;worst=0.
    for a,b,e in graph.edges(data=True):
        pa=Vector(graph.nodes[a]['position']);pb=Vector(graph.nodes[b]['position']);length=e['length_mm']
        if max(pa.z,pb.z)<zlo or min(pa.z,pb.z)>zmax:continue
        frac=1.
        if abs(pb.z-pa.z)>1e-9:
            lo,hi=sorted(((zlo-pa.z)/(pb.z-pa.z),(zmax-pa.z)/(pb.z-pa.z)));frac=max(0,min(1,hi)-max(0,lo))
        val=(min(dd.get(a,math.inf),dd.get(b,math.inf))+length/2)*(.65 if frozenset((a,b)) in back else 1.)
        total+=length*frac
        if val>=25.65:red+=length*frac
        worst=max(worst,val)
    return {'red_length_mm':red,'total_length_mm':total,'maximum_effective_distance_mm':worst}
seedtree=KDTree(len(seeds))
for i,n in enumerate(seeds):seedtree.insert(Vector(g.nodes[n]['position']),i)
seedtree.balance();witness=[]
for sid,p,n in zip(ids,positions,nodes):
    if n in g and inside_scope(p) and g.degree(n)>0:
        near=seedtree.find(p)[2]
        if near*.65>=30:witness.append({'anchor':sid,'position':list(p),'nearest_seed_distance_mm':near,'best_possible_effective_distance_mm':near*.65})
report={'source':'MINIA_DEEP_BRANCH_REVIEW.blend','z_range_percent':[0,50],'z_range_mm':[zlo,zmax],'rerouted_intervals':len(replacements),'branched_midpoints':sum('branch_target' in r for r in new_points),'new_source_junctions':sum('branch_target' not in r for r in new_points),'reroute_counts':dict(counts),'added_short_edges':len(added),'reasons':dict(collections.Counter(r['reason'] for r in added)),'before':measure(original),'after':measure(g),'unavoidable_red_anchor_count':len(witness),'unavoidable_examples':sorted(witness,key=lambda r:r['best_possible_effective_distance_mm'],reverse=True)[:5]}
(W/'lower50_plan.json').write_text(json.dumps({'report':report,'added':added,'replacements':replacements,'new_points':new_points},indent=2),encoding='utf-8')
(W/'lower50_expected_graph.json').write_text(json.dumps(list(g.edges(data=True))),encoding='utf-8')
print('PLAN_DONE',json.dumps(report),flush=True)
