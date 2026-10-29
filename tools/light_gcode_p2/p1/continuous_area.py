"""Grid-free bounds for swept-footprint coverage in saved G-code.

This v2 screen keeps the v1 meaning of footprint coverage (area fraction of a
target capsule covered by a union of prior certified capsules). It replaces
cell-center raster counts with adaptive geometric lower/upper bounds. A result
that straddles the unchanged coverage threshold is UNKNOWN.
"""
from __future__ import annotations

from collections import defaultdict
import math


class ProvenanceBudgetExceeded(RuntimeError):
    """Explicit stop: complete source ancestry exceeded the configured budget."""


def _point_segment_distance(px, py, ax, ay, bx, by):
    dx=bx-ax;dy=by-ay;ss=dx*dx+dy*dy
    t=0. if ss<=1e-30 else max(0.,min(1.,((px-ax)*dx+(py-ay)*dy)/ss))
    return math.hypot(px-(ax+t*dx),py-(ay+t*dy))


def _orient(ax,ay,bx,by,cx,cy):
    return (bx-ax)*(cy-ay)-(by-ay)*(cx-ax)


def _segments_intersect(a,b,c,d):
    o1=_orient(*a,*b,*c);o2=_orient(*a,*b,*d)
    o3=_orient(*c,*d,*a);o4=_orient(*c,*d,*b)
    eps=1e-12
    if (o1>eps and o2< -eps or o1< -eps and o2>eps) and (o3>eps and o4< -eps or o3< -eps and o4>eps):return True
    return (abs(o1)<=eps and min(a[0],b[0])-eps<=c[0]<=max(a[0],b[0])+eps and min(a[1],b[1])-eps<=c[1]<=max(a[1],b[1])+eps or
            abs(o2)<=eps and min(a[0],b[0])-eps<=d[0]<=max(a[0],b[0])+eps and min(a[1],b[1])-eps<=d[1]<=max(a[1],b[1])+eps or
            abs(o3)<=eps and min(c[0],d[0])-eps<=a[0]<=max(c[0],d[0])+eps and min(c[1],d[1])-eps<=a[1]<=max(c[1],d[1])+eps or
            abs(o4)<=eps and min(c[0],d[0])-eps<=b[0]<=max(c[0],d[0])+eps and min(c[1],d[1])-eps<=b[1]<=max(c[1],d[1])+eps)


def _segment_distance(a,b,c,d):
    if _segments_intersect(a,b,c,d):return 0.
    return min(_point_segment_distance(*a,*c,*d),_point_segment_distance(*b,*c,*d),
               _point_segment_distance(*c,*a,*b),_point_segment_distance(*d,*a,*b))



import numpy as np
from numba import njit

@njit(cache=False,fastmath=False)
def _donor_flags(cx,cy,halfdiag,target_full,packed):
    full=False;possible=False
    if target_full:
        for k in range(len(packed)):
            ax,ay,bx,by,rad,_=packed[k]
            dx=bx-ax;dy=by-ay;ss=dx*dx+dy*dy
            t=0. if ss<=1e-30 else max(0.,min(1.,((cx-ax)*dx+(cy-ay)*dy)/ss))
            if rad>0 and math.hypot(cx-(ax+t*dx),cy-(ay+t*dy))+halfdiag<=rad:
                full=True;break
    for k in range(len(packed)):
        ax,ay,bx,by,_,rad=packed[k]
        dx=bx-ax;dy=by-ay;ss=dx*dx+dy*dy
        t=0. if ss<=1e-30 else max(0.,min(1.,((cx-ax)*dx+(cy-ay)*dy)/ss))
        if rad>0 and math.hypot(cx-(ax+t*dx),cy-(ay+t*dy))-halfdiag<=rad:
            possible=True;break
    return full,possible


@njit(cache=False,fastmath=False)
def _area_numeric(x0,y0,x1,y1,r):
    return 2*r*math.hypot(x1-x0,y1-y0)+math.pi*r*r

@njit(cache=False,fastmath=False)
def _point_segment_numeric(px,py,ax,ay,bx,by):
    dx=bx-ax;dy=by-ay;ss=dx*dx+dy*dy
    t=0. if ss<=1e-30 else max(0.,min(1.,((px-ax)*dx+(py-ay)*dy)/ss))
    return math.hypot(px-(ax+t*dx),py-(ay+t*dy))

@njit(cache=False,fastmath=False)
def _coverage_numeric(x0,y0,x1,y1,r,packed,target_epsilon,max_nodes,area_error_fraction):
    length=math.hypot(x1-x0,y1-y0)
    area_lo=_area_numeric(x0,y0,x1,y1,max(0.,r-target_epsilon))
    area_hi=_area_numeric(x0,y0,x1,y1,r+target_epsilon)
    area=_area_numeric(x0,y0,x1,y1,r)
    if area<=1e-18 or len(packed)==0:return (0.,0.,area,0,False)
    target_lo=max(0.,r-target_epsilon);target_hi=r+target_epsilon
    xmin=min(x0,x1)-target_hi;xmax=max(x0,x1)+target_hi
    ymin=min(y0,y1)-target_hi;ymax=max(y0,y1)+target_hi
    total_lo=0.;total_hi=0.;nodes=0;exhausted=False
    # Adaptive rectangle subdivision. Distance is 1-Lipschitz, so center
    # distance +/- half diagonal provides conservative inside/outside tests.
    stack=[(xmin,ymin,xmax,ymax,0)]
    tolerance=max(1e-7,area*area_error_fraction)
    while stack:
        ax,ay,bx,by,depth=stack.pop();nodes+=1
        cell_area=(bx-ax)*(by-ay)
        if nodes>max_nodes:
            remaining=0.
            for sax,say,sbx,sby,_ in stack:remaining+=(sbx-sax)*(sby-say)
            total_hi+=cell_area+remaining
            exhausted=True;break
        cx=(ax+bx)/2;cy=(ay+by)/2;halfdiag=math.hypot(bx-ax,by-ay)/2
        dt=_point_segment_numeric(cx,cy,x0,y0,x1,y1)
        if dt-halfdiag>target_hi:continue
        target_full=dt+halfdiag<=target_lo
        donor_full,donor_possible=_donor_flags(cx,cy,halfdiag,target_full,packed)
        if target_full and donor_full:
            total_lo+=cell_area;total_hi+=cell_area;continue
        if not donor_possible:continue
        if cell_area<=tolerance or depth>=20:
            total_hi+=cell_area;continue
        if bx-ax>=by-ay:
            mid=(ax+bx)/2;stack.extend(((ax,ay,mid,by,depth+1),(mid,ay,bx,by,depth+1)))
        else:
            mid=(ay+by)/2;stack.extend(((ax,ay,bx,mid,depth+1),(ax,mid,bx,by,depth+1)))
    lo=max(0.,min(1.,total_lo/area_hi))
    hi=1. if area_lo<=1e-18 and total_hi>0 else max(lo,min(1.,total_hi/max(area_lo,1e-18)))
    return lo,hi,area,nodes,exhausted


class RootSetPool:
    """Interned, lossless root sets with a hard, visible memory budget."""
    def __init__(self,max_distinct_sets=500_000,max_root_references=4_000_000):
        self.max_distinct_sets=max_distinct_sets;self.max_root_references=max_root_references
        self.sets=[()];self.ids={():0};self.root_references=0

    def intern(self,roots):
        key=tuple(sorted(set(int(r) for r in roots if int(r)>0)))
        found=self.ids.get(key)
        if found is not None:return found
        if len(self.sets)>=self.max_distinct_sets or self.root_references+len(key)>self.max_root_references:
            raise ProvenanceBudgetExceeded(f'PROVENANCE_RESOURCE_BUDGET_EXCEEDED: sets={len(self.sets)} refs={self.root_references}')
        ident=len(self.sets);self.ids[key]=ident;self.sets.append(key);self.root_references+=len(key)
        return ident

    def get(self,ident):return self.sets[ident]


class AreaBoundsScreen:
    """Area coverage screen whose decisions do not use a raster pitch.

    Each straight G-code subpath is its exact swept capsule. Arc chords have a
    fixed sagitta tolerance supplied by the caller; target/donor radius padding
    converts that geometric approximation into conservative coverage bounds.
    """
    def __init__(self,root_layers=1,threshold=.65,tile=8.,max_nodes_per_footprint=12000,
                 area_error_fraction=.002,arc_sagitta_mm=.005,provenance_pool=None):
        self.root_layers=root_layers;self.threshold=threshold;self.tile=tile
        self.max_nodes=max_nodes_per_footprint;self.area_error_fraction=area_error_fraction
        self.arc_sagitta_mm=arc_sagitta_mm;self.pool=provenance_pool or RootSetPool()
        self.layer=0;self.layer_z=None
        self.previous=[];self.current=[];self.previous_bins=defaultdict(list);self.current_bins=defaultdict(list)
        self.pending=[];self.global_uncertain_roots=set();self.area_budget_exhaustions=0
        self.donor_records=0;self.root_source_kinds={}

    def set_layer(self,layer,z):
        if self.layer==layer:return
        if self.layer and layer<self.layer:raise ValueError('NON_MONOTONIC_LAYER')
        if self.layer:
            self.previous,self.current=self.current,[]
            self.previous_bins,self.current_bins=self.current_bins,defaultdict(list)
        self.layer=layer;self.layer_z=z

    def _bucket_keys(self,x0,y0,x1,y1,r):
        ix0=math.floor((min(x0,x1)-r)/self.tile);ix1=math.floor((max(x0,x1)+r)/self.tile)
        iy0=math.floor((min(y0,y1)-r)/self.tile);iy1=math.floor((max(y0,y1)+r)/self.tile)
        if (ix1-ix0+1)*(iy1-iy0+1)>10000:raise ProvenanceBudgetExceeded('SPATIAL_INDEX_RESOURCE_BUDGET_EXCEEDED')
        return ((ix,iy) for ix in range(ix0,ix1+1) for iy in range(iy0,iy1+1))

    def _candidates(self,bins,records,x0,y0,x1,y1,r):
        out=set()
        for key in self._bucket_keys(x0,y0,x1,y1,r):out.update(bins.get(key,()))
        return [records[i] for i in sorted(out)]

    def _insert(self,record,records,bins):
        if self.donor_records>=2_000_000:raise ProvenanceBudgetExceeded('DONOR_RECORD_RESOURCE_BUDGET_EXCEEDED')
        idx=len(records);records.append(record);self.donor_records+=1
        for key in self._bucket_keys(record['x0'],record['y0'],record['x1'],record['y1'],record['r']+record.get('epsilon',0.)):bins[key].append(idx)

    @staticmethod
    def _area(x0,y0,x1,y1,r):
        return 2*r*math.hypot(x1-x0,y1-y0)+math.pi*r*r

    def _coverage_bounds(self,x0,y0,x1,y1,r,donors,target_epsilon=0.):
        packed=np.empty((len(donors),6),dtype=np.float64)
        for i,d in enumerate(donors):
            packed[i]=(d['x0'],d['y0'],d['x1'],d['y1'],max(0.,d['r']-d.get('epsilon',0.)-target_epsilon),d['r']+d.get('epsilon',0.)+target_epsilon)
        return _coverage_numeric(x0,y0,x1,y1,r,packed,target_epsilon,self.max_nodes,self.area_error_fraction)

    def _overlapping_unknowns(self,x0,y0,x1,y1,r,epsilon,records,bins):
        candidates=self._candidates(bins,records,x0,y0,x1,y1,r+epsilon)
        return self._overlapping_candidates(x0,y0,x1,y1,r,epsilon,candidates)

    @staticmethod
    def _overlapping_candidates(x0,y0,x1,y1,r,epsilon,candidates):
        target_r=r+epsilon;out=[]
        for d in candidates:
            if d['kind']=='CERTIFIED':continue
            reach=target_r+d['r']+epsilon+d.get('epsilon',0.)
            gap_x=max(0.,min(d['x0'],d['x1'])-max(x0,x1),min(x0,x1)-max(d['x0'],d['x1']))
            gap_y=max(0.,min(d['y0'],d['y1'])-max(y0,y1),min(y0,y1)-max(d['y0'],d['y1']))
            # AABB distance is a lower bound on segment distance. Keep equality
            # and a small roundoff margin; only a proven separated pair is cut.
            if gap_x*gap_x+gap_y*gap_y>(reach+1e-12)**2:continue
            if _segment_distance((x0,y0),(x1,y1),(d['x0'],d['y0']),(d['x1'],d['y1']))<=reach:out.append(d)
        return out

    def _register(self,x0,y0,x1,y1,r,epsilon,line,kind,roots):
        if r is None or not math.isfinite(r) or r<=0:
            self.global_uncertain_roots.add(line);self.root_source_kinds.setdefault(line,kind);return
        self.root_source_kinds.setdefault(line,kind)
        rec={'x0':x0,'y0':y0,'x1':x1,'y1':y1,'r':r,'epsilon':epsilon,'line':line,'kind':kind,'root_id':self.pool.intern(roots)}
        self._insert(rec,self.current,self.current_bins)

    def segment(self,x0,y0,x1,y1,width,z,line_no,reason=None,epsilon=0.):
        r=width/2 if width is not None and math.isfinite(width) and width>0 else None
        finite_path=all(map(math.isfinite,(x0,y0,x1,y1,z)))
        if self.layer<=self.root_layers and not reason and r is not None and finite_path and not self.global_uncertain_roots:
            code=0;details={'footprint_area_mm2':self._area(x0,y0,x1,y1,r),'prior_coverage_lower':1.,'prior_coverage_upper':1.,'prior_coverage':1.,'same_cert_coverage':0.,'uncert_overlap_count':0,'direct_unknown':False,'propagated_unknown':False,'reason':None}
            self.pending.append((x0,y0,x1,y1,r,epsilon,line_no,'CERTIFIED',(line_no,)))
            details.update(origin_line=None,origin_root_lines=[],origin_root_overflow=False,origin_provenance_complete=True,origin_overlap_cells=0)
            return code,details
        if reason or r is None or not finite_path:
            cause=reason or 'MISSING_OR_INVALID_LINE_WIDTH_OR_XYZ'
            unbounded=(r is None or not finite_path or any(k in cause for k in ('NON_XY_ARC','ABSOLUTE_ARC_CENTER','ARC_','EXCESSIVE_','OUTSIDE_RASTER')))
            roots=set(self.global_uncertain_roots)|{line_no}
            uncertain=[]
            if not unbounded:
                uncertain=self._overlapping_unknowns(x0,y0,x1,y1,r,epsilon,self.previous,self.previous_bins)+self._overlapping_unknowns(x0,y0,x1,y1,r,epsilon,self.current,self.current_bins)
                for d in uncertain:roots.update(self.pool.get(d['root_id']))
            roots=tuple(sorted(roots))
            details={'reason':cause,'direct_unknown':True,'propagated_unknown':bool(self.global_uncertain_roots or uncertain),'origin_line':min(roots),'origin_root_lines':list(roots),'origin_root_overflow':False,'origin_provenance_complete':True,'origin_overlap_cells':len(uncertain),'footprint_area_mm2':None,'prior_coverage_lower':0.,'prior_coverage_upper':0.,'prior_coverage':0.,'same_cert_coverage':0.,'uncert_overlap_count':len(uncertain)}
            if unbounded:self.pending.append((None,None,None,None,None,0.,line_no,'UNKNOWN_DIRECT',roots))
            else:self.pending.append((x0,y0,x1,y1,r,epsilon,line_no,'UNKNOWN_DIRECT',roots))
            return 3,details
        pr=self._candidates(self.previous_bins,self.previous,x0,y0,x1,y1,r+epsilon)
        sr=self._candidates(self.current_bins,self.current,x0,y0,x1,y1,r+epsilon)
        pc=[d for d in pr if d['kind']=='CERTIFIED'];sc=[d for d in sr if d['kind']=='CERTIFIED']
        lo,hi,area,nodes,exhausted=self._coverage_bounds(x0,y0,x1,y1,r,pc,epsilon)
        slo,shi,_,_,sexhausted=self._coverage_bounds(x0,y0,x1,y1,r,sc,epsilon)
        # Reuse the exact candidate sets already retrieved for coverage. This
        # avoids two redundant spatial-index traversals while retaining every
        # candidate needed for lossless local root attribution.
        uncertain=self._overlapping_candidates(x0,y0,x1,y1,r,epsilon,pr)+self._overlapping_candidates(x0,y0,x1,y1,r,epsilon,sr)
        roots=set(self.global_uncertain_roots)
        for d in uncertain:roots.update(self.pool.get(d['root_id']))
        if lo>=.98 and not exhausted:
            code=0;cause=None
        elif uncertain or self.global_uncertain_roots:
            code=3;cause='UNKNOWN_PROPAGATED'
        elif lo>=self.threshold and not exhausted:
            code=0;cause=None
        elif lo<self.threshold<=hi or exhausted or sexhausted or (hi>0 and lo<=0) or (shi>0 and slo<=0):
            code=3;cause='AREA_COVERAGE_BOUND_STRADDLES_THRESHOLD'
            roots.add(line_no)
        elif lo>0 or slo>0:
            code=1;cause=None
        else:
            code=2;cause=None
        if code==3 and cause!='UNKNOWN_PROPAGATED':roots.add(line_no)
        if code!=0:
            root_tuple=tuple(sorted(roots or {line_no}))
            if code==3:
                source_kind='UNKNOWN_DIRECT' if cause!='UNKNOWN_PROPAGATED' else 'UNKNOWN_PROPAGATED_CARRIER'
            elif code==2:
                source_kind='SCREEN_UNSUPPORTED'
            elif code==1:
                source_kind='MARGINAL'
            else:
                source_kind='UNKNOWN_DIRECT'
            self.pending.append((x0,y0,x1,y1,r,epsilon,line_no,source_kind,root_tuple))
        else:
            root_tuple=(line_no,)
            self.pending.append((x0,y0,x1,y1,r,epsilon,line_no,'CERTIFIED',root_tuple))
        details={'footprint_area_mm2':area,'prior_coverage_lower':lo,'prior_coverage_upper':hi,'prior_coverage':(lo+hi)/2,'same_cert_coverage':(slo+shi)/2,'same_cert_coverage_lower':slo,'same_cert_coverage_upper':shi,'uncert_overlap_count':len(uncertain)+int(bool(self.global_uncertain_roots)),'direct_unknown':bool(code==3 and cause!='UNKNOWN_PROPAGATED'),'propagated_unknown':bool(code==3 and cause=='UNKNOWN_PROPAGATED'),'reason':cause,'area_bound_nodes':nodes,'area_bound_exhausted':bool(exhausted or sexhausted)}
        if code==3:
            details.update(origin_line=min(root_tuple),origin_root_lines=list(root_tuple),origin_root_overflow=False,origin_provenance_complete=True,origin_overlap_cells=len(uncertain))
        else:
            details.update(origin_line=None,origin_root_lines=[],origin_root_overflow=False,origin_provenance_complete=True,origin_overlap_cells=0)
        return code,details

    def commit_move(self):
        for rec in self.pending:
            x0,y0,x1,y1,r,epsilon,line,kind,roots=rec
            if r is None:
                self.global_uncertain_roots.update(roots);continue
            self._register(x0,y0,x1,y1,r,epsilon,line,kind,roots)
        self.pending.clear()

    def add_unbounded_source(self,line_no,source_kind='UNKNOWN_UNLOCATED'):
        if line_no not in self.root_source_kinds and len(self.root_source_kinds)>=100_000:
            raise ProvenanceBudgetExceeded('ROOT_SOURCE_RECORD_BUDGET_EXCEEDED')
        self.global_uncertain_roots.add(int(line_no))
        self.root_source_kinds[int(line_no)]=source_kind
