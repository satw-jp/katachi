import json,struct,math,hashlib
from pathlib import Path
root=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_A_F2_PRINT_PREPARATION\\A')
mp=json.loads((root/'data/ARTWORK_PERMANENT_ID_MAP.json').read_text())
idx=[37815935,40363433,40429090,40690246,40690247,40690248]
res=[]
for i in idx:
 r=next(x for x in mp if x['first_triangle']<=i<x['first_triangle']+x['triangles'])
 res.append({'triangle':i,'member_id':r['id'],'range':[r['first_triangle'],r['first_triangle']+r['triangles']]})
stl=root/'export/ARTWORK_PERMANENT.stl'
with stl.open('rb') as f:
 for x in res:
  i=x['triangle'];f.seek(84+i*50+12);v=struct.unpack('<9f',f.read(36));a=[v[0:3],v[3:6],v[6:9]]
  u=[a[1][j]-a[0][j] for j in range(3)];w=[a[2][j]-a[0][j] for j in range(3)]
  c=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]
  x['area_mm2']=math.sqrt(sum(q*q for q in c))/2
  x['source_coords_mm']=a
print(json.dumps(res,indent=2))
