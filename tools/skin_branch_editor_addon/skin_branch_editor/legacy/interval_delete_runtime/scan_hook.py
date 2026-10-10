def scan_state(scene=None,allow_registry_init=True):
 scene=scene or bpy.context.scene;obj=bpy.data.objects.get(ANCHOR)
 if obj is None:raise RuntimeError('AUTHOR_EDIT_ALL missing')
 cache,_,_,_=_read_data(scene);ledger,_=route_v2_panel._load_ledger(scene);expected=route_v2_panel._expected_rows(ledger['records'])
 bm,layers,verts,edges,faces=_mesh_data(obj)
 if faces:raise RuntimeError('面が追加されています。Ctrl+Zで面を取り消してください。')
 if len(verts)<len(expected):raise RuntimeError(f'original anchors missing: expected {len(expected)}, found {len(verts)}')
 roots=_registry(scene)
 if not scene.get('midpoint_author_root_registry') and allow_registry_init: roots=[]
 actual_refs={o.name:route_v2_panel._reference_fingerprint(o) for o in bpy.data.objects if o.get('source_reference')}
 try:expected_refs=json.loads(scene['source_reference_fingerprints'])
 except Exception as e:raise RuntimeError('source fingerprint manifest missing: '+repr(e))
 if set(actual_refs)!=set(expected_refs) or any(actual_refs.get(k)!=v for k,v in expected_refs.items()):raise RuntimeError('protected source geometry/reference fingerprint changed')
 base_by_index={};id_by_index={};id_to_pos={};mid_records={};verts_by_index={}
 seen_base=set();base_count=0
 for i,v in enumerate(verts):
  ai=_ival(layers,i,'anchor_index',v);kind=_ival(layers,i,'midpoint_kind',v);seg=_ival(layers,i,'midpoint_segment_index',v);rooti=_ival(layers,i,'midpoint_author_root',v);t=_fval(layers,i,'midpoint_t',v)
  pos=list(_world(obj,v.co))
  if ai>=0:
   if ai>=len(expected) or ai in seen_base:raise RuntimeError('original anchor IDs missing/duplicated/reindexed')
   if kind!=KIND_BASE:raise RuntimeError('original anchor provenance tag changed')
   row=expected[ai]
   if not _near(pos,row['coord'],1e-7):raise RuntimeError(f'protected anchor moved: {row["anchor_id"]}')
   seen_base.add(ai);base_count+=1;sid=_base_id(row);id_to_pos[sid]=pos;base_by_index[ai]=sid
  else:
   if kind not in (KIND_SOURCE,KIND_AUTHOR):raise RuntimeError('unprovenanced free vertex detected')
   if kind==KIND_SOURCE:
    if not 0<=seg<len(cache['segments']) or rooti!=-1 or not 0.000001<t<.999999:raise RuntimeError('invalid source-segment provenance')
    sid=_source_mid_id(seg,t);want=_interp(cache['segments'][seg]['a'],cache['segments'][seg]['b'],t)
    if not _near(pos,want,1e-4):raise RuntimeError(f'source midpoint off locked segment: {sid}')
    rec={'kind':'source_segment','segment_index':seg,'t':t,'position':pos,'vertex_index':i,'stable_id':sid}
   else:
    if rooti<0 or not 0<=rooti<len(roots) or seg!=-1 or not 0.000001<t<.999999:raise RuntimeError('invalid author-edge provenance')
    rec={'kind':'author_edge','root_index':rooti,'t':t,'position':pos,'vertex_index':i}
    sid=None
   mid_records[i]=rec
   if sid is not None:
    if sid in id_to_pos:raise RuntimeError('duplicate midpoint identity')
    id_to_pos[sid]=pos
  id_by_index[i]=sid if ai>=0 or kind==KIND_SOURCE else None
  verts_by_index[i]={'position':pos,'anchor_index':ai,'kind':kind,'segment_index':seg,'root_index':rooti,'t':t}
 if len(seen_base)!=len(expected):raise RuntimeError(f'original anchors incomplete: expected {len(expected)}, found {len(seen_base)}')
 for i,r in mid_records.items():
  if r['kind']=='author_edge':
   root=roots[r['root_index']];sid=_author_mid_id(root['root_id'],r['t']);r['stable_id']=sid
   if sid in id_to_pos:raise RuntimeError('duplicate author midpoint identity')
   id_to_pos[sid]=r['position'];id_by_index[i]=sid
 # Resolve root endpoints recursively. A midpoint can only reference an earlier root.
 resolving=set();resolved={}
 def resolve(sid):
  if sid in resolved:return resolved[sid]
  if sid in id_to_pos and not sid.startswith('AMID:'):return id_to_pos[sid]
  if not sid.startswith('AMID:') or sid in resolving:raise RuntimeError('cyclic or unresolved author midpoint provenance: '+sid)
  rec=next((x for x in mid_records.values() if x.get('stable_id')==sid),None)
  if rec is None:raise RuntimeError('author midpoint registry entry missing: '+sid)
  root=roots[rec['root_index']];resolving.add(sid)
  a=resolve(root['a_id']);b=resolve(root['b_id'])
  if not _near(root['a_position'],a,1e-4) or not _near(root['b_position'],b,1e-4):raise RuntimeError('author root endpoint coordinate mismatch')
  want=_interp(a,b,rec['t'])
  if not _near(rec['position'],want,1e-4):raise RuntimeError('author midpoint moved off its registered root line')
  resolving.remove(sid);resolved[sid]=want;return want
 for ri,rec in enumerate(roots):
  if rec.get('root_id')!=_root_id(rec.get('a_id'),rec.get('b_id')):raise RuntimeError('author root ID hash mismatch')
  resolve(rec['a_id']);resolve(rec['b_id'])
  cuts=rec.get('cuts',[]);ts=[float(c['t']) for c in cuts]
  if ts!=sorted(ts) or len(set(round(x,8) for x in ts))!=len(ts):raise RuntimeError('author root cuts unordered/duplicated')
  for c in cuts:
   sid=_author_mid_id(rec['root_id'],c['t'])
   r=next((x for x in mid_records.values() if x.get('stable_id')==sid),None)
   if r is None or r['root_index']!=ri:raise RuntimeError('registry cut has no corresponding anchor vertex')
   resolve(sid)
 author_mids=[r for r in mid_records.values() if r['kind']=='author_edge']
 if len(author_mids)!=sum(len(r.get('cuts',[])) for r in roots):raise RuntimeError('orphaned/missing author midpoint registry cut')
 if not scene.get('midpoint_author_root_registry') and allow_registry_init: _store_registry(scene,roots)
 edge_rows=[]
 for e in edges:
  if hasattr(e,'verts'):vi=[v.index for v in e.verts]
  else:vi=list(e.vertices)
  if any(x not in id_by_index or id_by_index[x] is None for x in vi):raise RuntimeError('edge endpoint has no stable anchor ID')
  a,b=(id_by_index[vi[0]],id_by_index[vi[1]])
  if a==b:raise RuntimeError('self-edge is unsupported')
  edge_rows.append({'ids':tuple(sorted((a,b))),'indices':tuple(vi),'a_position':verts_by_index[vi[0]]['position'],'b_position':verts_by_index[vi[1]]['position']})
 # Every existing root interval must remain in the mesh. Any new pair of
 # protected endpoint IDs is a new author root edge, including legacy files.
 _interval_delete.validate(scene, roots, cache)
 mapped=set()
 for ri,r in enumerate(roots):
  chain=[(r['a_id'],0.0)]+[(c['id'],float(c['t'])) for c in r.get('cuts',[])]+[(r['b_id'],1.0)]
  for (a,t0),(b,t1) in zip(chain,chain[1:]):mapped.add(tuple(sorted((a,b))))
 actual=set(x['ids'] for x in edge_rows)
 for pair in mapped:
  if pair not in actual and not _interval_delete.deleted_pair(scene, roots, pair):raise RuntimeError('author root interval edge is missing from ALL mesh')
 changed=False
 for edge in sorted(edge_rows,key=lambda x:x['ids']):
  if edge['ids'] in mapped:continue
  a,b=edge['ids'];apos=id_to_pos[a];bpos=id_to_pos[b];rid=_root_id(a,b)
  if any(r['root_id']==rid for r in roots):raise RuntimeError('duplicate author root')
  roots.append({'root_id':rid,'a_id':a,'b_id':b,'a_position':apos,'b_position':bpos,'cuts':[]});mapped.add(edge['ids']);changed=True
 if changed or not scene.get('midpoint_author_root_registry'):
  if not allow_registry_init and changed:raise RuntimeError('unregistered author edges detected')
  _store_registry(scene,roots)
 return {'obj':obj,'bm':bm,'layers':layers,'expected':expected,'cache':cache,'score':_read_data(scene)[1],'roots':roots,'id_to_pos':id_to_pos,'id_by_index':id_by_index,'mid_records':mid_records,'edge_rows':edge_rows,'base_by_index':base_by_index,'verts_by_index':verts_by_index}
