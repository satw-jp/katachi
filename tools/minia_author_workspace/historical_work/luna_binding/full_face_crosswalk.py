from pathlib import Path
import zipfile, json, time, xml.etree.ElementTree as ET
import numpy as np
base=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION')
stl_path=base/'A/export/ARTWORK_PERMANENT.stl'; native_path=base/'A/cli/import_validated/A_A1_EDITABLE.3mf'
report_path=Path('work/luna_binding/NATIVE_FACE_CROSSWALK.json')
EXPECTED_VERTICES=20362205; EXPECTED_NATIVE_FACES=40690246; SOURCE_FACES=40690249
OFFSET=np.array([127.541795731,129.905210495,105.851430301],dtype=np.float64)
TOL=1.0e-5; CHUNK=100000
v_path=Path('work/luna_binding/native_vertices.tmp')
verts=np.memmap(v_path,dtype=np.float64,mode='w+',shape=(EXPECTED_VERTICES,3))
dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')],align=False)
assert dtype.itemsize==50
source=np.memmap(stl_path,dtype=dtype,mode='r',offset=84,shape=(SOURCE_FACES,))
vi=0; ti=0; vbatch=[]; fbatch=np.empty((CHUNK,3,3),dtype=np.float64); fb=0
source_at=0; matched=0; max_err=0.0; missing=[]; mismatch=None; t0=time.time()
def flush_faces(n):
 global source_at,matched,max_err,missing,mismatch,ti
 pos=0
 while pos<n:
  avail=min(n-pos,SOURCE_FACES-source_at)
  if avail<=0: mismatch={'native_face':ti-n+pos,'source_face':source_at,'reason':'source exhausted'};return
  cand=np.asarray(source['vertices'][source_at:source_at+avail],dtype=np.float64)
  errors=np.max(np.abs(fbatch[pos:pos+avail]-cand),axis=(1,2))
  bad=np.flatnonzero(errors>TOL)
  upto=avail if not len(bad) else int(bad[0])
  if upto:
   max_err=max(max_err,float(errors[:upto].max()));matched+=upto;source_at+=upto;pos+=upto
  if not len(bad): continue
  ni=ti-n+pos
  found=None
  for gap in range(1,4-len(missing)+1):
   if source_at+gap>=SOURCE_FACES: break
   err=float(np.max(np.abs(fbatch[pos]-np.asarray(source['vertices'][source_at+gap],dtype=np.float64))))
   if err<=TOL:found=(gap,err);break
  if found is None:
   mismatch={'native_face':ni,'source_face':source_at,'error_at_same_index_mm':float(errors[0]),'reason':'no ordered match within remaining three-face skip budget'};return
  gap,err=found
  for ix in range(source_at,source_at+gap):missing.append(ix)
  source_at+=gap
  max_err=max(max_err,err)
def save_vertex_batch():
 global vi,vbatch
 if vbatch:
  if vi+len(vbatch)>EXPECTED_VERTICES: raise RuntimeError('native vertex overflow')
  verts[vi:vi+len(vbatch)]=np.asarray(vbatch,dtype=np.float64);vi+=len(vbatch);vbatch=[]
with zipfile.ZipFile(native_path) as z, z.open('3D/Objects/object_1.model') as stream:
 stack=[]
 for event,elem in ET.iterparse(stream,events=('start','end')):
  tag=elem.tag.rsplit('}',1)[-1]
  if event=='start':stack.append(elem);continue
  if tag=='vertex':
   vbatch.append([float(elem.get('x')),float(elem.get('y')),float(elem.get('z'))])
   if len(vbatch)>=CHUNK:save_vertex_batch()
  elif tag=='triangle':
   inds=(int(elem.get('v1')),int(elem.get('v2')),int(elem.get('v3')))
   fbatch[fb]=verts[list(inds)]+OFFSET;fb+=1;ti+=1
   if fb==CHUNK:
    flush_faces(fb);fb=0
    if mismatch:break
  if len(stack)>1:stack[-2].remove(elem)
  stack.pop()
 if not mismatch and fb:flush_faces(fb)
save_vertex_batch();verts.flush()
if not mismatch and (vi!=EXPECTED_VERTICES or ti!=EXPECTED_NATIVE_FACES):mismatch={'reason':'native counts differ','vertices':vi,'faces':ti}
if not mismatch and (len(missing)!=3 or source_at!=SOURCE_FACES):mismatch={'reason':'unexpected final source alignment','missing':missing,'source_consumed':source_at}
# map skipped source face indices to permanent member IDs/ranges
ranges=json.loads((base/'A/data/ARTWORK_PERMANENT_ID_MAP.json').read_text(encoding='utf-8'))
face_map=[]
for idx in missing:
 rec=next((r for r in ranges if int(r['first_triangle'])<=idx<int(r['first_triangle'])+int(r['triangles'])),None)
 face_map.append({'source_triangle_index':idx,'member_id':rec.get('id') if rec else None,'member_role':rec.get('role') if rec else None,'member_range':([rec['first_triangle'],rec['first_triangle']+rec['triangles']) if rec else None})
report={'status':'PASS_EXACT_ORDER_WITH_3_SKIPPED' if not mismatch else 'HOLD', 'source_stl':str(stl_path),'source_face_count':SOURCE_FACES,'native_3mf':str(native_path),'native_face_count':ti,'native_vertex_count':vi,'native_component_translation_mm':OFFSET.tolist(),'coordinate_match_tolerance_mm':TOL,'tolerance_basis':'STL_EXPORT.json max_float32_rounding_mm=7.62939453125e-6; sample observed <=2.531e-6 mm','matched_in_order':matched,'max_matched_vertex_error_mm':max_err,'skipped_source_faces':face_map,'mismatch':mismatch,'elapsed_s':round(time.time()-t0,2),'method':'Stream-parse native XML to disk memmap for vertices; vectorized 100k-face ordered comparison against memory-mapped binary STL; bounded lookahead for up to three dropped source faces.'}
report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
