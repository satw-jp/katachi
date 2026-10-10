from pathlib import Path
import zipfile,struct,json,time,itertools
from lxml import etree
root=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION')
stl=root/'A/export/ARTWORK_PERMANENT.stl';mf=root/'A/cli/import_validated/A_A1_EDITABLE.3mf'
with stl.open('rb') as f:
 f.seek(84); faces=[]
 for _ in range(8):
  rec=f.read(50);faces.append([list(struct.unpack('<3f',rec[j:j+12])) for j in (12,24,36)])
verts=[];tris=[];t=time.time()
with zipfile.ZipFile(mf) as z, z.open('3D/Objects/object_1.model') as s:
 context=etree.iterparse(s,events=('end',),huge_tree=True)
 for _,e in context:
  tag=etree.QName(e).localname
  if tag=='vertex' and len(verts)<64:verts.append([float(e.get(k)) for k in ('x','y','z')])
  elif tag=='triangle':
   if len(tris)<8:tris.append([int(e.get(k)) for k in ('v1','v2','v3')])
   if len(tris)>=8:break
  e.clear()
  parent=e.getparent()
  if parent is not None:
   while e.getprevious() is not None:del parent[0]
offset=[127.541795731,129.905210495,105.851430301];out=[]
for i,inds in enumerate(tris):
 n=[[verts[k][a]+offset[a] for a in range(3)] for k in inds];q=faces[i]
 err=max(abs(n[k][a]-q[k][a]) for k in range(3) for a in range(3))
 best=min(max(abs(n[k][a]-q[p[k]][a]) for k in range(3) for a in range(3)) for p in itertools.permutations(range(3)))
 out.append({'face':i,'native_indices':inds,'ordered_max_error_mm':err,'permutation_max_error_mm':best})
print(json.dumps({'native_read_s':time.time()-t,'source_faces':faces,'native_first_vertices':verts[:3],'native_faces':tris,'comparisons':out},indent=2))
