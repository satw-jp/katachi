import json
p=json.load(open('work/luna_binding/MISMATCH_AND_TAIL_PROBE_DETAILED.json',encoding='utf-8'))
for r in p['native_faces_and_vertices']:
 if r['native_face']==p['mismatch_native_and_source_index'] or r['native_face']>=p['native_face_count']-4:
  print('native',r['native_face'],'same',r['same_index_any_permutation_error_mm'],'tailmatches',[(x['source_face'],x['permutation_error_mm']) for x in r['source_tail_matches']])
