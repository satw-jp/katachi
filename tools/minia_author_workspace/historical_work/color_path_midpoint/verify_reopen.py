import bpy,sys,json
from pathlib import Path
ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');OUT=ROOT/'outputs';WORK=ROOT/'work'/'color_path_midpoint'
sys.path.insert(0,str(OUT/'color_path_midpoint_runtime'))
import midpoint_runtime as rt
expected=json.loads((WORK/'MIDPOINT_QA_EXPECTED.json').read_text(encoding='utf-8'))
rt.register(enter_edit_mode=True);state=rt.scan_state(bpy.context.scene,True)
assert len(state['mid_records'])==3
assert len(state['roots'])==2 and sum(len(x['cuts']) for x in state['roots'])==1
assert len(state['edge_rows'])==expected['expected_edges']
assert not state['bm'].faces
assert sum(r['kind']=='source_segment' for r in state['mid_records'].values())==2
assert sum(r['kind']=='author_edge' for r in state['mid_records'].values())==1
assert all((r['kind']=='source_segment' and r['stable_id'].startswith('SMID:')) or (r['kind']=='author_edge' and r['stable_id'].startswith('AMID:')) for r in state['mid_records'].values())
result={'status':'FRESH_REOPEN_PASS','vertices':len(state['verts_by_index']),'edges':len(state['edge_rows']),'midpoint_count':len(state['mid_records']),'source_midpoint_count':sum(r['kind']=='source_segment' for r in state['mid_records'].values()),'author_midpoint_count':sum(r['kind']=='author_edge' for r in state['mid_records'].values()),'author_root_count':len(state['roots']),'author_root_cuts':sum(len(x['cuts']) for x in state['roots']),'face_count':len(state['bm'].faces),'source_ref_count':sum(bool(o.get('source_reference')) for o in bpy.data.objects),'registry_sha256':__import__('hashlib').sha256(bpy.context.scene['midpoint_author_root_registry'].encode()).hexdigest()}
(WORK/'MIDPOINT_QA_FRESH_REOPEN.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False),flush=True)
