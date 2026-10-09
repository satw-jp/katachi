from pathlib import Path
import zipfile,re,json,time,hashlib
import numpy as np
native=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_A_F2_PRINT_PREPARATION\\A\\cli\\import_validated\\A_A1_EDITABLE.3mf')
stl=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_A_F2_PRINT_PREPARATION\\A\\export\\ARTWORK_PERMANENT.stl')
OUT=Path('work/luna_binding/NATIVE_SUFFIX_CROSSWALK.json')
K=37815935; N=40690246; M=40690249; NV=20362205; TOL=1e-5; CHUNK=100000
OFFSET=np.array([127.541795731,129.905210495,105.851430301],dtype=np.float64)
vpath=Path('work/luna_binding/suffix_vertices.tmp')
vertices=np.memmap(vpath,dtype=np.float64,mode='w+',shape=(NV,3))
dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
source=np.memmap(stl,dtype=dtype,mode='r',offset=84,shape=(M,))
vrx=re.compile(rb'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"')
trx=re.compile(rb'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"')
vbatch=[]; vcount=0; face_ids=[]; triangle_count=0; compared=0; max_error=0.; mismatches=[]; decoded=0; t0=time.time()
def flush_vertices():
 global vbatch,vcount
 if vbatch:
  if vcount+len(vbatch)>NV: raise RuntimeError('vertex overflow')
  vertices[vcount:vcount+len(vbatch)]=np.asarray(vbatch,dtype=np.float64); vcount+=len(vbatch); vbatch.clear()
def flush_faces():
 global face_ids,compared,max_error,mismatches
 if not face_ids:return
 start=triangle_count-len(face_ids)
 ids=np.arange(start,triangle_count,dtype=np.int64)
 sel=ids>K
 if sel.any():
  native_ids=np.asarray(face_ids,dtype=np.int32)[sel]
  points=vertices[native_ids]+OFFSET
  refs=np.asarray(source['vertices'][ids[sel]],dtype=np.float64)
  errors=np.max(np.abs(points-refs),axis=(1,2)); compared+=len(errors); max_error=max(max_error,float(errors.max()))
  bad=np.flatnonzero(errors>TOL)
  for q in bad[:20]: mismatches.append({'native_face':int(ids[sel][q]),'source_face':int(ids[sel][q]),'max_vertex_error_mm':float(errors[q]),'native_vertex_ids':native_ids[q].tolist(),'native_xyz_world_mm':points[q].tolist(),'source_xyz_mm':refs[q].tolist()})
 face_ids.clear()
carry=b''; vertex_phase=True
with zipfile.ZipFile(native) as z, z.open('3D/Objects/object_1.model') as stream:
 while True:
  block=stream.read(8*1024*1024)
  if not block: break
  decoded+=len(block); data=carry+block; pos=0
  if vertex_phase:
   ti=data.find(b'<triangle ',pos)
   endlimit=ti if ti>=0 else len(data)
   while True:
    vi=data.find(b'<vertex ',pos,endlimit)
    if vi<0:
     if ti>=0:
      flush_vertices()
      if vcount!=NV: raise RuntimeError(f'vertex count {vcount}, expected {NV}')
      vertex_phase=False; carry=data[ti:]
     else: carry=data[-16:]
     break
    end=data.find(b'/>',vi,endlimit)
    if end<0:
     carry=data[vi:]; break
    m=vrx.match(data[vi:end+2])
    if not m: raise RuntimeError(f'bad vertex tag at {vcount}')
    vbatch.append([float(x) for x in m.groups()]); pos=end+2
    if len(vbatch)>=CHUNK: flush_vertices()
  else:
   while True:
    ti=data.find(b'<triangle ',pos)
    if ti<0:
     carry=data[-16:]; break
    end=data.find(b'/>',ti)
    if end<0:
     carry=data[ti:]; break
    if triangle_count>K:
     m=trx.match(data[ti:end+2])
     if not m: raise RuntimeError(f'bad triangle tag at {triangle_count}')
     face_ids.append(tuple(int(x) for x in m.groups()))
    triangle_count+=1; pos=end+2
    if len(face_ids)>=CHUNK: flush_faces()
  if decoded//(512*1024*1024)!=(decoded-len(block))//(512*1024*1024): print('progress',round(decoded/1024**3,2),'GiB', 'phase',('vertices' if vertex_phase else 'triangles'),'v',vcount+len(vbatch),'tri',triangle_count,'compared',compared,flush=True)
flush_vertices(); flush_faces(); vertices.flush()
report={'status':'PASS_SUFFIX_ORDERED_WITH_TOLERANCE' if triangle_count==N and compared==N-K-1 and not mismatches else 'HOLD','native_path':str(native),'native_identity_basis':'SHA-256 alias lock recorded in SOURCE_BINDING_EVIDENCE.json: source lock, import_validated alias and delivery alias all 04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded','native_file_bytes':native.stat().st_size,'native_zip_hash_measured_this_run':False,'native_sha256':None,'object_entry':'3D/Objects/object_1.model','source_stl':str(stl),'native_vertices':vcount,'native_triangles':triangle_count,'source_triangles':M,'mismatch_index':K,'local_tail_mapping_evidence':'MISMATCH_AND_TAIL_PROBE_DETAILED.json: native face K matches source face M-1 under vertex permutation within tolerance; local native K+1..K+4 and tail 12 match same-index STL','suffix_native_start':K+1,'suffix_native_end_exclusive':N,'suffix_faces_compared':compared,'expected_suffix_faces':N-K-1,'coordinate_tolerance_mm':TOL,'tolerance_basis':'STL_EXPORT.json max float32 export-rounding 7.62939453125e-6 mm; ordered prefix maximum 6.813990239606937e-6 mm','suffix_max_abs_vertex_error_mm':max_error,'suffix_mismatches':mismatches,'elapsed_seconds':round(time.time()-t0,2),'method':'Single raw ZIP XML stream. Disk memmap for all native vertices. Triangle prefix counted without coordinate comparisons; suffix triangles vector-compared against same-index binary STL records in 100k chunks.'}
OUT.write_text(json.dumps(report,indent=2),encoding='utf-8')
vertices._mmap.close(); del vertices; vpath.unlink(missing_ok=True)
print(json.dumps(report,indent=2))
