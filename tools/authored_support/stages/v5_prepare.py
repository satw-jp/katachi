"""Regenerate the V5 BODY occupancy from frozen geometry, never saved caches."""
from pathlib import Path
import json
from .v4_d2 import _section_pixels


def generate_occupancy(v3_root, template_path, output_dir, *, np, structure_override=None):
    output_dir=Path(output_dir)
    output_dir.mkdir(parents=True,exist_ok=False)
    read=lambda name:json.loads((v3_root/'data'/name).read_text(encoding='utf-8-sig'))
    summary=read('large_layer_summary.json');structure=structure_override if structure_override is not None else read('structure.json')
    surface=read('surface.json')['surface'];births=read('large_object_births.json')
    fm={r['id']:r for r in surface};mm={r['id']:r for r in structure['members']}
    with np.load(template_path) as q:uv=q['vertices'].copy();uf=q['faces'].copy()
    lower=np.array(summary['bounds_mm'][0]);upper=np.array(summary['bounds_mm'][1])
    origin=lower[:2]-.6;shape=np.ceil((upper[:2]-origin+.6)/.3).astype(int)
    bed=float(structure['bed_z_mm']);layers=int(summary['layers'])
    path=output_dir/'body_occupancy.npy'
    occ=np.lib.format.open_memmap(path,mode='w+',dtype=bool,shape=(layers,*map(int,shape[::-1])));occ[:]=False
    for index,birth in enumerate(births):
        id=birth['id']
        if id in fm:
            r=fm[id];v=uv*float(r['scale'])@np.array(r['rotation']).T+np.array(r['origin_mm']);f=uf
        else:
            member_path=Path(mm[id]['mesh_source']) if structure_override is not None else v3_root/'data/members'/f'{id}.npz'
            with np.load(member_path) as q:v=q['vertices'].copy();f=q['faces'].copy()
        tri=v[f];zmin=tri[:,:,2].min(1);zmax=tri[:,:,2].max(1)
        first=max(0,int(np.ceil((v[:,2].min()-bed)/.2-.5)))
        last=min(layers-1,int(np.floor((v[:,2].max()-bed)/.2-.5)))
        for k in range(first,last+1):
            pixels=_section_pixels(tri,zmin,zmax,bed+(k+.5)*.2,origin,.3,shape,np)
            occ[k].ravel()[pixels]=True
        if index%1000==0:print('V5_OCCUPANCY',index,len(births),flush=True)
    occ.flush()
    return dict(origin_xy=origin.tolist(),pitch_xy=.3,pitch_z=.2,bed_z=bed,shape=list(occ.shape),path=str(path),method='Fresh frozen V3 geometry sections; no saved occupancy input')
