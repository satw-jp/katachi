"""One actual mm STL assembly: flowers + Permanent internal, no Host or repair."""
import struct
import numpy as np
from engine import read, sha
from metadata import validate_mesh
from surface.replay import load_mesh, quaternion_to_matrix_wxyz

def parts(project, result):
    v,f=load_mesh(project/'assets/data/D6_local.npz')
    surface=read(project/result['layout']/'surface/surface.json')
    for instance in surface['instances']:
        transformed=(v*instance['physical_scale']) @ quaternion_to_matrix_wxyz(instance['rotation_quaternion_wxyz']).T + instance['position_mm']
        yield instance['instance_id'],transformed,f
    with np.load(project/result['mesh'],allow_pickle=False) as a:
        yield 'Permanent_internal',a['vertices'],a['faces']

def bounds(project,result):
    low=np.full(3,np.inf);high=-low;triangles=0
    for _,v,f in parts(project,result):
        low=np.minimum(low,v.min(axis=0));high=np.maximum(high,v.max(axis=0));triangles+=len(f)
    return dict(min=low.tolist(),max=high.tolist(),triangles=triangles)

def export(project,result,path,translation,cancel):
    validate_mesh(read(project/result['structure']),project/result['mesh'])
    total=bounds(project,result)['triangles'];low=np.full(3,np.inf);high=-low;records=[]
    dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
    with path.open('xb') as out:
        out.write(b'SKIN R1 flowers + Permanent internal; no Host'.ljust(80,b' '));out.write(struct.pack('<I',total))
        offset=0
        for name,v,f in parts(project,result):
            if cancel.is_set():raise ValueError('Cancelled during input preparation')
            vv=np.asarray(v+translation,dtype=np.float32)
            low=np.minimum(low,vv.min(axis=0));high=np.maximum(high,vv.max(axis=0))
            for start in range(0,len(f),100000):
                chunk=np.zeros(min(100000,len(f)-start),dtype=dtype);chunk['vertices']=vv[f[start:start+100000]];out.write(chunk.tobytes())
            records.append(dict(id=name,triangleRange=[offset,offset+len(f)]));offset+=len(f)
    return dict(path=path.name,sha256=sha(path),bytes=path.stat().st_size,bounds=dict(min=low.tolist(),max=high.tolist()),triangles=total,parts=records,units='mm',translation=translation,hostIncluded=False,repair=False)
