"""Read-only lightweight 3MF adapter; sections reuse the existing V4 routine.

This is CAD screening, never a native slice. Source connected meshes are
sectioned separately to avoid parity cancellation between overlapping parts.
"""
import array
import argparse
import hashlib
import json
import zipfile
import shutil
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
from scipy import sparse, ndimage
from scipy.sparse.csgraph import connected_components
from lxml import etree
from ...stages.v4_d2 import _section_pixels
from ..recipe import candidate_recipe

CORE='http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
PROD='http://schemas.microsoft.com/3dmanufacturing/production/2015/06'

def sha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
    return h.hexdigest()

def write(p,x):
    Path(p).write_text(json.dumps(x,indent=2,default=lambda a:a.tolist() if hasattr(a,'tolist') else str(a)),encoding='utf-8')

def transform(text):
    a=np.asarray([float(x) for x in text.split()])
    if len(a)!=12:raise ValueError('TRANSFORM_NOT_12')
    return a[:9].reshape(3,3).T,a[9:]

def mesh(z,entry):
    v=array.array('d');f=array.array('I')
    with z.open(entry) as raw:
        for _,e in etree.iterparse(raw,events=('end',),tag=('{'+CORE+'}vertex','{'+CORE+'}triangle'),huge_tree=True):
            if e.tag.endswith('vertex'):v.extend(float(e.get(k)) for k in ('x','y','z'))
            else:f.extend(int(e.get(k)) for k in ('v1','v2','v3'))
            parent=e.getparent();e.clear()
            while e.getprevious() is not None:del parent[0]
    return np.frombuffer(v,dtype=np.float64).reshape(-1,3),np.frombuffer(f,dtype=np.uint32).reshape(-1,3)

def section(tri,z,origin,pitch,shape,z_bounds=None):
    lo,hi=z_bounds if z_bounds is not None else (tri[:,:,2].min(1),tri[:,:,2].max(1))
    cells=_section_pixels(tri,lo,hi,z,origin,pitch,np.asarray(shape[::-1]),np,compact=True,require_closed=True)
    if len(cells):
        yy,xx=np.divmod(cells,shape[1]);points=origin+(np.c_[xx,yy]+.5)*pitch
        lower=tri[:,:,:2].min((0,1));upper=tri[:,:,:2].max((0,1))
        if np.any(points<lower-pitch) or np.any(points>upper+pitch):
            raise ValueError(f'UNBOUNDED_SECTION_FILL at CAD Z={z}: open/invalid parity contour; source must not be repaired silently')
    return cells

def extract(source,expected,out,zmax,reuse_completed=None):
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    actual=sha(source)
    if actual!=expected:raise ValueError('SOURCE_SHA_MISMATCH')
    reuse_hashes={}
    if reuse_completed:
        lock=json.loads((Path(reuse_completed)/'PARTIAL_CACHE_IDENTITY.json').read_text(encoding='utf-8-sig'))
        if lock['source_sha256']!=actual:raise ValueError('CACHE_SOURCE_MISMATCH')
        if lock.get('bounded_sections_verified') is not True:raise ValueError('UNCERTIFIED_SECTION_CACHE')
        reuse_hashes={r['name']:r['sha256'] for r in lock['files']}
    recipe=candidate_recipe();pitch=recipe['geometry']['grid_xy'];dz=recipe['geometry']['grid_z']
    # The entire A1 XY frame is preserved; this is not a recentered mini layout.
    origin=np.array([0.,0.]);shape=(int(np.ceil(256/pitch)),)*2
    nz=int(np.ceil(zmax/dz))+3
    if reuse_completed:
        contract=dict(pitch_mm=pitch,dz_mm=dz,zmax_mm=zmax,shape=list(shape),nz=nz,origin_mm=origin.tolist())
        if lock.get('grid_contract')!=contract:raise ValueError('CACHE_GRID_OR_PHASE_MISMATCH')
    occ=np.lib.format.open_memmap(out/'occupancy.npy',mode='w+',dtype=bool,shape=(nz,*shape));occ[:]=False
    with zipfile.ZipFile(source) as z:
        root=ET.fromstring(z.read('3D/3dmodel.model'))
        if root.get('unit')!='millimeter':raise ValueError('SOURCE_UNIT')
        builds=root.findall('.//{'+CORE+'}build/{'+CORE+'}item')
        if len(builds)!=1:raise ValueError('AMBIGUOUS_BUILD')
        m,t=transform(builds[0].get('transform'))
        names={}
        settings=ET.fromstring(z.read('Metadata/model_settings.config'))
        for p in settings.findall('.//part'):
            names[p.get('id')]=next((x.get('value') for x in p.findall('metadata') if x.get('key')=='name'),'UNKNOWN')
        parts=[]
        for ordinal,c in enumerate(root.findall('.//{'+CORE+'}component')):
            sid=c.get('objectid');entry=c.get('{'+PROD+'}path').lstrip('/')
            old=Path(reuse_completed)/('part_'+sid+'.npz') if reuse_completed else None
            if old is not None and old.is_file():
                oldsha=sha(old);path=out/old.name;shutil.copyfile(old,path)
                if oldsha!=reuse_hashes.get(old.name):raise ValueError('CACHE_IDENTITY_MISMATCH')
                if sha(path)!=oldsha:raise ValueError('CACHE_COPY_SHA_MISMATCH')
                with np.load(path) as ar:data=ar['data']
                if len(data):
                    if data[:,1].min()<0 or data[:,1].max()>=nz or data[:,2].min()<0 or data[:,2].max()>=np.prod(shape):raise ValueError('CACHE_INDEX_RANGE')
                    occ.reshape(nz,-1)[data[:,1],data[:,2]]=True
                payload=z.read(entry)
                parts.append(dict(id=sid,name=names.get(sid,'UNKNOWN'),entry=entry,vertices=payload.count(b'<vertex '),faces=payload.count(b'<triangle '),
                    components=[],file=path.name,sha256=oldsha,reused_completed_cache=str(old),component_metadata='not retained from interrupted extraction; section identity retained'))
                del payload
                write(out/'PROGRESS.json',dict(parts_done=ordinal+1,parts_total=53))
                print('REUSED',ordinal+1,sid,len(data),flush=True);continue
            a,b=transform(c.get('transform'));v,f=mesh(z,entry);v=(v@a.T+b)@m.T+t
            if (v[:,:2]<0).any() or (v[:,:2]>=256).any():raise ValueError('SOURCE_OUTSIDE_FRAME')
            edges=np.concatenate([f[:,[0,1]],f[:,[1,2]]]);adj=sparse.coo_matrix((np.ones(len(edges),np.uint8),(edges[:,0],edges[:,1])),shape=(len(v),len(v))).tocsr()
            _,labels=connected_components(adj,directed=False);flabel=labels[f[:,0]]
            order=np.argsort(flabel,kind='stable');groups=np.split(order,np.flatnonzero(np.diff(flabel[order]))+1)
            del adj,edges,labels
            chunks=[];meta=[]
            for indices in groups:
                tri=v[f[indices]];lo=tri[:,:,2].min();hi=tri[:,:,2].max()
                if lo>zmax+2*dz:continue
                gid=int(flabel[indices[0]]);start=max(0,int(np.floor(lo/dz)));end=min(nz,int(np.ceil(hi/dz)))
                bounds=(tri[:,:,2].min(1),tri[:,:,2].max(1))
                n=0
                for iz in range(start,end):
                    cells=section(tri,(iz+.5)*dz,origin,pitch,shape,bounds)
                    if len(cells):
                        occ[iz].ravel()[cells]=True
                        chunks.append(np.c_[np.full(len(cells),gid),np.full(len(cells),iz),cells].astype(np.int32));n+=len(cells)
                meta.append({'component':gid,'bbox_mm':[tri.min((0,1)),tri.max((0,1))],'section_cells':n})
            data=np.concatenate(chunks) if chunks else np.empty((0,3),np.int32)
            path=out/('part_'+sid+'.npz');np.savez_compressed(path,data=data)
            parts.append(dict(id=sid,name=names.get(sid,'UNKNOWN'),entry=entry,vertices=len(v),faces=len(f),components=meta,file=path.name,sha256=sha(path)))
            write(out/'PROGRESS.json',dict(parts_done=ordinal+1,parts_total=53))
            print('SECTIONS',ordinal+1,sid,len(groups),len(data),flush=True)
        occ.flush()
    after=sha(source)
    if after!=actual:raise ValueError('SOURCE_CHANGED')
    write(out/'SOURCE.json',dict(path=str(source),sha256=actual,after_sha256=after,parts=parts,origin_mm=origin,shape=shape,nz=nz,pitch_mm=pitch,dz_mm=dz,zmax_mm=zmax,recipe=recipe,frame='saved A1 world XY; CAD Z before raft',machine_z='UNBOUND',evidence='CAD_RASTER_PROXY_NOT_NATIVE',bounded_sections_verified=True))

def rooted_volume(occ):
    """Existing V2 connected-section propagation; order within a layer UNKNOWN.

    No floating component seeds later components. This CAD proxy can credit
    lateral continuity; native extrusion chronology is explicitly unverified.
    """
    rooted=np.zeros_like(occ);rooted[0]=occ[0]
    for iz in range(1,len(occ)):
        lab,n=ndimage.label(occ[iz],np.ones((3,3)))
        good=np.zeros(n+1,bool);good[np.unique(lab[rooted[iz-1]])]=True;good[0]=False
        rooted[iz]=good[lab]
    return rooted

def demands(cache,rooted):
    cache=Path(cache);s=json.loads((cache/'SOURCE.json').read_text());shape=tuple(s['shape']);dz=s['dz_mm'];events=[];footprints=[]
    for part in s['parts']:
        with np.load(cache/part['file']) as a:data=a['data']
        if not len(data):continue
        boundaries=np.r_[0,np.flatnonzero(np.any(np.diff(data[:,:2],axis=0),axis=1))+1,len(data)]
        previous={}
        for start,end in zip(boundaries[:-1],boundaries[1:]):
            gid,iz=map(int,data[start,:2]);cells=data[start:end,2]
            if iz==0 or (iz+.5)*dz>s['zmax_mm']:previous[gid]=cells;continue
            if rooted[iz-1].ravel()[cells].all():previous[gid]=cells;continue
            # Split every section, including petals born above the mesh minimum.
            yy,xx=np.divmod(cells,shape[1]);y0,x0=yy.min(),xx.min();mask=np.zeros((yy.max()-y0+1,xx.max()-x0+1),bool);mask[yy-y0,xx-x0]=True
            lab,n=ndimage.label(mask)
            for label,slc in enumerate(ndimage.find_objects(lab),1):
                cy,cx=np.where(lab[slc]==label);cc=(cy+slc[0].start+y0)*shape[1]+cx+slc[1].start+x0
                cov=float(rooted[iz-1].ravel()[cc].mean())
                if cov>=1:continue
                inherited=np.intersect1d(cc,previous.get(gid,[])).size>0
                eid=f'P{part["id"]}_M{gid}_Z{iz}_C{label}'
                events.append(dict(id=eid,part=part['id'],part_name=part['name'],mesh_component=gid,section=iz,cad_z_mm=(iz+.5)*dz,cell_count=len(cc),coverage=cov,category='PARTIAL_OR_LOST_SUPPORT' if inherited else 'INDEPENDENT_BIRTH',footprint_index=len(footprints),native_verified=False))
                footprints.append(cc)
            previous[gid]=cells
        print('DEMANDS_PART',part['id'],len(events),flush=True)
    return events,footprints

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--sha',required=True);p.add_argument('--out',required=True);p.add_argument('--zmax',type=float,default=50)
    p.add_argument('--reuse-completed')
    a=p.parse_args();extract(a.source,a.sha,a.out,a.zmax,a.reuse_completed)
