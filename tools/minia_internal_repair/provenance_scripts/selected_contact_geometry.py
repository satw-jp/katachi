import sys,json,pathlib,hashlib,time,itertools
import numpy as np
sys.path.append(r'J:\My Drive\codex\2026-09-05\files-mentioned-by-the-user-samples\work\r2\vendor')
import manifold3d as md
B=pathlib.Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs')
OUT=pathlib.Path(__file__).resolve().parents[1]/'outputs'
A=B/'R4_A_F2_PRINT_PREPARATION/A'
locks=json.loads((OUT/'TRANSFORM_AND_REFERENCE_LOCKS.json').read_text())
s=locks['source_world_to_plate_scale'];t=np.array(locks['source_world_to_plate_translation_mm']);offset=np.array(locks['source_stl_translation_mm'])
mapping={r['id']:r for r in json.loads((A/'data/ARTWORK_PERMANENT_ID_MAP.json').read_text())}
support_mapping={r['id']:r for r in json.loads((A/'data/REMOVABLE_SUPPORT_ID_MAP.json').read_text())}
dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')])
tri=np.memmap(A/'export/ARTWORK_PERMANENT.stl',mode='r',dtype=dtype,offset=84,shape=(40690249,))
support_tri=np.memmap(A/'export/REMOVABLE_SUPPORT.stl',mode='r',dtype=dtype,offset=84)
solids={};meta={}
def get(id):
 if id in solids:return solids[id]
 if id=='LR002' or id.startswith('R5_'):
  path=B/('R4_A_MINI_LOCAL_LOBE_R1/data/members/LR002.npz' if id=='LR002' else f'R4_ROOT_LAUNCH_R5/data/members/{id}.npz');q=np.load(path)
  v=np.asarray(q['vertices'],dtype=np.float64)*s+t;f=q['faces']
  source={'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'native_correspondence':'ADDITIONS_3MF_ID_MAP; accepted SOURCE_BINDING.json'}
 else:
  support_member=id in support_mapping
  r=(support_mapping if support_member else mapping)[id];raw=support_tri if support_member else tri
  points=np.array(raw['vertices'][r['first_triangle']:r['first_triangle']+r['triangles']],dtype=np.float64)
  v,ix=np.unique(points.reshape(-1,3),axis=0,return_inverse=True);f=ix.reshape(-1,3);v=(v-offset)*s+t
  source={'path':str(A/('export/REMOVABLE_SUPPORT.stl' if support_member else 'export/ARTWORK_PERMANENT.stl')),'first_triangle':r['first_triangle'],'triangles':r['triangles'],'native_correspondence':'SOURCE_BINDING.json source provenance; Support native part CRC preserved' if support_member else 'NATIVE_FACE_REMAP.json accepted; selected members not at swapped indices'}
 m=md.Manifold(md.Mesh(np.asarray(v,dtype=np.float32),np.asarray(f,dtype=np.uint32)))
 if str(m.status())!='Error.NoError':raise RuntimeError((id,str(m.status())))
 solids[id]=m;meta[id]={'source':source,'role':'SUPPORT' if id in support_mapping else 'PERMANENT','volume_plate_mm3':m.volume(),'bbox_plate_mm':list(m.bounding_box())}
 return m
start=time.perf_counter();contacts=[]
selected=['G0165','C0016','G0181','C0031','A3457','F3457','LR002']+[f'R5_F3457_P{i}' for i in range(1,7)]+['S002463','T00661','T00673','X03430','S002400']
for id in selected:get(id)
for a,b in itertools.combinations(selected,2):
 ba=meta[a]['bbox_plate_mm'];bb=meta[b]['bbox_plate_mm']
 if any(ba[i]>bb[i+3] or bb[i]>ba[i+3] for i in range(3)):continue
 overlap=get(a)^get(b);volume=overlap.volume();row={'a':a,'b':b,'volume_plate_mm3':volume,'evidence':'GEOMETRY_CONTACT_VERIFIED' if volume>1e-8 else 'NO_POSITIVE_OVERLAP_IN_SELECTED_GEOMETRY','contact_kind':'BEARING_CONTACT' if (a in support_mapping)!=(b in support_mapping) else 'FUSED_CONTACT','mechanical_interpretation':'Support/Permanent contact included only as bearing assumption; tensile/bending holding unverified' if (a in support_mapping)!=(b in support_mapping) else 'Positive geometric material overlap; physical bonding/strength unverified'}
 if volume>1e-8:
  bb=list(overlap.bounding_box());low=bb[2];high=bb[5]
  for _ in range(24):
   mid=(low+high)/2
   if overlap.trim_by_plane((0,0,-1),-mid).volume()>1e-8:high=mid
   else:low=mid
  row.update(overlap_bbox_plate_mm=bb,positive_overlap_onset_plate_z_mm=high,onset_threshold_volume_mm3=1e-8,onset_resolution_mm=(bb[5]-bb[2])/2**24)
  row['layer_end_samples']=[{'model_z_mm':z,'overlap_below_height_mm3':overlap.trim_by_plane((0,0,-1),-z).volume()} for z in [34.,35.,40.,41.,42.,43.,44.,45.,46.]]
 contacts.append(row)
fragments=[]
for id in ['G0181','A3457','LR002','F3457']:
 for h in [40.,40.6,40.7,41.,41.5,42.,42.5,43.,43.2,44.,45.,46.,47.]:
  pieces=[p for p in get(id).trim_by_plane((0,0,-1),-h).decompose() if p.volume()>1e-8]
  fragments.append({'member_id':id,'model_z_mm':h,'positive_volume_component_count':len(pieces),'components':[{'volume_mm3':p.volume(),'bbox_plate_mm':list(p.bounding_box())} for p in pieces]})
history=[]
positive=[r for r in contacts if r['volume_plate_mm3']>1e-8]
for h in [round(x*.2,8) for x in range(0,781)]:
 pieces={id:[p for p in get(id).trim_by_plane((0,0,-1),-h).decompose() if p.volume()>1e-8] for id in selected}
 nodes=[];edges=[]
 for id,pp in pieces.items():
  pp.sort(key=lambda p:tuple(p.bounding_box()))
  for j,p in enumerate(pp):nodes.append({'id':f'{id}#{j}','physical_member_id':id,'role':meta[id]['role'],'bbox_plate_mm':list(p.bounding_box()),'volume_mm3':p.volume()})
 for r in positive:
  if h<r['positive_overlap_onset_plate_z_mm']:continue
  for i,p in enumerate(pieces[r['a']]):
   for j,q in enumerate(pieces[r['b']]):
    v=(p^q).volume()
    if v>1e-8:edges.append({'a':f"{r['a']}#{i}",'b':f"{r['b']}#{j}",'joint_id':r['a']+'|'+r['b'],'overlap_mm3':v,'evidence':'GEOMETRY_CONTACT_VERIFIED','contact_kind':r['contact_kind']})
 history.append({'model_z_mm':h,'nodes':nodes,'contacts':edges})
result={'state':'SCOPED_SOURCE_GEOMETRY_CONTACTS_MEASURED','region':'F3457 / G0181 DEMO; not identified physical damage','members':meta,'contacts':contacts,'height_clipped_components':fragments,'height_semantics':'GEOMETRY_LAYER_END_ESTIMATE; model plate coordinates, no raft offset added','elapsed_s':time.perf_counter()-start,'limitations':['All AABB-possible pair contacts among 18 explicitly listed selected members tested; no completeness outside this set.','Five actual source Support meshes included; Support/Permanent bearing classification is a force-direction assumption, not a physical bond measurement.','Source correspondence accepted under SOURCE_BINDING.json tolerance and provenance caveats.','Positive overlap threshold is a numerical test, not a printable bond-area requirement.','No original or manufacturing geometry modified.']}
(OUT/'SELECTED_GEOMETRY_HEIGHT_CACHE.json').write_text(json.dumps({'state':result['state'],'height_grid_mm':.2,'range_model_z_mm':[0.,156.],'member_ids':selected,'fragment_ids_scope':'Per-height only; do not equate fragment index across heights or merge fragments by physical ID.','snapshots':history},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'SELECTED_GEOMETRY_CONTACTS.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'contacts':[{k:r.get(k) for k in ['a','b','volume_plate_mm3','positive_overlap_onset_plate_z_mm']} for r in contacts],'elapsed_s':result['elapsed_s']}))
