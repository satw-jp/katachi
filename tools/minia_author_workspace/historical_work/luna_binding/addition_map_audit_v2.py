import json, pathlib, re
base=pathlib.Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_ROOT_LAUNCH_R5')
m=json.loads((base/'data/ADDITIONS_3MF_ID_MAP.json').read_text(encoding='utf-8'))
f=json.loads((base/'data/FROZEN_ADDITIONS.json').read_text(encoding='utf-8'))
a=json.loads((base/'data/ADDED.json').read_text(encoding='utf-8'))
def ids(x):return [str(q.get('id')) for q in x]
mi,fi,ai=ids(m),ids(f),ids(a)
path=base/'source/ROOT_AND_LR_ADDITIONS.model'
counts={'vertex':0,'triangle':0};tail=b''
with path.open('rb') as s:
 while b:=s.read(4*1024*1024):
  block=tail+b
  for tag in counts:counts[tag]+=block.count(b'<'+tag.encode()+b' ')
  tail=block[-32:]
r={'addition_map':{'records':len(mi),'unique_ids':len(set(mi)),'duplicate_ids':sorted({x for x in mi if mi.count(x)>1}),'sum_vertices':sum(int(q['vertices']) for q in m),'sum_triangles':sum(int(q['triangles']) for q in m),'max_vertex_end':max(int(q['first_vertex'])+int(q['vertices']) for q in m),'max_triangle_end':max(int(q['first_triangle'])+int(q['triangles']) for q in m)},'frozen_additions':{'records':len(fi),'unique_ids':len(set(fi)),'duplicate_ids':sorted({x for x in fi if fi.count(x)>1}),'map_intersection_count':len(set(mi)&set(fi)),'map_missing_ids':len(set(fi)-set(mi))},'added_record':{'records':len(ai),'unique_ids':len(set(ai)),'duplicate_ids':sorted({x for x in ai if ai.count(x)>1}),'map_intersection_count':len(set(mi)&set(ai)),'frozen_intersection_count':len(set(fi)&set(ai))},'native_addition_model_xml_counts':counts,'repack_audit_expected':{'vertices':909824,'triangles':1798924}}
print(json.dumps(r,indent=2))

