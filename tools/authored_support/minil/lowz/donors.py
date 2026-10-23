"""Existing V2 external-shaft route, reusing frozen plate-rooted shafts."""
from functools import lru_cache
from pathlib import Path
import numpy as np
from .legacy_graph import load
from ..construction import contact_parts
from .light import sha

class Donors:
    def __init__(self,spec_path,k,source,section_fn):
        self.spec,rows,_=load(spec_path);self.k=k;self.s=source;self.section_fn=section_fn
        self.rows=[r for r in rows if r['kind'] in ('LOWER_DIRECT','EXTERIOR_COLUMN') and r.get('foot')]
        self.root=Path(self.spec['support_ledger']['path']).parent
        self.shift=np.r_[self.spec['common_xy_mm'],0.]
        self.points=np.array([r['points_mm'][0] for r in self.rows])+self.shift

    @lru_cache(32)
    def geometry(self,index):
        row=self.rows[index];p=self.root/row['mesh'];identity=self.k.mesh_array_identity(p)
        if identity!=row['mesh_identity']:raise ValueError('FROZEN_DONOR_ARRAY_SHA_MISMATCH')
        with np.load(p) as a:solid=self.k.man(a['vertices'].astype(float)+self.shift,a['faces'])
        return solid,self.section_fn(solid,self.s),sha(p)

    def try_route(self,p,n,g,occ,extra,healthy,section,trace):
        s=self.s;scale=s['recipe']['scale'];end=p+n*g['neck_offset']
        distances=np.linalg.norm(self.points[:,:2]-end[:2],axis=1)
        # Bounded subset of the original 64-neighbour search, no named IDs.
        for j in np.argsort(distances,kind='stable')[:8]:
            row=self.rows[int(j)];distance=float(distances[j])
            if distance>g['external_search']:continue
            a=np.r_[self.points[j,:2],end[2]-max(g['branch_min_drop'],distance*1.5)]
            if a[2]<2*scale or float(row['points_mm'][1][2])<a[2]+.6*scale:
                trace.append(dict(donor=row['id'],reason='DONOR_HEIGHT_OR_RISING_ROUTE_NOT_AVAILABLE'));continue
            iz=int(a[2]/s['dz_mm'])-1;xy=np.floor((a[:2]-s['origin_mm'])/s['pitch_mm']).astype(int)
            if iz<0 or not healthy[iz,xy[1],xy[0]]:
                trace.append(dict(donor=row['id'],reason='DONOR_NOT_PRECEDING_ROOTED'));continue
            main,neck,end,tip=contact_parts(self.k,np,p,n,a,g);mainsec=section(main,s)
            donor,donorsec,donorsha=self.geometry(int(j));bad=0
            for layer,cells in mainsec.items():
                hits=cells[occ[layer].ravel()[cells]]
                bad+=np.setdiff1d(hits,donorsec.get(layer,np.empty(0,int))).size
                bad+=int(extra[layer].ravel()[cells].sum())
            if bad:
                trace.append(dict(donor=row['id'],reason='NON_DONOR_MAIN_INTERSECTION',cells=int(bad)));continue
            intersection=main^donor
            if intersection.status()!=self.k.md.Error.NoError or intersection.volume()<=s['recipe']['numeric']['intersection_volume_mm3']:
                trace.append(dict(donor=row['id'],reason='NO_EXACT_DONOR_CONTACT'));continue
            solid=self.k.union([main,neck]);sections=section(solid,s);previous=None;valid=True
            for layer,cells in sorted(sections.items()):
                on_old=layer>0 and healthy[layer-1].ravel()[cells].any()
                on_new=previous is not None and np.intersect1d(cells,previous).size>0
                if not (on_old or on_new):valid=False;break
                previous=cells
            if not valid:
                trace.append(dict(donor=row['id'],reason='NEW_BRANCH_SECTION_GAP'));continue
            return dict(solid=solid,sections=sections,start=a,end=end,tip=tip,donor=row['id'],donor_sha256=donorsha,
                donor_contact_volume_mm3=float(intersection.volume()),donor_connection_z_mm=float(a[2]))
        return None
