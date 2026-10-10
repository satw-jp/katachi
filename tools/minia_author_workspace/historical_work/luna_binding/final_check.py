import json
from pathlib import Path
p=Path('work/luna_binding/NATIVE_SUFFIX_CROSSWALK.json')
d=json.loads(p.read_text()); d['native_identity_evidence']='SOURCE_ALIAS_AND_REPACK_EVIDENCE.json: explicit source lock delivery path and inspection alias share hash 04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded (919626858 bytes); route authority snapshot also matches.'
p.write_text(json.dumps(d,indent=2),encoding='utf-8')
# Self-check final artifacts and cardinality arithmetic.
rem=json.loads(Path('work/luna_binding/NATIVE_FACE_REMAP.json').read_text())
suf=json.loads(p.read_text())
assert rem['status']=='PASS_WITH_EXPLICIT_3_FACE_REMAP_AND_TOLERANCE'
assert suf['suffix_faces_compared']==2874310 and len(suf['suffix_mismatches'])==2
assert len(rem['explicit_remaps'])==3
assert 37815935 not in range(37815936,40690246)
print(json.dumps({'crosswalk_status':rem['status'],'suffix_faces':suf['suffix_faces_compared'],'suffix_anomalies_mapped':sum(bool(x.get('candidate_tail_matches')) for x in suf['suffix_mismatches']),'explicit_remaps':len(rem['explicit_remaps'])},indent=2))
