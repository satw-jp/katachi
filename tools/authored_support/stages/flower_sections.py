"""Rebuild only the frozen flower sections actually consumed by V7 outer routing."""
import hashlib,json
from pathlib import Path
from .v4_d2 import _section_pixels

def generate(v3, v2, out, *, np):
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    selected={r['id'] for r in read(v2/'data/surface.json')['surface'] if r['physical_scale']>=.55 and r['position_mm'][2]>=65}
    surface=read(v3/'data/surface.json')['surface'];s=read(v3/'data/large_layer_summary.json');st=read(v3/'data/structure.json')
    low=np.array(s['bounds_mm'][0]);high=np.array(s['bounds_mm'][1]);origin=low[:2]-.6;shape=np.ceil((high[:2]-origin+.6)/.3).astype(int);bed=st['bed_z_mm'];layers=s['layers']
    fingerprint=hashlib.sha256((v3/'data/surface.json').read_bytes()+(v3/'data/structure.json').read_bytes()).hexdigest()
    with np.load(v2/'data/D6_local.npz') as q:uv=q['vertices'].copy();f=q['faces'].copy()
    for r in surface:
        if r['id'] not in selected:continue
        v=uv*float(r['scale'])@np.array(r['rotation']).T+np.array(r['origin_mm']);tri=v[f];zmin=tri[:,:,2].min(1);zmax=tri[:,:,2].max(1)
        first=max(0,int(np.ceil((v[:,2].min()-bed)/.2-.5)));last=min(layers-1,int(np.floor((v[:,2].max()-bed)/.2-.5)));sections=[]
        for k in range(first,last+1):
            pix=_section_pixels(tri,zmin,zmax,bed+(k+.5)*.2,origin,.3,shape,np)
            if len(pix):sections.append((k,pix))
        lengths=[len(p) for _,p in sections]
        np.savez_compressed(out/f'{r["id"]}.npz',fingerprint=fingerprint,layers=np.array([k for k,_ in sections]),offsets=np.r_[0,np.cumsum(lengths)],pixels=np.concatenate([p for _,p in sections]) if sections else np.empty(0,np.int32))
    return sorted(selected)
