"""LOWZ-only closed-ring reader. Never repairs a mesh or pairs open ends.

Intersection welding tolerance is 1e-8 mm (roundoff only, 20 million times
smaller than LIGHT's 0.2 mm grid). Ambiguity invalidates the whole connected
mesh section. UNKNOWN has cells=None, never an empty occupied-cell array.
"""
import hashlib
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from scipy import sparse
from scipy.sparse.csgraph import connected_components
from shapely.geometry import Polygon, LineString
from shapely import contains_xy, intersects_xy
import shapely

VERSION='lowz-closed-rings-3'
WELD_MM=1e-8

def identity():
    return dict(version=VERSION,sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),weld_mm=WELD_MM,shapely=shapely.__version__,geos=shapely.geos_version_string)

def unknown(reason,**detail):
    return dict(status='UNKNOWN_SECTION',reason=reason,cells=None,**detail)

def read_section(tri,z,origin,pitch,shape,z_bounds=None):
    lo,hi=z_bounds if z_bounds is not None else (tri[:,:,2].min(1),tri[:,:,2].max(1))
    coplanar=np.flatnonzero((lo==z)&(hi==z))
    if len(coplanar):return unknown('COPLANAR_FACE',triangle_ids=coplanar[:32].tolist(),section_bbox=[tri[coplanar,:,:2].min((0,1)).tolist(),tri[coplanar,:,:2].max((0,1)).tolist()])
    selected=np.flatnonzero((lo<=z)&(hi>z))
    if not len(selected):return dict(status='VALID_SECTION',cells=np.empty(0,np.int32),rings=0,reference_equal=True)
    a=tri[selected];b=np.roll(a,-1,axis=1);hit=(a[:,:,2]>z)!=(b[:,:,2]>z)
    den=b[:,:,2]-a[:,:,2];u=np.divide(z-a[:,:,2],den,out=np.zeros_like(den),where=den!=0)
    points=a+(b-a)*u[:,:,None]
    # Exact on-plane endpoints must stay bit-identical. Computing a+(b-a)*1
    # introduces false tiny segments at one shared vertex on oblique faces.
    points=np.where((a[:,:,2]==z)[:,:,None],a,points)
    points=np.where((b[:,:,2]==z)[:,:,None],b,points)
    segments=points[hit].reshape(-1,2,3)[:,:,:2]
    length=np.linalg.norm(segments[:,1]-segments[:,0],axis=1)
    if np.any((length>0)&(length<=WELD_MM)):
        return unknown('SUB_TOLERANCE_SEGMENT',segment_count=int(np.sum((length>0)&(length<=WELD_MM))))
    segments=segments[length>WELD_MM]
    if not len(segments):return dict(status='VALID_SECTION',cells=np.empty(0,np.int32),rings=0,reference_equal=True,tangency=True)
    result=from_segments(segments,origin,pitch,shape)
    result['section_bbox']=[segments.min((0,1)).tolist(),segments.max((0,1)).tolist()]
    result['source_segment_count']=len(segments)
    return result

def from_segments(segments,origin,pitch,shape):
    endpoints=segments.reshape(-1,2);pts,inv=np.unique(endpoints,axis=0,return_inverse=True)
    pairs=cKDTree(pts).query_pairs(WELD_MM,output_type='ndarray')
    if len(pairs):
        adjacency=sparse.coo_matrix((np.ones(len(pairs)),(pairs[:,0],pairs[:,1])),shape=(len(pts),len(pts)))
        _,labels=connected_components(adjacency,directed=False)
        _,first=np.unique(labels,return_index=True);pts=pts[first];inv=labels[inv]
    edges=inv.reshape(-1,2)
    if np.any(edges[:,0]==edges[:,1]):return unknown('COLLAPSED_EDGE')
    _,counts=np.unique(np.sort(edges,axis=1),axis=0,return_counts=True)
    if np.any(counts>1):return unknown('DUPLICATE_SEGMENT',duplicates=int(sum(counts>1)))
    degree=np.bincount(edges.ravel(),minlength=len(pts))
    if np.any(degree!=2):return unknown('OPEN_OR_NONMANIFOLD_CONTOUR',degree_histogram={str(k):int(v) for k,v in zip(*np.unique(degree,return_counts=True))},endpoint_bbox=[pts.min(0).tolist(),pts.max(0).tolist()])
    adj=[[] for _ in pts]
    for a,b in edges:adj[a].append(b);adj[b].append(a)
    seen=set();rings=[]
    for start in range(len(pts)):
        if start in seen:continue
        path=[];prev=-1;cur=start
        while cur not in seen:
            seen.add(cur);path.append(cur);nxt=adj[cur][0] if adj[cur][0]!=prev else adj[cur][1];prev,cur=cur,nxt
        if cur!=start or len(path)<3:return unknown('AMBIGUOUS_CYCLE')
        rings.append(pts[path])
    polygons=[Polygon(r) for r in rings]
    if any(not p.is_valid or p.area<=0 for p in polygons):return unknown('INVALID_RING')
    for i,p in enumerate(polygons):
        for q in polygons[:i]:
            if p.boundary.intersects(q.boundary):return unknown('TOUCHING_OR_CROSSING_RINGS')
    # GEOS reference retains holes by parity; scanline code below is independent.
    poly=polygons[0]
    for p in polygons[1:]:poly=poly.symmetric_difference(p)
    lower=pts.min(0);upper=pts.max(0);origin=np.asarray(origin)
    if np.any(lower<origin) or np.any(upper>origin+np.array(shape[::-1])*pitch):return unknown('OUTSIDE_RASTER_FRAME')
    x0,y0=np.maximum(0,np.floor((lower-origin)/pitch).astype(int))
    x1,y1=np.minimum(np.array(shape[::-1])-1,np.ceil((upper-origin)/pitch).astype(int))
    xs=origin[0]+(np.arange(x0,x1+1)+.5)*pitch;ys=origin[1]+(np.arange(y0,y1+1)+.5)*pitch
    mask=np.zeros((len(ys),len(xs)),bool)
    for ring in rings:
        a=ring;b=np.roll(ring,-1,axis=0)
        for j,y in enumerate(ys):
            hit=(a[:,1]>y)!=(b[:,1]>y)
            cross=a[hit,0]+(y-a[hit,1])*(b[hit,0]-a[hit,0])/(b[hit,1]-a[hit,1])
            if len(cross)%2:return unknown('ODD_CLOSED_RING_CROSSINGS')
            cross.sort()
            for left,right in cross.reshape(-1,2):mask[j]^=(xs>=left)&(xs<right)
    xx,yy=np.meshgrid(xs,ys)
    ref=contains_xy(poly,xx,yy);boundary=intersects_xy(poly,xx,yy)&~ref
    # Exact-boundary grid centres are explicitly included in both methods.
    mask|=boundary;ref|=boundary
    if not np.array_equal(mask,ref):return unknown('INDEPENDENT_OCCUPANCY_MISMATCH',mismatch_cells=int(np.count_nonzero(mask!=ref)))
    rows,cols=np.nonzero(mask);cells=((rows+y0)*shape[1]+cols+x0).astype(np.int32)
    return dict(status='VALID_SECTION',cells=cells,rings=len(rings),reference_equal=True,area_mm2=float(poly.area),section_bbox=[lower.tolist(),upper.tolist()],boundary_cells=int(boundary.sum()))
