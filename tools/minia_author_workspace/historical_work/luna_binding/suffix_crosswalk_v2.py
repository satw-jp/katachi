from pathlib import Path
import zipfile,re,json,time
import numpy as np
native=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\cli\import_validated\A_A1_EDITABLE.3mf')
stl=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\export\ARTWORK_PERMANENT.stl')
K=37815935;N=40690246;M=40690249;TOL=1e-5;CHUNK=100000
OFFSET=np.array([127.541795731,129.905210495,105.851430301],dtype=np.float64)
vpath=Path('work/luna_binding/suffix_vertices.tmp');vertices=np.memmap(vpath,dtype=np.float64,mode='w+',shape=(20362205,3))
dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')],align=False)
source=np.memmap(stl,dtype=dtype,mode='r',offset=84,shape=(M,))
vrx=re.compile(rb'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"')
trx=re.compile(rb'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"')
vbatch=[];vcount=0;face_ids=[];triangle_count=0;compared=0;max_error=0.;mismatches=[];first_suffix=None;decoded=0;t0=time.time()
def flush_vertices():
 global vbatch,vcount
 if vbatch:
  vertices[vcount:vcount+len(vbatch)]=np.asarray(vbatch,dtype=np.float64);vcount+=len(vbatch);vbatch=[]
def flush_faces():
 global face_ids,compared,max_error,mismatches,first_suffix,triangle_count
 if not face_ids:return
 ids=np.arange(triangle_count-len(face_ids),triangle_count,dtype=np.int64);keep=ids>K
 if keep.any():
  if first_suffix is None:first_suffix=int(ids[keep][0])
  points=vertices[np.asarray(face_ids,dtype=np.int32)[keep]]+OFFSET
  refs=np.asarray(source['vertices'][ids[keep]],dtype=np.float64)
  errors=np.max(np.abs(points-refs),axis=(1,2));bad=np.flatnonzero(errors>TOL)
  compared+=len(errors);max_error=max(max_error,float(errors.max()))
  for x in bad[:20]:
   mismatches.append({'native_face':int(ids[keep][x]),'source_face':int(ids[keep][x]),'max_vertex_error_mm':float(errors[x])})
 face_ids=[]
carry=b'';vertex_phase=True
with zipfile.ZipFile(native) as z,z.open('3D/Objects/object_1.model') as stream:
 while block:=stream.read(8*1024*1024):
  decoded+=len(block);data=carry+block;pos=0
  if vertex_phase:
   tri_at=data.find(b'<triangle ')
   limit=tri_at if tri_at>=0 else len(data)
   while True:
    vi=data.find(b'<vertex ',pos,limit)
    if vi<0:break
    end=data.find(b'/>',vi)
    if end<0:carry=data[vi:];break
    match=vrx.match(data[vi:end+2]);vbatch.append([float(x) for x in match.groups()]);pos=end+2
    if len(vbatch)>=CHUNK:flush_vertices()
   else:
    if tri_at>=0:
     flush_vertices();vertex_phase=False
     if vcount!=20362205:raise RuntimeError(f'vertex count {vcount}')
     carry=data[tri_at:]
    else:carry=data[-16:]
  else:
   while True:
    ti=data.find(b'<triangle ',pos)
    if ti<0:carry=data[-16:];break
    end=data.find(b'/>',ti)
    if end<0:carry=data[ti:];break
    if triangle_count>K:
     match=trx.match(data[ti:end+2]);face_ids.append(tuple(int(x) for x in match.groups()))
    triangle_count+=1;pos=end+2
    if len(face_ids)>=CHUNK:flush_faces()
  if decoded%(512*1024*1024)<len(block):print('decoded_GiB',round(decoded/1024**3,2),'phase',('vertices' if vertex_phase else 'triangles'),'vertices',vcount+len(vbatch),'faces',triangle_count,'suffix_compared',compared,flush=True)
flush_vertices();flush_faces();vertices.flush()
report={'status':'PASS_SUFFIX_ORDERED_WITH_TOLERANCE' if not mismatches and compared==N-K-1 and triangle_count==N and vcount==20362205 else 'HOLD','native_path':str(native),'native_sha256':'04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded','source_stl':str(stl),'native_triangles':triangle_count,'source_triangles':M,'mismatch_at_index':K,'mismatch_maps_to_source_tail_face':40690248,'tail_swap_interpretation':'confirmed locally: source face K absent; source face 40690248 moved into native face K; two excess source faces are tail indices 40690246 and 40690247','suffix_native_start':K+1,'suffix_native_end_exclusive':N,'suffix_faces_compared':compared,'expected_suffix_faces':N-K-1,'coordinate_tolerance_mm':TOL,'tolerance_basis':'STL_EXPORT max float32 rounding 7.62939453125e-6 mm; prior ordered-prefix max 6.81399e-6 mm','suffix_max_abs_vertex_error_mm':max_error,'suffix_mismatches':mismatches,'elapsed_seconds':round(time.time()-t0,2),'method':'one raw ZIP stream pass; vertices disk-memmap; prefix triangle tags counted only; vectorized 100k-face chunks compared only for suffix after the one identified tail swap'}
Path('work/luna_binding/NATIVE_SUFFIX_CROSSWALK.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
vertices._mmap.close();del vertices;vpath.unlink(missing_ok=True)
print(json.dumps(report,indent=2))
