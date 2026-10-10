import bpy,ast,hashlib,struct,json,sys
from pathlib import Path
out=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs');work=out.parent/'work'/'support_color_display'
score=json.loads((out/'SUPPORT_DISTANCE_COLORS.json').read_text(encoding='utf-8-sig'))
tree=ast.parse((work/'build_display.py').read_text(encoding='utf-8-sig'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='source_fingerprint');ns={'bpy':bpy,'hashlib':hashlib,'struct':struct};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(work/'build_display.py'),'exec'),ns);fingerprint,source_count=ns['source_fingerprint']()
scene=bpy.context.scene;collection=bpy.data.collections['DISPLAY_ONLY • support-distance colors'];display=[o for o in collection.objects if o.get('branch_ids_json')]
ids=set();segments=0;bad=[]
for o in display:
 ids.update(json.loads(o['branch_ids_json']));segments+=len(o.data.splines)
 if o.type!='CURVE' or not o.get('display_only') or o.get('manufacturing_geometry') is not False or abs(float(o.data.bevel_depth)-.07)>1e-6:bad.append(o.name)
 if int(o.get('color_bin',-2))>=0:
  mat=o.data.materials[0] if o.data.materials else None;pal=score['palette'][int(o['color_bin'])]
  if not mat or max(abs(float(mat.diffuse_color[k])-float(pal[k])) for k in range(3))>1e-5:bad.append('material:'+o.name)
ledger=json.loads(__import__('zlib').decompress(__import__('base64').b64decode(''.join(bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string().split()))));expected={r['id'] for r in ledger['records']}
source_objects=[o for o in bpy.data.objects if o.get('source_reference')]
result={'status':'FRESH_REOPEN_PASS','blend':bpy.data.filepath,'branch_count_expected':len(expected),'branch_count_displayed':len(ids),'display_subsegments':segments,'score_subsegments':len(score['segments']),'color_bins':len(display),'source_reference_objects':source_count,'protected_fingerprint_matches_scene':fingerprint==scene.get('protected_source_fingerprint_sha256'),'protected_fingerprint':fingerprint,'all_source_refs_hidden':all(o.hide_viewport and o.hide_render for o in source_objects),'display_only_curves_valid':not bad,'display_issues':bad,'manufacturing_geometry_changed':scene.get('manufacturing_geometry_changed'),'support_assumed_present':scene.get('support_finished_geometry_with_support_assumed'),'gray_semantics':scene.get('support_distance_gray_semantics'),'score_hash_matches':scene.get('support_score_json_sha256')==hashlib.sha256((out/'SUPPORT_DISTANCE_COLORS.json').read_bytes()).hexdigest()}
assert result['branch_count_expected']==9421 and result['branch_count_displayed']==9421
assert result['display_subsegments']==35303 and result['protected_fingerprint_matches_scene'] and result['all_source_refs_hidden'] and result['display_only_curves_valid'] and result['score_hash_matches']
(out/'SUPPORT_DISTANCE_COLORS_FRESH_REOPEN.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(result,indent=2,ensure_ascii=False),flush=True)
