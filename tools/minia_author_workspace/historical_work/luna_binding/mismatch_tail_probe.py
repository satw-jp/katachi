from pathlib import Path
import zipfile,struct,json,re,time
T=37815935;N=40690246;M=40690249;TOL=1e-5
native=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\cli\import_validated\A_A1_EDITABLE.3mf')
stl=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\export\ARTWORK_PERMANENT.stl')
targets=set(range(T-4,T+5))|set(range(N-12,N))
found={};tail=[];t0=time.time();decoded=0
with zipfile.ZipFile(native) as z, z.open('3D/Objects/object_1.model') as f:
 carry=b'';count=0
 while True:
  block=f.read(8*1024*1024)
  if not block:break
  decoded+=len(block);data=carry+block;pos=0
  while True:
   i=data.find(b'<triangle ',pos)
   if i<0:carry=data[-16:];break
   end=data.find(b'/>',i)
   if end<0:carry=data[i:];break
   match=re.match(rb'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"',data[i:end+2])
   if not match:raise RuntimeError('triangle tag syntax changed')
   inds=tuple(map(int,match.groups()))
   if count in targets:found[count]=inds
   tail.append((count,inds));tail=tail[-12:]
   count+=1;pos=end+2
  if decoded%(512*1024*1024)<len(block):print('pass1 decoded_GiB',round(decoded/1024**3,2),'faces_seen',count,flush=True)
print('pass1_complete',count,'targets_found',len(found),'tail_range',[x[0] for x in tail],flush=True)
refids=sorted({i for tr in list(found.values())+[x[1] for x in tail] for i in tr})
needed=set(refids);coords={};idx=0;decoded=0
vertex_re=re.compile(rb'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"')
with zipfile.ZipFile(native) as z,z.open('3D/Objects/object_1.model') as f:
 carry=b''
 while True:
  block=f.read(8*1024*1024)
  if not block:break
  decoded+=len(block);data=carry+block;pos=0
  while True:
   i=data.find(b'<vertex ',pos)
   if i<0:carry=data[-16:];break
   end=data.find(b'/>',i)
   if end<0:carry=data[i:];break
   if idx in needed:
    m=vertex_re.match(data[i:end+2])
    if not m:raise RuntimeError('vertex tag syntax changed')
    coords[idx]=tuple(float(x) for x in m.groups())
   idx+=1;pos=end+2
  if decoded%(512*1024*1024)<len(block):print('pass2 decoded_GiB',round(decoded/1024**3,2),'vertices_seen',idx,flush=True)
print('pass2_complete',idx,'needed_vertices_found',len(coords),'needed_vertices',len(needed),flush=True)
source_records={}
dtype=struct.Struct('<12fH')
with stl.open('rb') as f:
 for face in sorted(targets):
  if face<0 or face>=M:continue
  f.seek(84+face*50);raw=f.read(50);v=struct.unpack('<12fH',raw);source_records[face]=(v[3:6],v[6:9],v[9:12])
offset=(127.541795731,129.905210495,105.851430301)
comp=[]
for face,inds in sorted(found.items()):
 native_xyz=[tuple(coords[i][a]+offset[a] for a in range(3)) for i in inds]
 src=source_records.get(face)
 if src:
  err=max(abs(native_xyz[k][a]-src[k][a]) for k in range(3) for a in range(3))
  perm=min(max(abs(native_xyz[k][a]-src[p[k]][a]) for k in range(3) for a in range(3)) for p in ((0,1,2),(0,2,1),(1,0,2),(1,2,0),(2,0,1),(2,1,0)))
  comp.append({'native_face':face,'source_same_index_max_error_mm':err,'source_same_index_any_vertex_permutation_error_mm':perm,'same_index_match':perm<=TOL})
for face,inds in tail:
 if face in found:continue
 native_xyz=[tuple(coords[i][a]+offset[a] for a in range(3)) for i in inds]
 matches=[]
 for sf in sorted(source_records):
  src=source_records[sf]
  err=min(max(abs(native_xyz[k][a]-src[p[k]][a]) for k in range(3) for a in range(3)) for p in ((0,1,2),(0,2,1),(1,0,2),(1,2,0),(2,0,1),(2,1,0)))
  if err<=TOL:matches.append({'source_face':sf,'error_mm':err})
 comp.append({'native_tail_face':face,'matching_source_window_faces':matches})
report={'mismatch_source_face_index':T,'native_face_count':N,'source_face_count':M,'source_member':'A2071','source_member_range_exclusive':[37815330,37816591],'native_window_and_tail':comp,'elapsed_s':round(time.time()-t0,2),'coordinate_tolerance_mm':TOL,'interpretation':'bounded local correspondence only; no full rescan'}
Path('work/luna_binding/MISMATCH_AND_TAIL_PROBE.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
