"""Rare near-plane fallback: exact rational intersections of stored binary floats.

No epsilon welding or nonzero-segment deletion. Exact parity at every local
grid centre must agree with the independent floating polygon/raster result.
This certifies the saved mesh, not an ideal pre-quantization CAD surface.
"""
from fractions import Fraction as F
import numpy as np

def exact_section(tri,z,origin,pitch,shape):
    from .section_reader import from_segments,unknown
    zz=F(float(z));segments=[];points=set();zero=0
    for triangle in tri:
        v=[tuple(F(float(x)) for x in p) for p in triangle];hits=[]
        for a,b in zip(v,v[1:]+v[:1]):
            if (a[2]>zz)!=(b[2]>zz):
                u=(zz-a[2])/(b[2]-a[2])
                hits.append(tuple(a[i]+u*(b[i]-a[i]) for i in (0,1)))
        if len(hits)!=2:return unknown('EXACT_INTERSECTION_MULTIPLICITY')
        if hits[0]==hits[1]:zero+=1;continue
        segments.append(hits);points.update(hits)
    if not segments:return unknown('EXACT_NO_NONZERO_CONTOUR')
    # Fail if distinct rational vertices cannot be represented separately.
    if len({tuple(map(float,p)) for p in points})!=len(points):
        return unknown('EXACT_FLOAT_VERTEX_COLLAPSE')
    arr=np.array(segments,dtype=float)
    result=from_segments(arr,origin,pitch,shape,weld=False)
    result.update(exact_rational=True,source_segment_count=len(segments),exact_point_tangencies=zero,
                  min_segment_mm=float(np.linalg.norm(arr[:,1]-arr[:,0],axis=1).min()),
                  section_bbox=[arr.min((0,1)).tolist(),arr.max((0,1)).tolist()])
    if result['status']!='VALID_SECTION':return result
    low=arr.min((0,1));high=arr.max((0,1));o=np.asarray(origin)
    ij0=np.maximum(0,np.floor((low-o)/pitch).astype(int)-1)
    ij1=np.minimum(np.array(shape[::-1])-1,np.ceil((high-o)/pitch).astype(int)+1)
    exact_cells=[];centres=0;boundary=0
    for iy in range(ij0[1],ij1[1]+1):
        y=F(float(o[1]+(iy+.5)*pitch))
        for ix in range(ij0[0],ij1[0]+1):
            x=F(float(o[0]+(ix+.5)*pitch));inside=False;on=False;centres+=1
            for a,b in segments:
                cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0])
                if cross==0 and min(a[0],b[0])<=x<=max(a[0],b[0]) and min(a[1],b[1])<=y<=max(a[1],b[1]):on=True
                if (a[1]>y)!=(b[1]>y):
                    at=a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1])
                    if x<at:inside=not inside
            if inside or on:exact_cells.append(iy*shape[1]+ix)
            boundary+=int(on)
    if not np.array_equal(result['cells'],np.asarray(exact_cells,dtype=np.int32)):
        return unknown('EXACT_GRID_REFERENCE_MISMATCH',exact_rational=True)
    result.update(exact_grid_equal=True,exact_centres_checked=centres,exact_boundary_centres=boundary)
    return result
