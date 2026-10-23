"""Conservative three-valued *sampled CAD* domain; not native certification.

UNKNOWN overrides known occupancy, including overlap. PROVEN_EMPTY means an
audited grid centre, never an entire empty voxel. Continuous corridors query
all uncertainty envelopes touched by their full area, not just grid centres.
No global cache flag is changed and the legacy generator remains fail-closed.
"""
from enum import IntEnum
import numpy as np

class State(IntEnum):
    PROVEN_EMPTY=0
    KNOWN_MATERIAL=1
    UNKNOWN=2

class Domain:
    def __init__(self,occupied,origin,pitch,regions):
        self.occupied=occupied;self.origin=np.asarray(origin,float);self.pitch=float(pitch)
        self.nz,self.ny,self.nx=occupied.shape;self.regions={}
        for r in regions:self.regions.setdefault(int(r['section']),[]).append(r)
        self.bounds={z:np.asarray([r['uncertainty_envelope'] for r in rows],float) for z,rows in self.regions.items()}

    def conflicts(self,layer,box,halo=0.):
        box=np.asarray(box,float);lo=box[0]-halo;hi=box[1]+halo
        if not np.isfinite(halo) or halo<0 or not np.isfinite(box).all() or np.any(lo>hi):raise ValueError('INVALID_QUERY')
        if layer<0 or layer>=self.nz or np.any(lo<self.origin) or np.any(hi>self.origin+self.pitch*np.array([self.nx,self.ny])):
            return [dict(reason='OUTSIDE_AUDITED_DOMAIN')]
        if layer not in self.bounds:return []
        bounds=self.bounds[layer];hit=np.all(bounds[:,0]<=hi,axis=1)&np.all(bounds[:,1]>=lo,axis=1)
        return [self.regions[layer][i] for i in np.flatnonzero(hit)]

    def states(self,layer,cells):
        cells=np.asarray(cells,int);out=np.full(len(cells),State.UNKNOWN,np.uint8)
        if layer<0 or layer>=self.nz:return out
        valid=(cells>=0)&(cells<self.nx*self.ny)
        out[valid]=self.occupied[layer].ravel()[cells[valid]].astype(np.uint8)
        y,x=np.divmod(cells,self.nx);xy=self.origin+(np.c_[x,y]+.5)*self.pitch
        for r in self.regions.get(layer,[]):
            lo,hi=np.asarray(r['uncertainty_envelope']);hit=np.all(xy>=lo,axis=1)&np.all(xy<=hi,axis=1)
            out[hit]=State.UNKNOWN
        return out

    def check_boxes(self,boxes,halo=0.):
        failures=[]
        for layer,box in sorted(boxes.items()):
            hit=self.conflicts(int(layer),box,halo)
            if hit:failures.append(dict(section=int(layer),reasons=[{k:r[k] for k in ('part','component','reason') if k in r} for r in hit]))
        return failures

    def certify(self,birth,target,donor,route,clearance,donor_cells,halo):
        """All four scopes mandatory; route covers foot through final receiver.

        Caller supplies conservative full-shape per-plane bounds. Passing only
        certifies absence of UNKNOWN on the sampled domain; exact collisions,
        sub-grid support/chronology and native extrusion remain separate gates.
        """
        failures=[]
        requirements={'target':set(range(birth-1,birth+5)),
                      'donor':set(range(0,birth)),
                      'route':set(range(0,birth+5)),
                      'clearance':set(range(0,birth+5))}
        scopes=dict(target=target,donor=donor,route=route,clearance=clearance)
        if birth<1 or not np.isfinite(halo) or halo<=0:return dict(status='LOCAL_UNVERIFIED',reasons=['INVALID_SCOPE_OR_HALO'])
        for name,scope in scopes.items():
            missing=sorted(requirements[name]-set(scope))
            if missing:failures.append(dict(scope=name,missing_sections=missing))
            for f in self.check_boxes(scope,halo):failures.append(dict(scope=name,**f))
        # Full donor material and footprint continuity to the plate.
        previous=None
        for layer in range(birth):
            cc=np.asarray(donor_cells.get(layer,[]),int)
            if not len(cc) or np.any(self.states(layer,cc)!=State.KNOWN_MATERIAL):
                failures.append(dict(scope='donor',section=layer,reason='NO_KNOWN_ROOTED_MATERIAL'));continue
            y,x=np.divmod(cc,self.nx);xy=self.origin+(np.c_[x,y]+.5)*self.pitch
            if layer not in donor or np.any(xy<np.asarray(donor[layer])[0]) or np.any(xy>np.asarray(donor[layer])[1]):
                failures.append(dict(scope='donor',section=layer,reason='CELLS_OUTSIDE_DECLARED_CORRIDOR'))
            from scipy.ndimage import label
            mask=np.zeros((self.ny,self.nx),bool);mask.ravel()[cc]=True
            if label(mask,np.ones((3,3)))[1]!=1 or (previous is not None and not np.intersect1d(cc,previous).size):
                failures.append(dict(scope='donor',section=layer,reason='DISCONNECTED_DONOR'))
            previous=cc
        return dict(status='LOCAL_UNVERIFIED' if failures else 'UNKNOWN_EXCLUSION_PASS_CAD_SAMPLES',reasons=failures,
                    generation_authorized=False,remaining=['exact geometric collision/connection checks','between-section and sub-grid features','native chronology'],print_go=False)
