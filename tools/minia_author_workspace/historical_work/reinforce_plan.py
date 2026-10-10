import json,sys,math,heapq,collections,time,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
W=Path(__file__).resolve().parent;O=W.parent/'outputs'
sys.path.insert(0,str(O/'color_path_runtime/networkx-3.6.1.zip'))
import networkx as nx
t0=time.perf_counter();data=json.loads((W/'reinforce_input.json').read_text(encoding='utf-8'))
hostpath=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_D6_SIZE_RHYTHM_V2\data\host.npz')
h=np.load(hostpath);scale=data['source_to_plate']['scale'];shift=np.array(data['source_to_plate']['translation_mm']);vertices=h['vertices']*scale+shift;faces=h['faces']
host=BVHTree.FromPolygons(vertices.tolist(),faces.tolist(),all_triangles=True)
fpos=np.array([f['position_mm'] for f in data['flowers']])*scale+shift
host_error=max(host.find_nearest(Vector(p))[3] for p in fpos)
assert host_error<.001,host_error
signed_volume=float(np.einsum('ij,ij->i',vertices[faces[:,0]],np.cross(vertices[faces[:,1]],vertices[faces[:,2]])).sum()/6.)
assert signed_volume>0
edges=np.sort(np.concatenate((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]])),axis=1)
_,counts=np.unique(edges,axis=0,return_counts=True)
assert np.all(counts==2),'Host not closed'
print('HOST_MATCH',host_error,'closed',flush=True)
g=nx.Graph();g.add_nodes_from(data['nodes']);g.add_edges_from(data['edges'])
seeds=set(data['seeds'])&set(g)
dist=nx.multi_source_dijkstra_path_length(g,seeds,weight='length_mm')
ids=list(data['positions']);pos=[Vector(data['positions'][i]) for i in ids]
node=[data['anchors'].get(i,i) for i in ids]
kd=KDTree(len(pos))
for i,p in enumerate(pos):kd.insert(p,i)
kd.balance()
def signed_clearance(p):
    q,n,face,d=host.find_nearest(p)
    return d if (p-q).dot(n)<0 else -d
clear=[signed_clearance(p) for p in pos]
print('ANCHORS',len(ids),'inside_display_clearance',sum(c>=.16 for c in clear),flush=True)
midmap={r['stable_id']:r for r in data['mids']}
def owner(sid):
    if sid.startswith('SMID:'):return data['segments'][int(sid.split(':')[1])]['branch_id']
    if sid.startswith('AMID:'):return sid.split(':')[1]
    return sid.split(':')[0]
owners=[owner(i) for i in ids]
flower_ids={f['id'] for f in data['flowers']};flower_anchors=collections.defaultdict(set);flower_branches=collections.defaultdict(set)
for r in data['records']:
    sr=r['source_record']
    for field,endpoint in [('parent_id','START'),('target_id','END')]:
        if sr.get(field) in flower_ids:
            flower_anchors[sr[field]].add(r['id']+':'+endpoint);flower_branches[sr[field]].add(r['id'])
sid_flower={sid:f for f,anchors in flower_anchors.items() for sid in anchors}
for root in data['roots']:
    for field in ('a_id','b_id'):
        if root[field] in sid_flower:flower_branches[sid_flower[root[field]]].add(root['root_id'])
before_flowers=collections.Counter(min(2,len(flower_branches[f])) for f in flower_ids)
print('FLOWERS_BEFORE',dict(before_flowers),flush=True)
existing={tuple(sorted((r['a_id'],r['b_id']))) for r in data['roots']}
deleted_pairs=set()
for r in data['deleted']:
    if r['kind']=='author':
        root=next(x for x in data['roots'] if x['root_id']==r['root'])
        chain=[(root['a_id'],0)]+[(c['id'],c['t']) for c in root['cuts']]+[(root['b_id'],1)]
        deleted_pairs.update(tuple(sorted((a,b))) for (a,lo),(b,hi) in zip(chain,chain[1:]) if r['lo']<=lo+1e-6 and r['hi']>=hi-1e-6)
# Line clearance is certified with the distance function's 1-Lipschitz bound:
# sample clearance >= preview radius + half sample spacing bounds the whole line.
verified={};rejected=collections.Counter()
def inside(i,j):
    key=tuple(sorted((i,j)))
    if key in verified:return verified[key]
    a,b=pos[i],pos[j];length=(b-a).length;n=max(1,math.ceil(length/.25));step=length/n
    required=.14+step*.5+.005
    if min(clear[i],clear[j])<required:verified[key]=None;rejected['endpoint_clearance']+=1;return None
    minimum=min(signed_clearance(a.lerp(b,k/n)) for k in range(n+1))
    if minimum<required:verified[key]=None;rejected['interior_clearance']+=1;return None
    verified[key]=minimum-step*.5
    return verified[key]

added=[];degree=collections.Counter();used=set();index={sid:i for i,sid in enumerate(ids)};new_directions=collections.defaultdict(list)
def add(i,j,reason):
    u,v=node[i],node[j];length=(pos[i]-pos[j]).length
    for a,b in ((i,j),(j,i)):
        direction=(pos[b]-pos[a]).normalized()
        if any(direction.dot(old)<-math.cos(math.radians(20)) and length+old_length>12. for old,old_length in new_directions[node[a]]):
            rejected['long_straight_continuation']+=1;return False
    margin=inside(i,j)
    if margin is None:return False
    g.add_edge(u,v,length_mm=length,kind='LOCAL_REINFORCEMENT')
    used.add(tuple(sorted((i,j))));degree[i]+=1;degree[j]+=1
    new_directions[u].append(((pos[j]-pos[i]).normalized(),length));new_directions[v].append(((pos[i]-pos[j]).normalized(),length))
    added.append({'a_id':ids[i],'b_id':ids[j],'a':list(pos[i]),'b':list(pos[j]),'length_mm':length,'reason':reason,'certified_centerline_clearance_mm':margin})
    heap=[]
    for a,b in ((u,v),(v,u)):
        value=dist.get(a,math.inf)+length
        if value<dist.get(b,math.inf):dist[b]=value;heapq.heappush(heap,(value,b))
    while heap:
        value,a=heapq.heappop(heap)
        if value!=dist[a]:continue
        for b,e in g[a].items():
            nd=value+e['length_mm']
            if nd<dist.get(b,math.inf)-1e-9:dist[b]=nd;heapq.heappush(heap,(nd,b))
    return True

def eligible(i,j):
    if i==j or node[i]==node[j] or owners[i]==owners[j] or g.has_edge(node[i],node[j]):return False
    if tuple(sorted((ids[i],ids[j]))) in existing|deleted_pairs:return False
    if tuple(sorted((i,j))) in used:return False
    return True

# Flower joins: the second member must head inward to a different local branch.
for f in sorted(flower_ids):
    if len(flower_branches[f])>=2:continue
    choices=[]
    for sid in flower_anchors[f]:
        i=index.get(sid)
        if i is None or clear[i]<.27:continue
        for p,j,length in kd.find_range(pos[i],10.):
            if length<1. or not eligible(i,j) or degree[j]>=3:continue
            if sid_flower.get(ids[j])==f or clear[j]<clear[i]+.25:continue
            if pos[j].z>pos[i].z+2.:continue
            choices.append((length+.15*max(0,dist.get(node[j],100)-20),i,j))
    for _,i,j in sorted(choices):
        if add(i,j,'flower_second_branch'):
            flower_branches[f].add('NEW');break
print('FLOWER_ADDED',len(added),flush=True)

# Local spatial neighbors only; no long root hidden behind many subdivision points.
candidates={}
for i,p in enumerate(pos):
    if clear[i]<.27:continue
    for q,j,length in sorted(kd.find_range(p,10.),key=lambda r:r[2])[:64]:
        if j<=i or length<1. or clear[j]<.27 or not eligible(i,j):continue
        candidates[(i,j)]=length
print('CANDIDATES',len(candidates),flush=True)
def improvement(i,j,length):
    a=dist.get(node[i],math.inf);b=dist.get(node[j],math.inf)
    if not math.isfinite(a) and not math.isfinite(b):return 0.
    return abs(a-b)-length
for sweep in range(4):
    order=sorted(candidates,key=lambda ij:improvement(*ij,candidates[ij]),reverse=True)
    count=0
    for i,j in order:
        if degree[i]>=3 or degree[j]>=3 or not eligible(i,j):continue
        length=candidates[(i,j)];benefit=improvement(i,j,length)
        if benefit<2.:continue
        if max(dist.get(node[i],math.inf),dist.get(node[j],math.inf))<34.:continue
        # Prefer compact nearby links; links nearer 10 mm need a larger gain.
        if length>8 and benefit<5:continue
        if add(i,j,'local_distance_reduction'):count+=1
    print('SWEEP',sweep,'added',count,'total',len(added),flush=True)
    if not count:break

def score(graph):
    dd=nx.multi_source_dijkstra_path_length(graph,seeds,weight='length_mm');aug=graph.copy();root='__ROOT__';aug.add_edges_from((root,s) for s in seeds)
    backbone=set()
    for ee in nx.biconnected_component_edges(aug):
        if len(ee)>2 and any(root in e for e in ee):backbone.update(frozenset(e) for e in ee if root not in e)
    vals={};red_length=0;orange_length=0;total=0
    for a,b,e in graph.edges(data=True):
        length=e['length_mm'];val=(min(dd.get(a,math.inf),dd.get(b,math.inf))+length/2)*(.65 if frozenset((a,b)) in backbone else 1.)
        vals[frozenset((a,b))]=val;total+=length
        if val>=25.65:red_length+=length
        if val>=30:orange_length+=length
    return vals,{'red_ge_25_65_length_mm':red_length,'saturated_ge_30_length_mm':orange_length,'graph_total_length_mm':total}
vals,stage=score(g)
# A few short cross-links in high-distance tree portions create alternate routes.
cycle_count=0
for i,j in sorted(candidates,key=lambda ij:candidates[ij]):
    if degree[i]>=3 or degree[j]>=3 or not eligible(i,j):continue
    if max(dist.get(node[i],0),dist.get(node[j],0))<30:continue
    length=candidates[(i,j)]
    if length>7.:continue
    if not any(vals.get(frozenset((node[k],v)),0)>=25.65 for k in (i,j) for v in g[node[k]]):continue
    local=nx.single_source_dijkstra_path_length(g,node[i],cutoff=length*2.5,weight='length_mm')
    if node[j] in local:continue
    if add(i,j,'short_alternate_route'):cycle_count+=1
    if cycle_count>=400:break
vals,after=score(g)
original=nx.Graph();original.add_nodes_from(data['nodes']);original.add_edges_from(data['edges']);_,before=score(original)
report={'source':'MINIA_INTERVAL_DELETE.blend','interpretation':'Use lower Z 0-30 percent as reference; reinforce whole model','maximum_new_logical_branch_length_mm':max((r['length_mm'] for r in added),default=0),'new_branches':len(added),'reasons':dict(collections.Counter(r['reason'] for r in added)),'before':before,'after':after,'flowers_multiple_before':before_flowers.get(2,0),'flowers_multiple_after':sum(len(flower_branches[f])>=2 for f in flower_ids),'flower_count':len(flower_ids),'host_sha256':hashlib.sha256(hostpath.read_bytes()).hexdigest(),'host_flower_max_error_mm':host_error,'closed_host':True,'minimum_certified_centerline_clearance_mm':min((r['certified_centerline_clearance_mm'] for r in added),default=None),'clearance_scope':'Entire added centerline and 0.14 mm display radius inside closed original host; fabrication thickness not assigned','rejected':dict(rejected),'elapsed_s':time.perf_counter()-t0}
(W/'reinforce_plan.json').write_text(json.dumps({'report':report,'added':added},ensure_ascii=False,indent=2),encoding='utf-8')
print('PLAN_DONE',json.dumps(report),flush=True)
