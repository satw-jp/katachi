import json,pathlib,numpy as np
B=pathlib.Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A')
O=pathlib.Path(__file__).resolve().parents[1]/'outputs'
m={r['id']:r for r in json.loads((B/'data/ARTWORK_PERMANENT_ID_MAP.json').read_text())}
s=json.loads((B/'data/structure.json').read_text())['members']
t=json.loads((O/'TRANSFORM_AND_REFERENCE_LOCKS.json').read_text())
a=np.memmap(B/'export/ARTWORK_PERMANENT.stl',mode='r',offset=84,dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attribute','<u2')]))
rows=[]
for r in s:
 if r['kind']!='ROOT_ADDITION':continue
 x=m[r['id']];v=np.array(a['vertices'][x['first_triangle']:x['first_triangle']+x['triangles']],dtype=float).reshape(-1,3)
 plate=(v-np.array(t['source_stl_translation_mm']))*t['source_world_to_plate_scale']+np.array(t['source_world_to_plate_translation_mm'])
 rows.append({'id':r['id'],'declared_parent':r['parent_id'],'declared_target':r['target_id'],'source_triangle_range':[x['first_triangle'],x['first_triangle']+x['triangles']],'bbox_plate_mm':[plate.min(0).tolist(),plate.max(0).tolist()],'minimum_plate_z_mm':float(plate[:,2].min()),'touches_model_base_plane_within_1e_5_mm':abs(float(plate[:,2].min()))<1e-5,'lowest_points_plate_mm':plate[plate[:,2]<=plate[:,2].min()+1e-6].tolist()})
(O/'PERMANENT_BASE_EVIDENCE.json').write_text(json.dumps({'state':'DECLARED_BASE_MEMBERS_GEOMETRY_CHECKED','source_binding':'SOURCE_BINDING.json','permanent_base_members':rows,'completeness':'All declared ROOT_ADDITION members checked; no exhaustive search of every Flower/Permanent face for other bed contacts.','permanent_only_base_assumption':'These measured remaining roots are the declared geometric bases. No mechanical stability/load or later cutting/removal change is assumed verified.','printing_base_scope':'Model geometry base only. Actual raft/bed extrusion ancestry and +0.6 mm machine/model mapping remain unverified; Support has no inferred bed link.','never_use_crop_boundary_as_base':True},indent=2),encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['id','minimum_plate_z_mm','touches_model_base_plane_within_1e_5_mm']} for r in rows]))
