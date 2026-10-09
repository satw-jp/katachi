from pathlib import Path
import zipfile,struct,json,re,time,itertools
import numpy as np
T=37815935;N=40690246;M=40690249;TOL=1e-5
native=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\cli\import_validated\A_A1_EDITABLE.3mf')
stl=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\export\ARTWORK_PERMANENT.stl')
target_native=set(range(T-4,T+5))|set(range(N-12,N));native_refs={};tail=[];decoded=0
with zipfile.ZipFile(native) as z,z.open('3D/Objects/object_1.model') as f:
 carry=b'';count=0
 while block:=f.read(8*1024*1024):
  decoded+=len(block);data=carry+block;pos=0
  while True:
   i=data.find(b'<triangle ',pos)
   if i<0:carry=data[-16:];break
   end=data.find(b'/>',i)
   if end<0:carry=data[i:];break
   m=re.match(rb'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"',data[i:end+2])
   if not m:raise RuntimeError('unexpected triangle syntax')
   refs=tuple(map(int,m.groups()))
   if count in target_native:native_refs[count]=refs
   tail.append((count,refs));tail=tail[-12:];count+=1;pos=end+2
print('faces_parsed',count,'sample_indices_saved',len(native_refs),flush=True)
need={x for refs in native_refs.values() for x in refs};coords={};vertex_index=0;decoded=0;rx=re.compile(rb'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"')
with zipfile.ZipFile(native) as z,z.open('3D/Objects/object_1.model') as f:
 carry=b''
 while block:=f.read(8*1024*1024):
  decoded+=len(block);data=carry+block;pos=0
  while True:
   i=data.find(b'<vertex ',pos)
   if i<0:carry=data[-16:];break
   end=data.find(b'/>',i)
   if end<0:carry=data[i:];break
   if vertex_index in need:
    m=rx.match(data[i:end+2]);coords[vertex_index]=tuple(float(v) for v in m.groups())
   vertex_index+=1;pos=end+2
print('vertices_parsed',vertex_index,'coordinates_saved',len(coords),flush=True)
offset=(127.541795731,129.905210495,105.851430301)
def xyz(refs):return [[coords[v][a]+offset[a] for a in range(3)] for v in refs]
def stl_face(idx):
 with stl.open('rb') as f:f.seek(84+idx*50);rec=struct.unpack('<12fH',f.read(50));return [list(rec[3:6]),list(rec[6:9]),list(rec[9:12])]
def error(a,b):return max(abs(a[i][j]-b[i][j]) for i in range(3) for j in range(3))
def perm_error(a,b):return min(error(a,[b[p[0]],b[p[1]],b[p[2]]]) for p in itertools.permutations(range(3)))
records=[];source_window=range(T-4,T+5);source_tail=range(M-12,M)
for ni,refs in sorted(native_refs.items()):
 a=xyz(refs);same=stl_face(ni) if ni<M else None
 tailmatches=[]
 for si in source_tail:
  b=stl_face(si);e=perm_error(a,b)
  if e<=TOL:tailmatches.append({'source_face':si,'permutation_error_mm':e,'source_coords':b})
 records.append({'native_face':ni,'vertex_indices':refs,'world_coords':a,'same_index_source_face':ni if same else None,'same_index_source_coords':same,'same_index_ordered_error_mm':error(a,same) if same else None,'same_index_any_permutation_error_mm':perm_error(a,same) if same else None,'source_tail_matches':tailmatches})
report={'status':'LOCAL_COORDINATE_PROBE','native_face_count':N,'source_face_count':M,'mismatch_native_and_source_index':T,'source_member':'A2071','member_triangle_range_exclusive':[37815330,37816591],'native_faces_and_vertices':records,'coordinate_tolerance_mm':TOL,'component_translation_mm':offset,'elapsed_note':'Two raw ZIP-stream passes; only 17 face records and their vertex coordinates retained. This is not a full triangle rescan.'}
Path('work/luna_binding/MISMATCH_AND_TAIL_PROBE_DETAILED.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('saved',Path('work/luna_binding/MISMATCH_AND_TAIL_PROBE_DETAILED.json').stat().st_size,flush=True)
