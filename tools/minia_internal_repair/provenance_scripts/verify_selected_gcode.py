import json, pathlib, collections, time
B=pathlib.Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_MINIA_TERMINAL_REVIEW_20260922')
OUT=pathlib.Path(__file__).resolve().parents[1]/'outputs'
idx=json.loads((B/'GCODE_LAYER_INDEX.json').read_text())
review=json.loads((B/'representative_review_F3457.json').read_text())
keys=['first_flower_section_deposition','first_root_section_deposition','first_anchor_zone_deposition']
targets={review[k]['line']:k for k in keys}
records={k:{'legacy_event':review[k],'commands':[]} for k in keys}
start=time.perf_counter(); layer=0; z=None; feature=None; width=None; e_mode=None
with open(idx['source'],'rb') as f:
 for lineno,raw in enumerate(f,1):
  if raw.startswith(b'; CHANGE_LAYER'): layer+=1
  elif raw.startswith(b'; Z_HEIGHT:'): z=float(raw.split(b':',1)[1])
  elif raw.startswith(b'; FEATURE:'): feature=raw.split(b':',1)[1].decode().strip()
  elif raw.startswith(b'; LINE_WIDTH:'): width=float(raw.split(b':',1)[1])
  elif raw.strip() in (b'M82',b'M83'): e_mode=raw.strip().decode()
  for n,k in targets.items():
   if abs(lineno-n)<=3:
    records[k]['commands'].append({'line':lineno,'text':raw.decode().strip()})
   if lineno==n:
    records[k]['measured_state']={'layer':layer,'machine_layer_z_mm':z,'feature':feature,'line_width_mm':width,'extrusion_mode':e_mode}
    records[k]['layer_z_matches_legacy']=layer==review[k]['layer'] and z==review[k]['z']
  if lineno>max(targets)+3: break
result={'state':'SELECTED_COMMANDS_READ_ONLY_CHECKED','source':idx['source'],'source_sha256_previously_measured':idx['sha256'],'region':'F3457 DEMO; physical broken region unknown','events':records,'elapsed_s':time.perf_counter()-start,'model_z_mapping':{'status':'ASSUMED_NOT_VERIFIED','machine_z_minus_model_z_mm':0.6},'legacy_geometry_scope':review['scope_limit'],'route_toolpath_status':'UNRESOLVED','limitations':['Selected command identity and recorded layer state only; no bed-rooted ancestry proof.','Legacy local finite-width overlap results are retained as scoped prior evidence, not newly recomputed.','No exclusive member attribution; no full independent-route prefix check.','No new slicing; additions remain TOOLPATH_UNVERIFIED.']}
(OUT/'GCODE_SELECTED_EVENT_CHECK.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'events':{k:v.get('layer_z_matches_legacy') for k,v in records.items()},'elapsed_s':result['elapsed_s']}))
