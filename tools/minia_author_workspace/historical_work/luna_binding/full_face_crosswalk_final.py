from pathlib import Path
import zipfile,json,time,xml.etree.ElementTree as ET
import numpy as np
base=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION')
stl_path=base/'A/export/ARTWORK_PERMANENT.stl'; native_path=base/'A/cli/import_validated/A_A1_EDITABLE.3mf'
EXPECTED_VERTICES=20362205; EXPECTED_NATIVE_FACES=40690246; SOURCE_FACES=40690249
OFFSET=np.array([127.541795731,129.905210495,105.851430301],dtype=np.float64)
TOL=1.0e-5; CHUNK=100000; v_path=Path('work/luna_binding/native_vertices.tmp')
vertices=np.memmap(v_path,dtype=np.float64,mode='w+',shape=(EXPECTED_VERTICES,3))
stl_dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')],align=False)
assert stl_dtype.itemsize==50
source=np.memmap(stl_path,dtype=stl_dtype,mode='r',offset=84,shape=(SOURCE_FACES,))
vi=0;ti=0;vbatch=[];face_batch=np.empty((CHUNK,3,3),dtype=np.float64);fb=0
source_at=0;matched=0;max_error=0.0;skipped=[];mismatch=None;t0=time.time()
def write_vertices():
 global vi,vbatch
 if vbatch:
  if vi+len(vbatch)>EXPECTED_VERTICES: raise RuntimeError('native vertex overflow')
  vertices[vi:vi+len(vbatch)]=np.asarray(vbatch,dtype=np.float64)
  vi+=len(vbatch);vbatch=[]
def compare_faces(n):
 global source_at,matched,max_error,skipped,mismatch
 pos=0
 while pos<n and not mismatch:
  avail=min(n-pos,SOURCE_FACES-source_at)
  if avail<=0:
   mismatch={'native_face_in_batch':pos,'source_face':source_at,'reason':'source exhausted'};return
  expected=np.asarray(source['vertices'][source_at:source_at+avail],dtype=np.float64)
  errors=np.max(np.abs(face_batch[pos:pos+avail]-expected),axis=(1,2))
  bad=np.flatnonzero(errors>TOL)
  good=avail if not len(bad) else int(bad[0])
  if good:
   max_error=max(max_error,float(errors[:good].max()));matched+=good;source_at+=good;pos+=good
  if not len(bad):continue
  remaining=3-len(skipped);found=None
  for gap in range(1,remaining+1):
   if source_at+gap>=SOURCE_FACES:break
   err=float(np.max(np.abs(face_batch[pos]-np.asarray(source['vertices'][source_at+gap],dtype=np.float64))))
   if err<=TOL:found=(gap,err);break
  if found is None:
   mismatch={'source_face':source_at,'same_index_error_mm':float(errors[good]),'reason':'no following ordered match within three-face budget'};return
  gap,err=found;skipped.extend(range(source_at,source_at+gap));source_at+=gap;max_error=max(max_error,err)
stack=[];vertices_flushed=False
with zipfile.ZipFile(native_path) as z, z.open('3D/Objects/object_1.model') as stream:
 for event,elem in ET.iterparse(stream,events=('start','end')):
  tag=elem.tag.rsplit('}',1)[-1]
  if event=='start':stack.append(elem);continue
  if tag=='vertex':
   vbatch.append([float(elem.get('x')),float(elem.get('y')),float(elem.get('z'))])
   if len(vbatch)>=CHUNK:write_vertices()
  elif tag=='triangle':
   if not vertices_flushed:
    write_vertices();vertices_flushed=True
    if vi!=EXPECTED_VERTICES:raise RuntimeError(f'vertex count before faces {vi} != {EXPECTED_VERTICES}')
   inds=[int(elem.get(k)) for k in ('v1','v2','v3')]
   face_batch[fb]=vertices[inds]+OFFSET;fb+=1;ti+=1
   if fb==CHUNK:
    compare_faces(fb);fb=0
    if mismatch:break
  if len(stack)>1:stack[-2].remove(elem)
  stack.pop()
if not mismatch and fb:compare_faces(fb)
write_vertices();vertices.flush()
if not mismatch and (vi!=EXPECTED_VERTICES or ti!=EXPECTED_NATIVE_FACES):mismatch={'reason':'native counts differ','vertices':vi,'faces':ti}
if not mismatch:
 trailing=SOURCE_FACES-source_at
 if trailing==3-len(skipped):skipped.extend(range(source_at,SOURCE_FACES));source_at=SOURCE_FACES
 elif len(skipped)!=3 or source_at!=SOURCE_FACES:mismatch={'reason':'final face-count alignment differs','skipped':skipped,'source_consumed':source_at}
ranges=json.loads((base/'A/data/ARTWORK_PERMANENT_ID_MAP.json').read_text(encoding='utf-8'))
face_map=[]
for idx in skipped:
 rec=next((r for r in ranges if int(r['first_triangle'])<=idx<int(r['first_triangle'])+int(r['triangles'])),None)
 face_map.append({'source_triangle_index':idx,'member_id':rec.get('id') if rec else None,'member_role':rec.get('role') if rec else None,'member_range':[int(rec['first_triangle']),int(rec['first_triangle'])+int(rec['triangles'])] if rec else None})
report={'status':'PASS_ORDER_PRESERVED_WITH_TOLERANCE_AND_3_DROPS' if not mismatch else 'HOLD','source_stl':str(stl_path),'source_face_count':SOURCE_FACES,'native_3mf':str(native_path),'native_face_count':ti,'native_vertex_count':vi,'component_translation_mm':OFFSET.tolist(),'comparison_tolerance_mm':TOL,'tolerance_basis':'STL_EXPORT.json float32 max rounding 7.62939453125e-6 mm; first eight face ordered errors 2.506e-6 to 2.531e-6 mm','matched_face_count':matched,'max_matched_vertex_abs_error_mm':max_error,'skipped_source_faces':face_map,'mismatch':mismatch,'elapsed_seconds':round(time.time()-t0,2),'method':'XML stream; native vertex coordinates stored in float64 disk memmap; source STL memory-mapped; ordered triangle vertex coordinates compared in vectorized chunks with bounded lookahead (max three drops). This is tolerance correspondence, not bitwise identity.'}
Path('work/luna_binding/NATIVE_FACE_CROSSWALK.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
vertices._mmap.close();del vertices;v_path.unlink(missing_ok=True)
print(json.dumps(report,indent=2))
