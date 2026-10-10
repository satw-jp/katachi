import json,zipfile
from pathlib import Path
base=Path('work/luna_binding')
rep=json.loads(Path(r'J:\\My Drive\\codex\\2026-09-22\\skin-fukei-slice-runner-execution-3\\outputs\\MINIA_PLA_EDITABLE_REPACKING_AUDIT.json').read_text())
repack=Path(rep['output'])
with zipfile.ZipFile(repack) as z:
 members={n:{'uncompressed_bytes':z.getinfo(n).file_size,'crc32':f'{z.getinfo(n).CRC:08x}'} for n in ['3D/3dmodel.model','3D/Objects/object_1.model','3D/Objects/object_2.model']}
result={
 'source_native_aliases':{
  'source_lock':{'path':'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_A_F2_PRINT_PREPARATION\\A\\delivery\\A_A1_EDITABLE.3mf','bytes':919626858,'sha256':'04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded','evidence':'A/data/NATIVE_IMPORT_VERIFICATION.json and data/DELIVERY_HASHES.json'},
  'inspection_alias':{'path':'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_A_F2_PRINT_PREPARATION\\A\\cli\\import_validated\\A_A1_EDITABLE.3mf','bytes':919626858,'sha256':'04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded','evidence':'Same byte hash measured against delivery/source lock alias during this task; native face scan used this path.'},
  'route_authority_snapshot':{'path':'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_A_MINI_LOCAL_LOBE_R1\\source\\A_A1_EDITABLE.3mf','bytes':919626858,'sha256':'04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded','evidence':'data/A_AUTHORITY_SOURCE_LOCKS.json; snapshot SHA/size equals locked delivery.'}
 },
 'repacked_editable':{
  'path':str(repack),'bytes':repack.stat().st_size,'sha256':'2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736','sha_evidence':'Measured during this task; ARTIFACT_INSPECTION.json',
  'measured_zip_members':members,
  'audit_assertions':{'source_object_1_base_vertices':rep['geometry_change']['base_object1_vertices'],'source_object_1_base_triangles':rep['geometry_change']['base_object1_triangles'],'part_1_after_triangles':rep['geometry_change']['part1_face_count_after'],'added_vertices':rep['geometry_change']['added_vertices'],'added_triangles':rep['geometry_change']['added_triangles'],'added_member_count':rep['geometry_change']['added_member_count'],'object_2_crc_expected':f"{rep['preserved']['object_2_crc']:08x}",'object_2_crc_measured':members['3D/Objects/object_2.model']['crc32'],'object_2_size_expected':rep['preserved']['object_2_size'],'object_2_size_measured':members['3D/Objects/object_2.model']['uncompressed_bytes'],'object_1_transform':rep['preserved']['object_1_component_transform'],'object_2_transform':rep['preserved']['object_2_component_transform'],'build_transform':rep['preserved']['build_transform'],'slice_executed':rep['verification']['slice_executed']},
  'evidence_boundary':'ZIP member sizes/CRCs and archive SHA were independently measured. Object_2 CRC and size match the repack audit. Preservation of the original object_1 triangle prefix is supported by repack audit counts and by the native face correspondence report, not by an independent native-vs-repacked bytewise geometry diff.'
 }
}
(base/'SOURCE_ALIAS_AND_REPACK_EVIDENCE.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({'status':'written','path':str(base/'SOURCE_ALIAS_AND_REPACK_EVIDENCE.json'),'zip_members':members},indent=2))
