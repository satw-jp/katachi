import json,pathlib,shutil
root=pathlib.Path(__file__).resolve().parents[1];out=root/'outputs';e=root/'work/luna_binding'
for name in ['NATIVE_FACE_REMAP.json','NATIVE_SUFFIX_CROSSWALK.json','MISMATCH_AND_TAIL_PROBE_DETAILED.json','SOURCE_ALIAS_AND_REPACK_EVIDENCE.json']:
 shutil.copy2(e/name,out/name)
p=out/'SOURCE_BINDING.json';r=json.loads(p.read_text())
r.update(state='MINIA_SUCCESSFUL_PRINT_SOURCE_BOUND',gate_pass=True,decision_owner='Astra',decision_scope='Identity/provenance and editable centerline/ID binding accepted for non-manufacturing Author Editor. Native reference remains immutable.',pending=None)
r['bound_permanent_record_count']=9421
r['member_groups']={'A_original':4240,'local_lobe_additions':3,'frozen_flower_roots':5178}
r['native_face_crosswalk']='NATIVE_FACE_REMAP.json'
r['alias_and_repack_evidence']='SOURCE_ALIAS_AND_REPACK_EVIDENCE.json'
r['binding_basis']=['Successful embedded and historical G-code hash identity; exact Runner input editable hash lock.','A source records unchanged in Local Lobe baseline plus 3 LR records; authoritative 5178 FROZEN additions.','Complete source STL/native import face crosswalk within 1e-5 mm, with explicit 3-face swap mapping and three omitted near-zero-area faces.','Recorded repack provenance, independently measured archive identity, transforms and Support ZIP metadata; addition ID map covers 5181 LR/root members.','Source coordinates, ancestry, radii and flower/root records retained; author plate transform applied once.']
r['caveats']=[r['caveats'][0],'Native correspondence is tolerance-based, not bitwise geometry identity. Three near-zero-area source faces in A2071/A3802/A0044 are absent; GJ036 tail faces are remapped explicitly. Do not use source face ranges as native ranges without this map.','Original object_1 preservation through repack is supported by the recorded repack operation and matching locks, not a new bytewise native-versus-repacked prefix comparison. Future materialization must append to the actual locked repacked baseline, never rebuild it from source STL.','This gate permits lightweight source-linked editing, not physical strength, complete contact verification or new manufacturing approval.']
p.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
for name in ['SELECTED_GEOMETRY_CONTACTS.json','SELECTED_GEOMETRY_HEIGHT_CACHE.json']:
 p=out/name;q=json.loads(p.read_text());q['state']='SCOPED_SOURCE_GEOMETRY_CONTACTS_MEASURED';q['source_binding']='SOURCE_BINDING.json';q['source_binding_gate_pass']=True
 if 'limitations' in q:q['limitations']=[x for x in q['limitations'] if not x.startswith('Native source binding must pass')]
 p.write_text(json.dumps(q,ensure_ascii=False,separators=(',',':')) if 'CACHE' in name else json.dumps(q,ensure_ascii=False,indent=2),encoding='utf-8')
print('MINIA_SUCCESSFUL_PRINT_SOURCE_BOUND')
