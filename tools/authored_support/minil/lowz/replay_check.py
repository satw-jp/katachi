"""Two-process generator regression; output is explicitly SYNTHETIC_FIXTURE."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
import numpy as np
from .light import sha,write
from ..recipe import candidate_recipe
from .section_reader import identity as reader_identity

def run(out,runtime):
    out=Path(out);out.mkdir(parents=True,exist_ok=False);cache=out/'fixture';cache.mkdir()
    source=cache/'source.txt';source.write_text('SYNTHETIC_FIXTURE: later independent component, no earlier receiver',encoding='utf-8')
    data=np.array([[0,i,32*64+32] for i in range(35,40)],np.int32)
    np.savez_compressed(cache/'part.npz',data=data)
    occ=np.zeros((45,64,64),bool);occ[35:40,32,32]=True;np.save(cache/'occupancy.npy',occ)
    write(cache/'SECTION_VALIDATION.json',dict(evidence='SYNTHETIC_FIXTURE_NOT_SOURCE_SECTION_AUDIT'))
    write(cache/'UNKNOWN_SECTIONS.json',dict(sections=[]))
    r=candidate_recipe();write(cache/'SOURCE.json',dict(path=str(source),sha256=sha(source),recipe=r,
        evidence='SYNTHETIC_FIXTURE',parts=[dict(id='fixture',name='fixture',file='part.npz',sha256=sha(cache/'part.npz'))],
        shape=[64,64],nz=45,origin_mm=[0,0],pitch_mm=r['geometry']['grid_xy'],dz_mm=r['geometry']['grid_z'],zmax_mm=6.,bounded_sections_verified=True,
        section_reader=reader_identity(),unknown_sections=0,validation_sha256=sha(cache/'SECTION_VALIDATION.json'),unknown_sha256=sha(cache/'UNKNOWN_SECTIONS.json'),occupancy_sha256=sha(cache/'occupancy.npy')))
    results=[]
    for index in (1,2):
        dest=out/f'run_{index}'
        p=subprocess.run([sys.executable,'-m','tools.authored_support.minil.lowz.reuse','--cache',str(cache),'--out',str(dest),'--runtime',runtime],capture_output=True,text=True)
        (out/f'process_{index}.log').write_text(p.stdout+p.stderr,encoding='utf-8')
        if p.returncode:raise RuntimeError(f'process {index} failed; see log')
        candidate=json.loads((dest/'CANDIDATE.json').read_text())
        results.append(candidate)
    a,b=results
    assert len(a['additions'])>0
    assert len(a['additions'])==len(b['additions'])
    for x,y in zip(a['additions'],b['additions']):assert x['geometry_identity']==y['geometry_identity']
    stats=[json.loads((out/f'run_{i}'/'COMPARISON.json').read_text()) for i in (1,2)]
    assert stats[0]==stats[1]
    assert stats[0]['resolved_original_events']>0 and stats[0]['source_sha_unchanged']
    write(out/'REPLAY_RESULT.json',dict(status='PASS',processes=2,synthetic_only=True,meshes=len(a['additions']),comparison=stats[0]))
    print('TWO_PROCESS_REPLAY_PASS',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--runtime',required=True);a=p.parse_args();run(a.out,a.runtime)
