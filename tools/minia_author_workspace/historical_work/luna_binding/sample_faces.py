from pathlib import Path
import zipfile, struct, json, time, xml.etree.ElementTree as ET
root=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION')
stl=root/'A/export/ARTWORK_PERMANENT.stl'; mf=root/'A/cli/import_validated/A_A1_EDITABLE.3mf'
with stl.open('rb') as f:
 header=f.read(84); n=struct.unpack('<I',header[80:84])[0]; faces=[]
 for _ in range(8):
  rec=f.read(50); faces.append([list(struct.unpack('<3f',rec[j:j+12])) for j in (0,12,24)])
print('STL',n,faces[:3],flush=True)
ns={'m':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
verts=[]; tris=[]; t=time.time()
with zipfile.ZipFile(mf) as z:
 with z.open('3D/Objects/object_1.model') as s:
  for ev,e in ET.iterparse(s,events=('end',)):
   tag=e.tag.rsplit('}',1)[-1]
   if tag=='vertex' and len(verts)<64:
    verts.append([float(e.attrib[k]) for k in ('x','y','z')])
   elif tag=='triangle':
    if len(tris)<8: tris.append([int(e.attrib[k]) for k in ('v1','v2','v3')])
    if len(tris)>=8: break
   e.clear()
print('NATIVE read_s',time.time()-t,'first_vertices',verts[:4],'first_faces',tris,flush=True)
# Native STL source coordinates are expected to equal native mesh vertices + component translation.
offset=[127.541795731,129.905210495,105.851430301]
comp=[]
for fi,inds in enumerate(tris):
 native=[[verts[i][j]+offset[j] for j in range(3)] for i in inds]
 source=faces[fi]
 # Compare each face with any of 6 vertex permutations, for order/orientation stability.
 import itertools
 best=min(max(abs(native[k][axis]-source[perm[k]][axis]) for k in range(3) for axis in range(3)) for perm in itertools.permutations(range(3)))
 comp.append({'face':fi,'indices':inds,'max_abs_error_mm':best,'native_order_equal':all(max(abs(native[k][a]-source[k][a]) for a in range(3))<1e-5 for k in range(3))})
print('COMPARE',json.dumps(comp),flush=True)
