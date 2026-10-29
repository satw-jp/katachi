"""External STL surface-only v1. Fixed-host replay remains unchanged."""
import hashlib, io, json, math, re, time
from pathlib import Path
import numpy as np
import trimesh
from surface import replay as s

KIND = 'external-surface-v1'
ALGORITHM = 'external-d6-balanced-farthest-v1'
CANDIDATES = 100_000
MAX_FACES = 20_000
MAX_BYTES = 8 * 1024**2
MAX_FLOWERS = 300
MAX_SECONDS = 60
MAX_RAM = 1024**3
MAX_SAVE = 128 * 1024**2

def read(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p, x): Path(p).write_text(json.dumps(x, ensure_ascii=False, allow_nan=False, separators=(',', ':')), encoding='utf-8')
def digest(x): return hashlib.sha256(json.dumps(x, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
def sha(b): return hashlib.sha256(b).hexdigest()

def parse_stl(data):
    if not 0 < len(data) <= MAX_BYTES: raise ValueError('STL budget: maximum 8 MiB')
    # No repair, processing, welding tolerance, normal correction or face reordering.
    loaded = trimesh.load(io.BytesIO(data), file_type='stl', process=False)
    tri = np.asarray(loaded.triangles, dtype=np.float64)
    if tri.ndim != 3 or tri.shape[1:] != (3,3) or not 0 < len(tri) <= MAX_FACES:
        raise ValueError('STL budget: 1..20000 triangles required')
    if not np.isfinite(tri).all(): raise ValueError('Non-finite STL coordinates')
    cross = np.cross(tri[:,1]-tri[:,0], tri[:,2]-tri[:,0])
    if np.any(np.linalg.norm(cross,axis=1) <= 1e-12): raise ValueError('Degenerate triangle; automatic repair disabled')
    # Exact vertex identity for topology only; original triangle indices are preserved.
    vertices, inverse = np.unique(tri.reshape(-1,3), axis=0, return_inverse=True)
    faces = inverse.reshape(-1,3)
    edges = {}
    for i, face in enumerate(faces):
        for a,b in zip(face, np.roll(face,-1)):
            edges.setdefault(tuple(sorted((int(a),int(b)))), []).append((i,int(a),int(b)))
    adjacency=[[] for _ in faces]
    for entries in edges.values():
        if len(entries)!=2: raise ValueError('Open or non-manifold shell; exactly two faces per edge required')
        (i,a,b),(j,c,d)=entries
        if a!=d or b!=c: raise ValueError('Inconsistent triangle orientation')
        adjacency[i].append(j); adjacency[j].append(i)
    seen={0}; pending=[0]
    while pending:
        for j in adjacency[pending.pop()]:
            if j not in seen: seen.add(j); pending.append(j)
    if len(seen)!=len(faces): raise ValueError('Multiple shells are unsupported')
    volume=np.einsum('ij,ij->i',tri[:,0],np.cross(tri[:,1],tri[:,2])).sum()/6
    if volume<=0: raise ValueError('Outward orientation and positive enclosed volume required; no automatic repair')
    return vertices, faces

def host_info(data):
    v,f=parse_stl(data)
    return dict(sha256=sha(data),bytes=len(data),triangles=len(f),bounds=[v.min(0).tolist(),v.max(0).tolist()],dimensions=(v.max(0)-v.min(0)).tolist())

def import_host(project,data):
    info=host_info(data)
    path=project/'assets/external'/ (info['sha256']+'.stl')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data)
    return info

def validate_recipe(r):
    expected={'kind','algorithm','host','hostScale','upAxis','units','template','flowerScale','density','seed'}
    if set(r)!=expected or r['kind']!=KIND or r['algorithm']!=ALGORITHM: raise ValueError('Unsupported external recipe')
    if r['units']!='mm' or r['upAxis'] not in ('x','y','z'): raise ValueError('Confirm mm and source up axis')
    if not isinstance(r['host'],str) or not re.fullmatch('[a-f0-9]{64}',r['host']): raise ValueError('Invalid Host identity')
    if r['template']!=s.SOURCE_FILES['data/D6_local.npz']['sha256']: raise ValueError('D6 template identity mismatch')
    for k in ('hostScale','flowerScale','density'):
        if isinstance(r[k],bool) or not isinstance(r[k],(float,int)) or not math.isfinite(r[k]) or not 0<r[k]<=100: raise ValueError('Invalid '+k)
    if type(r['seed']) is not int or not 0<=r['seed']<=2**32-1: raise ValueError('Seed must be a uint32')
    return r

def host_mesh(project,r):
    validate_recipe(r)
    data=(project/'assets/external'/(r['host']+'.stl')).read_bytes()
    if sha(data)!=r['host']: raise ValueError('Original STL hash mismatch')
    v,f=parse_stl(data)
    rotation={'z':np.eye(3),'y':np.array([[1,0,0],[0,0,-1],[0,1,0]]),'x':np.array([[0,0,-1],[0,1,0],[1,0,0]])}[r['upAxis']]
    return v @ rotation.T*r['hostScale'],f

def arrays_and_instances(project,r):
    v,f=host_mesh(project,r)
    tri=v[f]; area=float((np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)*.5).sum())
    count=int(round(area*s.REFERENCE_COUNT/s.REFERENCE_AREA/r['flowerScale']**2*r['density']))
    if not 1<=count<=MAX_FLOWERS: raise ValueError(f'Placement budget: computed {count}; permitted 1..{MAX_FLOWERS}; unchanged settings')
    pool=s.sample_candidates(v,f,r['seed'],CANDIDATES)
    dist=read(project/'assets/data/reference_size_distribution.json')
    scales=np.array([x['D6_physical_scale'] for x in dist])
    source,order=s.balanced_size_assignment(scales,count)
    source=source[order]; q=scales[source]; physical=q*r['flowerScale']
    chosen,scores=s.choose_farthest(pool['points'],physical)
    positions=pool['points'][chosen]; normals=pool['normal'][chosen]
    rng=np.random.default_rng(); rng.bit_generator.state=json.loads(pool['rng_state'].tobytes())
    twists=rng.random(count)*(math.pi/3)
    rotations=np.array([s.rotation_from_normal(n,float(t)) for n,t in zip(normals,twists)])
    quats=np.array([s.matrix_to_quaternion_wxyz(m) for m in rotations])
    fv,ff=s.load_mesh(project/'assets/data/D6_local.npz')
    anchor=s.ANCHOR_BARY @ fv[ff[s.ANCHOR_FACE]]
    if np.linalg.norm(anchor-s.ANCHOR_LOCAL)>1e-5: raise ValueError('D6 anchor identity mismatch')
    anchors=positions+np.einsum('nij,nj->ni',rotations,physical[:,None]*anchor)
    transforms=np.repeat(np.eye(4)[None],count,axis=0)
    transforms[:,:3,:3]=rotations*physical[:,None,None]; transforms[:,:3,3]=positions
    arrays=dict(candidate_index=chosen,source_size_index=source,physical_scale=physical,q=q,
        host_triangle_index=pool['triangle_index'][chosen],host_barycentric=pool['barycentric'][chosen],
        position_mm=positions,normal=normals,quaternion_wxyz=quats,rotation_matrix=rotations,
        transform=transforms,anchor_world_mm=anchors,twist_rad=twists,clearance_score=scores)
    prefix=digest(r)[:16]
    instances=[dict(instance_id=f'{prefix}-{i:05d}',host_triangle_index=int(arrays['host_triangle_index'][i]),
        host_barycentric=arrays['host_barycentric'][i].tolist(),position_mm=positions[i].tolist(),normal=normals[i].tolist(),
        rotation_quaternion_wxyz=quats[i].tolist(),physical_scale=float(physical[i]),flower_global_scale=r['flowerScale'],
        transform=transforms[i].tolist(),anchor_world_mm=anchors[i].tolist()) for i in range(count)]
    return arrays,instances,dict(hostAreaMm2=area,hostBounds=[v.min(0).tolist(),v.max(0).tolist()],
        originalHost=host_info((project/"assets/external"/(r["host"]+".stl")).read_bytes()),
        candidates=CANDIDATES,sharedTemplateTriangles=len(ff),expandedEquivalentTriangles=len(ff)*count,
        templateDimensionsMm=(fv.max(0)-fv.min(0)).tolist(),templateOrigin=[0,0,0],templateForward='+Z',
        templateAnchor=anchor.tolist(),candidatePoolHash=s.canonical_array_digest(pool))

def generate(project,r,key):
    start=time.perf_counter()
    arrays,instances,metrics=arrays_and_instances(project,r)
    layout=project/'layouts'/key/'surface'; layout.mkdir(parents=True)
    np.savez_compressed(layout/'placements.npz',**arrays)
    h=s.canonical_array_digest(arrays)
    write(layout/'surface.json',dict(schema=KIND,count=len(instances),instances=instances,semantic_geometry_sha256=h,metrics=metrics))
    result=dict(id=key,kind=KIND,recipe=r,flowerCount=len(instances),memberCount=0,surfaceHash=h,recipeHash=digest(r),
        centerlineHash=None,meshHash=None,layout=f'layouts/{key}',runtimeSeconds=time.perf_counter()-start,
        internal='NOT_SUPPORTED: external Host core/domain not generated',support='NOT_GENERATED',fabrication='NOT_TESTED',printGo=False,metrics=metrics)
    out=project/'results'/key;out.mkdir(parents=True)
    write(out/'result.json',result)
    validate_result(project,result)
    return result

def validate_result(project,result):
    r=validate_recipe(result['recipe'])
    if result['kind']!=KIND or result['layout']!='layouts/'+result['id'] or result['recipeHash']!=digest(r): raise ValueError('External result binding mismatch')
    if result['memberCount']!=0 or result['centerlineHash'] is not None or result['meshHash'] is not None or result['printGo'] is not False or result['support']!='NOT_GENERATED': raise ValueError('Unsupported structure claim')
    v,f=host_mesh(project,r)
    layout=project/result['layout']/'surface'
    doc=read(layout/'surface.json')
    with np.load(layout/'placements.npz',allow_pickle=False) as z: a=dict(z)
    if s.canonical_array_digest(a)!=result['surfaceHash'] or doc['semantic_geometry_sha256']!=result['surfaceHash']: raise ValueError('External semantic hash mismatch')
    if doc['metrics'] != result['metrics'] or result['metrics']['originalHost'] != host_info((project/'assets/external'/(r['host']+'.stl')).read_bytes()): raise ValueError('Host metadata mismatch')
    n=result['flowerCount']; inst=doc['instances']
    if n!=len(inst) or n!=doc['count'] or not 1<=n<=MAX_FLOWERS: raise ValueError('Invalid instance count')
    for field,array in [('position_mm','position_mm'),('host_triangle_index','host_triangle_index'),('host_barycentric','host_barycentric'),('normal','normal'),('rotation_quaternion_wxyz','quaternion_wxyz'),('physical_scale','physical_scale'),('transform','transform'),('anchor_world_mm','anchor_world_mm')]:
        if not np.array_equal(np.asarray([i[field] for i in inst]),a[array]): raise ValueError('Instance mirror mismatch: '+field)
    if [i['instance_id'] for i in inst]!=[f'{digest(r)[:16]}-{i:05d}' for i in range(n)]: raise ValueError('Instance ID mismatch')
    index=a['host_triangle_index']; bary=a['host_barycentric']
    if index.dtype.kind not in 'iu' or np.any(index<0) or np.any(index>=len(f)) or np.any(bary<0) or not np.allclose(bary.sum(1),1,rtol=0,atol=1e-12): raise ValueError('Invalid triangle/barycentric binding')
    p=np.einsum('ni,nij->nj',bary,v[f[index]])
    fv,ff=s.load_mesh(project/'assets/data/D6_local.npz'); anchor=s.ANCHOR_BARY @ fv[ff[s.ANCHOR_FACE]]
    normal=np.cross(v[f[index,1]]-v[f[index,0]],v[f[index,2]]-v[f[index,0]]);normal/=np.linalg.norm(normal,axis=1)[:,None]
    rot=np.array([s.rotation_from_normal(n,float(t)) for n,t in zip(normal,a['twist_rad'])])
    dist=read(project/'assets/data/reference_size_distribution.json');scales=np.array([x['D6_physical_scale'] for x in dist])
    source,order=s.balanced_size_assignment(scales,n); expected_scale=scales[source[order]]*r['flowerScale']
    expected_transform=np.repeat(np.eye(4)[None],n,axis=0);expected_transform[:,:3,:3]=rot*expected_scale[:,None,None];expected_transform[:,:3,3]=p
    expected_anchor=p+np.einsum('nij,j->ni',expected_transform[:,:3,:3],anchor)
    for actual,expected in [(a['position_mm'],p),(a['normal'],normal),(a['rotation_matrix'],rot),(a['physical_scale'],expected_scale),(a['transform'],expected_transform),(a['anchor_world_mm'],expected_anchor),(a['quaternion_wxyz'],np.array([s.matrix_to_quaternion_wxyz(m) for m in rot]))]:
        if not np.isfinite(actual).all() or not np.allclose(actual,expected,rtol=0,atol=1e-9): raise ValueError('Surface/transform/anchor reconstruction failed')
    tri=v[f];area=float((np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)*.5).sum())
    if n!=int(round(area*s.REFERENCE_COUNT/s.REFERENCE_AREA/r['flowerScale']**2*r['density'])): raise ValueError('Count/recipe mismatch')

def scene(project,result):
    v,f=host_mesh(project,result['recipe']);fv,ff=s.load_mesh(project/'assets/data/D6_local.npz')
    return dict(host=dict(vertices=v.ravel().tolist(),faces=f.ravel().tolist()),flower=dict(vertices=fv.ravel().tolist(),faces=ff.ravel().tolist()),
        instances=read(project/result['layout']/'surface/surface.json')['instances'],branches=dict(vertices=[],faces=[]))
