"""MINIL geometry, section occupancy and source-derived contact demand adapter."""
from functools import lru_cache
from .adapter import read, write, require
from ..stages.v4_d2 import _section_pixels

class Body:
    def __init__(self,c):
        self.c=c; self.np=c['np']; self.k=c['kernel']; np=self.np
        tr=np.array(read(c['paths']['frame'])['after_transform'])
        self.r=tr[:9].reshape(3,3).T; self.t=tr[9:]
        self.shift=np.array(c['case']['source_to_original_native_translation_mm'])
        self.rows=c['frows']+c['mrows']+c['orows']; self.ids=[r['id'] for r in self.rows]
        self.boxes=np.array([r['bbox_plate_mm'] for r in self.rows]); self.index={s:i for i,s in enumerate(self.ids)}
    def plate(self,v):
        return (self.np.asarray(v,float)+self.shift).astype(self.np.float32).astype(float)@self.r.T+self.t
    def mesh(self,i):
        c=self.c; np=self.np; row=self.rows[i]
        if row['role']=='FLOWER':
            p=c['p']; d=c['d6']
            return self.plate(d['vertices']@(p['rotation_matrix'][i]*p['physical_scale'][i]).T+p['position_mm'][i]),d['faces']
        if row['role']=='PERMANENT':
            a,b=row['mesh_vertex_range']; x,y=row['mesh_face_range']; m=c['members']
            return self.plate(m['vertices'][a:b]),m['faces'][x:y].astype(np.int64)-a
        a,b=row['vertex_range']; x,y=row['face_range']; m=c['overlay']
        return m['vertices'][a:b].astype(float),m['faces'][x:y].astype(np.int64)-a
    @lru_cache(128)
    def solid(self,i):
        return self.k.man(*self.mesh(i))
    def hits(self,s,threshold,first=False,capsule=None):
        np=self.np; v=s.to_mesh().vert_properties[:,:3]
        if not len(v): return []
        near=np.flatnonzero(np.all(self.boxes[:,0]<=v.max(0),1)&np.all(self.boxes[:,1]>=v.min(0),1))
        if capsule is not None and len(near):
            a,b,r=capsule; a=np.array(a); b=np.array(b); delta=b-a
            boxes=self.boxes[near]; centers=boxes.mean(1); radii=np.linalg.norm(boxes[:,1]-boxes[:,0],axis=1)/2
            t=np.clip(((centers-a)@delta)/max(float(delta@delta),1e-30),0,1)
            distance=np.linalg.norm(centers-(a+t[:,None]*delta),axis=1)
            # Bounding spheres enclose every BODY vertex; this can reject only
            # geometrically disjoint capsule/body pairs, never intersections.
            near=near[distance<=radii+r+1e-6]
        result=[]
        for i in near:
            q=s^self.solid(int(i)); require(q.status()==self.k.md.Error.NoError,'COLLISION_BOOLEAN_INVALID')
            volume=float(q.volume())
            if volume>threshold:
                result.append({'id':self.ids[i],'volume_mm3':volume})
                if first: break
        return result

def derive_sections(c,body,recipe):
    """Geometric Z sections, explicitly not printer layer chronology."""
    from scipy import ndimage as ndi
    np=c['np']; out=c['out']; pitch=recipe['geometry']['grid_xy']; dz=recipe['geometry']['grid_z']
    lo=body.boxes[:,0].min(0); hi=body.boxes[:,1].max(0)
    origin=np.r_[lo[:2]-2*pitch,0.]; shape=np.ceil((hi[:2]-origin[:2]+2*pitch)/pitch).astype(int)
    nz=int(np.ceil(hi[2]/dz))+1
    occ=np.lib.format.open_memmap(out/'BODY_OCCUPANCY.npy',mode='w+',dtype=bool,shape=(nz,int(shape[1]),int(shape[0])))
    births=[]
    for i,row in enumerate(body.rows):
        v,f=body.mesh(i); tri=v[f]; zmin=tri[:,:,2].min(1); zmax=tri[:,:,2].max(1)
        start=max(0,int(np.floor(v[:,2].min()/dz))); end=min(nz,int(np.ceil(v[:,2].max()/dz)))
        first=None; count=0
        for iz in range(start,end):
            pixels=_section_pixels(tri,zmin,zmax,(iz+.5)*dz,origin[:2],pitch,shape,np)
            if len(pixels):
                occ[iz].reshape(-1)[pixels]=True; count+=len(pixels)
                if first is None: first=iz
        births.append({'id':row['id'],'geometry_first_section':first,'first_section_z_mm':None if first is None else (first+.5)*dz,'occupied_voxels':count})
        if i%250==0: print('MINIL_SECTIONS',i,len(body.rows),flush=True)
    occ.flush()
    rooted=np.lib.format.open_memmap(out/'BODY_ROOTED.npy',mode='w+',dtype=bool,shape=occ.shape)
    for iz in range(nz):
        labels,_=ndi.label(occ[iz],structure=np.ones((3,3)))
        seeds=occ[iz] if iz==0 else rooted[iz-1]&occ[iz]
        labels_ok=np.unique(labels[seeds]); labels_ok=labels_ok[labels_ok!=0]
        rooted[iz]=np.isin(labels,labels_ok)
    rooted.flush()
    meta={'origin_mm':origin.tolist(),'pitch_mm':[pitch,pitch,dz],'shape_zyx':list(occ.shape),
          'method':'Source _section_pixels scan conversion; 8-connected same-section regions propagated only from prior BODY section.',
          'new_support_credit':False,'printer_layer_chronology':False,'limitations':['Raster sampling can miss subvoxel connections','No extrusion order or physical strength proof']}
    write(out/'GRID.json',meta); write(out/'BODY_BIRTHS.json',births)
    return occ,rooted,meta

def query(points,volume,meta,np):
    ix=np.floor((np.atleast_2d(points)-meta['origin_mm'])/meta['pitch_mm']).astype(int)
    ok=np.all((ix>=0)&(ix<np.array(volume.shape[::-1])),1); r=np.zeros(len(ix),bool); q=ix[ok]
    r[ok]=volume[q[:,2],q[:,1],q[:,0]]
    return r

def demands_anchors(c,body,rooted,meta,recipe):
    np=c['np']; s=recipe['scale']; demands=[]; anchors=[]
    # Load correspondence is re-derived from actual MINIL IDs, never old selected Support.
    members={m['id']:m for m in c['st']['members']}; loads={k:set() for k in members}
    for m in members.values():
        targets={m.get('target_id'),m.get('representative_flower_id')}&set(c['flower_ids'])
        seen=set(); current=m['id']
        while current in members and current not in seen:
            seen.add(current); loads[current].update(targets); current=members[current].get('parent_id')
    for row in c['orows']:
        current=row['root_member']; seen=set()
        while current in members and current not in seen:
            seen.add(current); loads[current].update(row['target_flower_ids']); current=members[current].get('parent_id')
    for i,row in enumerate(body.rows):
        v,f=body.mesh(i); flower=row['role']=='FLOWER'; tri=v[f[::32] if flower else f]
        cp=tri.mean(1); normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]); mag=np.linalg.norm(normals,axis=1)
        good=mag>1e-12; cp=cp[good]; normals=normals[good]/mag[good,None]
        if not flower:
            up=np.flatnonzero(normals[:,2]>.1)
            # Actual surface instead of source's hardcoded main3mm radial proxy.
            up=up[::max(1,len(up)//120)]
            for j in up:
                p=cp[j]; n=normals[j]; probe=p-n*(.65*s); probe[2]-=.35*s
                if p[2]>s and query([probe],rooted,meta,np)[0]:
                    anchors.append({'owner':row['id'],'point_mm':p.tolist(),'normal':n.tolist(),'rooted_probe_mm':probe.tolist()})
        down=normals[:,2]<(-.18 if flower else -.2); cp=cp[down]; normals=normals[down]
        eligible=True
        if not flower and row['role']=='PERMANENT':
            m=members[row['id']]; pts=np.array(row['points_plate_mm']); length=np.linalg.norm(np.diff(pts,axis=0),axis=1).sum()
            eligible=length>18*s or len(loads[row['id']])>=32 or m.get('terminal_diameter_mm',0)<1.2*s
        if not eligible: continue
        chosen=[]
        for j in range(min(12 if flower else 3,len(cp))):
            if not j: ix=int(cp[:,2].argmin())
            else:
                sep=np.linalg.norm(cp[:,None,:]-cp[chosen][None,:,:],axis=2).min(1)
                score=sep-.06*(cp[:,2]-cp[:,2].min()); score[chosen]=-1; ix=int(score.argmax())
            chosen.append(ix)
        demands.append({'id':'MINIL_DEMAND_'+row['id'],'target':row['id'],'role':row['role'],
                        'wanted_contacts':3 if flower and row['physical_scale_already_applied']>=.5*s else 2,
                        'z_mm':float(body.boxes[i].mean(0)[2]),'candidates':[{'point_mm':cp[j].tolist(),'normal':normals[j].tolist()} for j in chosen],
                        'downstream_flower_ids':sorted(loads.get(row['id'],set()))})
    write(c['out']/'DEMANDS.json',demands); write(c['out']/'BODY_ANCHORS.json',anchors)
    write(c['out']/'BODY_LOAD_CORRESPONDENCE.json',{'members':{k:sorted(v) for k,v in loads.items()},'basis':'source parent graph plus actual B115 root/target ledger; not physical load magnitudes'})
    return demands,anchors
