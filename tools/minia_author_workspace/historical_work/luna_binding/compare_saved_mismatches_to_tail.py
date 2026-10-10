import json,numpy as np
from pathlib import Path
j=Path('work/luna_binding/NATIVE_SUFFIX_CROSSWALK.json')
d=json.loads(j.read_text())
p=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_A_F2_PRINT_PREPARATION\\A\\export\\ARTWORK_PERMANENT.stl')
dt=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
s=np.memmap(p,dtype=dt,mode='r',offset=84,shape=(40690249,))
for mm in d['suffix_mismatches']:
 a=np.asarray(mm['native_xyz_world_mm'])
 matches=[]
 for si in [40690246,40690247,40690248]:
  b=np.asarray(s['vertices'][si],dtype=np.float64)
  dist=np.max(np.abs(a[:,None,:]-b[None,:,:]),axis=2)
  err=max(min(row) for row in dist)
  if err<=1e-5: matches.append({'source_face':si,'max_vertex_error_mm':float(err)})
 mm['candidate_tail_matches']=matches
print(json.dumps({'suffix_mismatches_with_tail_candidates':d['suffix_mismatches']},indent=2))
j.write_text(json.dumps(d,indent=2))
