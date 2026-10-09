"""Blender N-panel integration for the MINI_A layer-wise holding-route backend."""
import bpy,sys,json,hashlib,base64,zlib,struct,time,math
from pathlib import Path
from mathutils import Vector
from bpy.app.handlers import persistent
from bpy.props import FloatProperty,EnumProperty
import route_overlay

ROOT_NAME='ROUTE_OVERLAY';PANEL_CATEGORY='MINI_A 保持ルート';CTX=None;ROOT=None;_LAST_GRAPH=None;_BUSY=False;_REGISTERED=False;_INITIALIZED=False;_FAILURE_ITEM_MAP={}
ANCHOR_NAMES=('AUTHOR_EDIT_ALL • protected point baseline','AUTHOR_EDIT_DEMO • 24 endpoints, select two then F')
DEMO_MEMBER_IDS=('G0165','C0016','G0181','C0031','A3457','LR002','R5_F3457_P1','R5_F3457_P2','R5_F3457_P3','R5_F3457_P4','R5_F3457_P5','R5_F3457_P6')

def _file_sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()

def _expected_rows(rows):
 return [{'anchor_id':r['id']+':'+ep,'record_id':r['id'],'endpoint':ep,'coord':[struct.unpack('<f',struct.pack('<f',float(v)))[0] for v in p]} for r in rows for ep,p in [('START',r['points_plate_mm'][0]),('END',r['points_plate_mm'][-1])]]

def _reference_fingerprint(o):
 payload={'name':o.name,'type':o.type,'matrix':[[round(float(v),9) for v in row] for row in o.matrix_world]}
 payload['identity']={k:o.get(k) for k in ('ids','flower_id','source_record_count','source_object_count','source_point_count','count') if k in o}
 if o.type=='MESH':
  d=o.data;payload['vertices']=[[round(float(v),7) for v in x.co] for x in d.vertices];payload['edges']=[list(e.vertices) for e in d.edges];payload['polygons']=[list(p.vertices) for p in d.polygons]
  attrs=[]
  for a in sorted(d.attributes,key=lambda x:x.name):
   vals=[]
   for x in a.data:
    if hasattr(x,'value'):v=x.value
    elif hasattr(x,'vector'):v=list(x.vector)
    elif hasattr(x,'color'):v=list(x.color)
    else:v=None
    if isinstance(v,(float,int)):v=round(float(v),7)
    elif v is not None and not isinstance(v,(str,bool)):
     try:v=[round(float(q),7) for q in v]
     except TypeError:v=str(v)
    vals.append(v)
   attrs.append({'name':a.name,'domain':a.domain,'data_type':a.data_type,'values':vals})
  payload['attributes']=attrs
 elif o.type=='CURVE':
  payload['splines']=[{'type':s.type,'points':[[round(float(v),7) for v in p.co] for p in (s.points if s.type=='POLY' else s.bezier_points)]} for s in o.data.splines]
 return hashlib.sha256(json.dumps(payload,separators=(',',':'),sort_keys=True).encode()).hexdigest()

def _ensure_context(scene=None,runtime_path=None):
 global CTX,ROOT
 scene=scene or bpy.context.scene
 stored=scene.get('route_output_root')
 if not stored:stored=str(Path(bpy.data.filepath).resolve().parent)
 root=Path(stored).resolve()
 dev=Path(runtime_path).resolve() if runtime_path else None
 if CTX is not None and ROOT==root and (dev is None or getattr(CTX,'_module_path',None)==str(dev)):return CTX
 runtime=dev or Path(__file__).resolve().parents[1]/'route_visualizer'
 if str(runtime) not in sys.path:sys.path.insert(0,str(runtime))
 for key in ('real_graph','route_analysis'):
  if key in sys.modules:del sys.modules[key]
 from real_graph import Context
 CTX=Context(root);CTX._module_path=str(runtime);ROOT=root
 return CTX

def _inputs(scene):return float(scene.route_height),str(scene.route_mode)

def _set_stale(scene,reason='INPUT_CHANGED'):
 scene['route_stale']=True;scene['route_state']='STALE';scene['route_stale_reason']=reason
 scene['route_summary_json']='';scene['route_before_json']='';scene['route_after_json']=''
 scene['route_interval_comparison_json']=''
 route_overlay.hide_overlay(True)

def _poll_external_inputs(scene):
 global CTX,ROOT
 if CTX is None:return
 try:
  if CTX.inputs_changed():_set_stale(scene,'LOCKED_SOURCE_OR_CONTACT_INPUT_CHANGED')
 except Exception as e:
  _set_stale(scene,'SOURCE_INPUT_POLL_FAILED');scene['route_state']='HOLD';scene['route_guard_issues_json']=json.dumps([repr(e)])

def _anchor_signature():
 import bmesh
 parts=[]
 for name in ANCHOR_NAMES:
  obj=bpy.data.objects.get(name)
  if obj is None:parts.append((name,None));continue
  if bpy.context.mode=='EDIT_MESH' and obj.mode=='EDIT':
   bm=bmesh.from_edit_mesh(obj.data);verts=[(v.index,tuple(round(float(c),7) for c in v.co)) for v in bm.verts];edges=sorted(tuple(sorted(e.verts[i].index for i in range(2))) for e in bm.edges)
  else:
   verts=[(v.index,tuple(round(float(c),7) for c in v.co)) for v in obj.data.vertices] if obj.type=='MESH' else []
   edges=sorted(tuple(sorted(e.vertices)) for e in obj.data.edges) if obj.type=='MESH' else []
  matrix=tuple(round(float(v),8) for row in obj.matrix_world for v in row)
  parts.append((name,matrix,verts,edges))
 return hashlib.sha256(repr(parts).encode()).hexdigest()

def poll_ui_state():
 """Timer-safe invalidation; the UI draw function stays read-only."""
 if not _REGISTERED:return None
 scene=bpy.context.scene
 if scene is None:return 1.0
 if bpy.context.mode=='EDIT_MESH':
  if scene.get('route_state')!='STALE':_set_stale(scene,'EDIT_MODE_ACTIVE')
  else:route_overlay.hide_overlay(True)
  return 0.75
 try:
  if CTX is not None and CTX.inputs_changed():
   if scene.get('route_state')!='STALE':_set_stale(scene,'LOCKED_SOURCE_OR_CONTACT_INPUT_CHANGED')
  signature=_anchor_signature();baseline=scene.get('route_anchor_signature')
  if baseline and signature!=baseline and scene.get('route_state')!='STALE':_set_stale(scene,'AUTHOR_ANCHOR_TOPOLOGY_OR_COORDINATES_CHANGED')
 except Exception as e:
  if scene.get('route_state')!='HOLD':_set_stale(scene,'POLL_FAILED');scene['route_state']='HOLD';scene['route_guard_issues_json']=json.dumps([repr(e)])
 return 0.75

def mark_stale(scene=None,reason='INPUT_CHANGED'):
 _set_stale(scene or bpy.context.scene,reason)

def _property_changed(self,context):
 global _BUSY
 if _BUSY:return
 scene=context.scene if context else bpy.context.scene
 if scene is None:return
 if hasattr(scene,'route_height'):
  h=round(float(scene.route_height)*5.0)/5.0
  if abs(h-float(scene.route_height))>1e-6:
   _BUSY=True
   try:scene.route_height=h
   finally:_BUSY=False
 item=_FAILURE_ITEM_MAP.get(getattr(scene,'route_failure_id',''))
 if item and item[0]==getattr(scene,'route_failure_kind','branch'):
  scene['route_failure_real_id']=item[1];scene['route_failure_real_kind']=item[0]
 _set_stale(scene,'HEIGHT_MODE_OR_FAILURE_SELECTION_CHANGED')

def _active_summary(scene=None):
 scene=scene or bpy.context.scene
 try:return json.loads(scene.get('route_summary_json','{}'))
 except Exception:return {}

def _component_center(d):
 bb=d.get('bbox')
 if not bb:return None
 return [(bb[0][k]+bb[1][k])*.5 for k in range(3)]

def _failure_items(self,context):
 global _FAILURE_ITEM_MAP
 global _LAST_GRAPH
 scene=context.scene if context else bpy.context.scene
 kind=getattr(scene,'route_failure_kind','branch') if scene else 'branch'
 ids=set();available=set()
 if _LAST_GRAPH is not None:
  if kind=='branch':
   for _,d in _LAST_GRAPH.nodes(data=True):
    if d.get('branch_id'):available.add(d['branch_id'])
    bid=d.get('branch_id');c=_component_center(d)
    if bid and c and abs(c[0]-37)<48 and abs(c[1]-96)<48:ids.add(bid)
  else:
   for a,b,d in _LAST_GRAPH.edges(data=True):
    if d.get('joint_id'):available.add(d['joint_id'])
    jid=d.get('joint_id');ca=_component_center(_LAST_GRAPH.nodes[a]);cb=_component_center(_LAST_GRAPH.nodes[b])
    if jid and ca and cb and max(abs(ca[0]-37),abs(ca[1]-96),abs(cb[0]-37),abs(cb[1]-96))<52:ids.add(jid)
 curated=['A3457','G0181','C0016','S002463','T00661','T00673','X03430','S002400','R0001'] if kind=='branch' else ['G0181|A3457','F3457|T00673','S002463|T00673','BASE:S002463','S002400|X03430','BASE:R0001']
 ids.update(x for x in curated if _LAST_GRAPH is None or x in available)
 ordered=[x for x in curated if x in ids]+sorted(ids-set(curated))
 if not ordered:ordered=curated
 scene=context.scene if context else bpy.context.scene
 current=(scene.get('route_failure_real_kind'),scene.get('route_failure_real_id')) if scene and scene.get('route_failure_real_id') else None
 absent=set()
 if current and current[0]==kind and current[1] not in ordered:
  ordered.append(current[1]);absent.add(current[1])
 items=[];mapping={}
 for value in ordered:
  token='FAIL_'+hashlib.sha256((kind+'|'+value).encode()).hexdigest()[:16].upper()
  number=int(hashlib.sha256((kind+'|'+value).encode()).hexdigest()[:8],16)&0x7fffffff
  mapping[token]=(kind,value);label=value+('（対象高さでは未出現）' if value in absent else '')
  items.append((token,label,'Stable failure ID; not present at current height' if value in absent else 'Local graph failure candidate','ERROR',number))
 _FAILURE_ITEM_MAP.update(mapping)
 return items

def _selected_failure(scene):
 kind=scene.get('route_failure_real_kind');identity=scene.get('route_failure_real_id')
 if identity and kind==getattr(scene,'route_failure_kind','branch'):return {'kind':kind,'id':identity}
 return None

def _load_ledger(scene):
 text=bpy.data.texts.get('MINIA_SOURCE_LEDGER.zlib.base64')
 if text is None:raise RuntimeError('Embedded V1 source ledger is missing')
 raw=zlib.decompress(base64.b64decode(''.join(text.as_string().split())))
 digest=hashlib.sha256(raw).hexdigest()
 if digest!=scene.get('source_ledger_sha256'):raise RuntimeError('Embedded source ledger hash mismatch')
 return json.loads(raw),digest

def _mesh_records(o,rows):
 expected=_expected_rows(rows);m=o.data;attr=m.attributes.get('anchor_index')
 if attr is None:return None,[],[f'{o.name}: anchor_index attribute missing']
 values=[int(x.value) for x in attr.data];vertices=list(m.vertices);edges=[tuple(e.vertices) for e in m.edges]
 if bpy.context.mode=='EDIT_MESH' and bpy.context.view_layer.objects.active==o:
  import bmesh
  bm=bmesh.from_edit_mesh(m);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table();layer=bm.verts.layers.int.get('anchor_index')
  if layer is not None:
   values=[int(v[layer]) for v in bm.verts];vertices=list(bm.verts);edges=[tuple(v.index for v in e.verts) for e in bm.edges]
 if len(vertices)!=len(expected) or len(values)!=len(expected):return None,[],[f'{o.name}: expected {len(expected)} anchors, found {len(vertices)}']
 if len(set(values))!=len(expected) or set(values)!=set(range(len(expected))):return None,[],[f'{o.name}: anchor IDs missing, duplicated or reindexed']
 moved=[]
 for vi,ai in enumerate(values):
  actual=o.matrix_world@vertices[vi].co;want=expected[ai]['coord']
  if max(abs(float(actual[k])-want[k]) for k in range(3))>1e-7:moved.append(expected[ai]['anchor_id'])
 if moved:return None,[],[f'{o.name}: protected anchors moved: {moved[:8]}']
 return expected,[(values[a],values[b]) for a,b in edges],[]

def extract_current_edits(scene=None):
 scene=scene or bpy.context.scene;ledger,ledger_sha=_load_ledger(scene);records=ledger['records'];byid={r['id']:r for r in records};demo_ids=ledger.get('demo',{}).get('member_ids',[]);demo_rows=[byid[x] for x in demo_ids if x in byid]
 all_obj=bpy.data.objects.get(ANCHOR_NAMES[0]);demo_obj=bpy.data.objects.get(ANCHOR_NAMES[1]);issues=[];edges={}
 for obj,rows in ((all_obj,records),(demo_obj,demo_rows)):
  if obj is None:issues.append('Missing author anchor object');continue
  expected,pairs,errs=_mesh_records(obj,rows);issues.extend(errs)
  if errs:continue
  for i,j in pairs:
   if i<0 or j<0 or i>=len(expected) or j>=len(expected) or i==j:issues.append(f'{obj.name}: unsupported edge indices {(i,j)}');continue
   a,b=expected[i],expected[j];ordered=sorted((a,b),key=lambda x:x['anchor_id']);aid=[x['anchor_id'] for x in ordered]
   branch='AUT-'+hashlib.sha256('|'.join(aid).encode()).hexdigest()[:12].upper()
   edges[branch]={'id':branch,'a_member':ordered[0]['record_id'],'a_parameter':0 if ordered[0]['endpoint']=='START' else len(byid[ordered[0]['record_id']]['source_record']['points_mm'])-1,'a_position':ordered[0]['coord'],'b_member':ordered[1]['record_id'],'b_parameter':0 if ordered[1]['endpoint']=='START' else len(byid[ordered[1]['record_id']]['source_record']['points_mm'])-1,'b_position':ordered[1]['coord'],'endpoint_anchor_ids':aid}
 try:expected_refs=json.loads(scene['source_reference_fingerprints'])
 except Exception as e:expected_refs={};issues.append(f'Source fingerprint ledger missing: {e}')
 actual_refs={o.name:_reference_fingerprint(o) for o in bpy.data.objects if o.get('source_reference')}
 missing=sorted(set(expected_refs)-set(actual_refs));changed=sorted(k for k,v in expected_refs.items() if k in actual_refs and actual_refs[k]!=v);added=sorted(set(actual_refs)-set(expected_refs))
 if missing or changed or added:issues.append(f'Source references changed: missing={missing}, changed={changed}, added={added}')
 return {'issues':issues,'edits':[edges[k] for k in sorted(edges)],'edge_count':len(edges),'ledger_sha256':ledger_sha,'edit_sha256':hashlib.sha256(json.dumps([edges[k] for k in sorted(edges)],sort_keys=True,separators=(',',':')).encode()).hexdigest()}

def _target_summary(result):
 return [{'target':r.get('target'),'status':r.get('status'),'graph_count':r.get('graph_count'),'lower':r.get('lower'),'upper':r.get('upper'),'verified_model_geometry_route_lower_bound':r.get('verified_model_geometry_route_lower_bound'),'common_branch_failures':r.get('common_branch_failures',[]),'common_joint_failures':r.get('common_joint_failures',[]),'witnesses':[{'branch_ids':w.get('branch_ids',[]),'joint_ids':w.get('joint_ids',[]),'evidence_levels':w.get('evidence_levels',[]),'bearing_assumption':w.get('bearing_assumption',False)} for w in r.get('witnesses',[])]} for r in result.get('targets',[])]

def _result_payload(result):
 impact=result.get('failure_impact') or {}
 return {'cache_key':result.get('cache_key'),'height_mm':result.get('model_z_mm'),'mode':result.get('mode'),'targets':_target_summary(result),'node_count':result.get('node_count'),'edge_count':result.get('edge_count'),'evidence_level':result.get('evidence_level'),'scope':result.get('scope'),'toolpath_status':result.get('toolpath_status'),'raft_mapping':result.get('raft_mapping'),'physical_strength':result.get('physical_strength'),'unresolved_attachment_count':len(result.get('unresolved_selected_attachments',[])),'new_branch_count':result.get('new_branch_count'),'base_connected_branch_count':result.get('base_connected_branch_count'),'base_connected_flower_count':result.get('base_connected_flower_count'),'connected_count_scope':result.get('connected_count_scope'),'base_ids':result.get('base_ids'),'permanent_base_member_ids':result.get('permanent_base_member_ids'),'base_semantics':result.get('base_semantics'),'failure_impact':impact,'elapsed_s':result.get('elapsed_s')}

def compare_height_events(scene=None,runtime_path=None):
 scene=scene or bpy.context.scene;ctx=_ensure_context(scene,runtime_path);audit=extract_current_edits(scene)
 if audit['issues']:
  _set_stale(scene,'SOURCE_GUARD_HOLD');scene['route_state']='HOLD';scene['route_guard_issues_json']=json.dumps(audit['issues'],ensure_ascii=False);return {'status':'HOLD','issues':audit['issues']}
 if ctx.inputs_changed():
  global CTX,ROOT
  CTX=None;ROOT=None;ctx=_ensure_context(scene,runtime_path)
 mode=scene.route_mode
 try:before=ctx.height_events(mode,());after=ctx.height_events(mode,audit['edits'])
 except Exception as e:
  _set_stale(scene,'HEIGHT_EVENT_HOLD');scene['route_state']='HOLD';scene['route_guard_issues_json']=json.dumps([repr(e)],ensure_ascii=False);return {'status':'HOLD','issues':[repr(e)]}
 result={'status':'CURRENT','mode':mode,'before':before,'after':after,'edit_count':audit['edge_count'],'edit_sha256':audit['edit_sha256'],'basis':'Conditional supplied-graph event estimates under monotonicity after the stable single F3457 component; not actual physical/toolpath holding history.'}
 scene['route_interval_comparison_json']=json.dumps(result,separators=(',',':'),ensure_ascii=False);scene['route_interval_state']='CURRENT';return result

def reevaluate(scene=None,runtime_path=None):
 global _LAST_GRAPH,_BUSY
 scene=scene or bpy.context.scene
 if bpy.context.mode=='EDIT_MESH':
  _set_stale(scene,'EXIT_EDIT_MODE_BEFORE_REEVALUATION');scene['route_state']='HOLD';scene['route_stale_reason']='Exit Edit Mode, then explicitly reevaluate';return {'status':'HOLD','reason':'EXIT_EDIT_MODE'}
 started=time.perf_counter()
 try:
  ctx=_ensure_context(scene,runtime_path)
  if ctx.inputs_changed():
   global CTX,ROOT
   CTX=None;ROOT=None;ctx=_ensure_context(scene,runtime_path)
  audit=extract_current_edits(scene)
  if audit['issues']:
   _set_stale(scene,'SOURCE_GUARD_HOLD');scene['route_state']='HOLD';scene['route_guard_issues_json']=json.dumps(audit['issues'],ensure_ascii=False);return {'status':'HOLD','issues':audit['issues']}
  h,mode=_inputs(scene);failure=_selected_failure(scene)
  before=ctx.evaluate(h,mode,(),failure);after=ctx.evaluate(h,mode,audit['edits'],failure)
  _LAST_GRAPH=ctx.cache[after['cache_key']][0]
  before_payload=_result_payload(before);after_payload=_result_payload(after)
  summary={'status':'CURRENT','model_height_plate_z_mm':h,'mode':mode,'selected_region':'F3457 DEMO; physical damage location unknown','failure_selection':failure,'evidence_level':after.get('evidence_level'),'toolpath_status':after.get('toolpath_status'),'raft_mapping':after.get('raft_mapping'),'physical_strength':after.get('physical_strength'),'baseline_sha256':after.get('baseline_sha256'),'contact_ledger_sha256':after.get('contact_ledger_sha256'),'ledger_sha256':audit['ledger_sha256'],'edit_sha256':audit['edit_sha256'],'edit_count':audit['edge_count'],'before':before_payload,'after':after_payload,'elapsed_total_s':time.perf_counter()-started,'physical_route_count':'UNVERIFIED'}
  summary['overlay']=route_overlay.rebuild(ctx,after,before,audit['edits'])
  _BUSY=True
  try:
   scene['route_summary_json']=json.dumps(summary,separators=(',',':'),ensure_ascii=False);scene['route_before_json']=json.dumps(before_payload,separators=(',',':'),ensure_ascii=False);scene['route_after_json']=json.dumps(after_payload,separators=(',',':'),ensure_ascii=False);scene['route_stale']=False;scene['route_state']='CURRENT';scene['route_stale_reason']='';scene['route_guard_issues_json']='[]';scene['route_cache_key']=after['cache_key'];scene['route_edit_sha256']=audit['edit_sha256'];scene['route_anchor_signature']=_anchor_signature();scene['route_evaluation_seconds']=float(time.perf_counter()-started)
  finally:_BUSY=False
  return summary
 except Exception as e:
  _set_stale(scene,'EVALUATION_ERROR');scene['route_state']='HOLD';scene['route_guard_issues_json']=json.dumps([repr(e)],ensure_ascii=False);return {'status':'HOLD','error':repr(e),'elapsed_s':time.perf_counter()-started}

def _on_height_update(self,context):
 if context and context.scene:_property_changed(self,context)

def _on_mode_update(self,context):
 if context and context.scene:_property_changed(self,context)

def _on_failure_kind_update(self,context):
 global _BUSY
 if not context or not context.scene:return
 scene=context.scene;kind=scene.route_failure_kind
 preferred='A3457' if kind=='branch' else 'G0181|A3457'
 items=_failure_items(None,context);token=next((x[0] for x in items if _FAILURE_ITEM_MAP.get(x[0])==(kind,preferred)),items[0][0] if items else '')
 _BUSY=True
 try:
  if token:scene.route_failure_id=token;item=_FAILURE_ITEM_MAP.get(token);scene['route_failure_real_id']=item[1] if item else '';scene['route_failure_real_kind']=kind
 finally:_BUSY=False
 _property_changed(self,context)

class MINI_A_OT_route_reevaluate(bpy.types.Operator):
 bl_idname='mini_a.route_reevaluate';bl_label='再評価';bl_description='現高さ・mode・明示した枝差分で全体graphを再評価します'
 def execute(self,context):
  result=reevaluate(context.scene)
  if result.get('status')=='CURRENT':self.report({'INFO'},'再評価しました（物理保持能力は未確認）');return {'FINISHED'}
  self.report({'WARNING'},'HOLD: '+str(result.get('reason') or result.get('error') or '; '.join(result.get('issues',[]))));return {'CANCELLED'}

class MINI_A_OT_route_height_events(bpy.types.Operator):
 bl_idname='mini_a.route_height_events';bl_label='高さ区間を比較';bl_description='明示操作で編集前後のlayer-event estimateを走査します。数秒かかり、物理/Toolpath実証ではありません'
 def execute(self,context):
  r=compare_height_events(context.scene)
  if r.get('status')=='CURRENT':self.report({'INFO'},f"高さ区間を比較しました（{r['after'].get('elapsed_s',0):.1f}s）");return {'FINISHED'}
  self.report({'WARNING'},'HOLD: '+str(r.get('issues') or 'Source inputs changed'));return {'CANCELLED'}

class MINI_A_PT_route_panel(bpy.types.Panel):
 bl_label='MINI_A 保持ルート';bl_idname='MINIA_PT_layerwise_route';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category=PANEL_CATEGORY
 def draw(self,context):
  scene=context.scene;layout=self.layout
  layout.label(text='対象: F3457 DEMO（実破損位置は未特定）')
  layout.prop(scene,'route_height',text='モデル高さ（plate Z, mm）')
  layout.prop(scene,'route_mode',text='評価mode')
  row=layout.row(align=True);row.prop(scene,'route_failure_kind',text='故障単位');row.prop(scene,'route_failure_id',text='対象')
  layout.operator('mini_a.route_reevaluate',icon='FILE_REFRESH')
  layout.operator('mini_a.route_height_events',icon='TIME')
  state=scene.get('route_state','STALE')
  if state!='CURRENT' or scene.get('route_stale',True):
   layout.alert=True;layout.label(text='STALE / 未評価 — 古いoverlayは非表示です',icon='ERROR');layout.alert=False
   if scene.get('route_stale_reason'):layout.label(text=str(scene.get('route_stale_reason')))
   issues=[]
   try:issues=json.loads(scene.get('route_guard_issues_json','[]'))
   except Exception:pass
   for x in issues[:4]:layout.label(text=str(x)[:100],icon='CANCEL')
  else:
   try:s=json.loads(scene.get('route_summary_json','{}'))
   except Exception:s={}
   box=layout.box();box.label(text=f"CURRENT • {s.get('model_height_plate_z_mm')} mm • {s.get('mode','')}",icon='CHECKMARK')
   box.label(text='根拠: MIXED / 宣言接続 + 選択実材geometry')
   box.label(text='実接触・全接触網羅・強度: 未確認')
   box.label(text='実G-code/toolpath: TOOLPATH_UNVERIFIED')
   box.label(text='過去のraft +0.6mm換算は未確認・別条件')
   box.label(text='実際の物理保持route数: UNVERIFIED',icon='INFO')
   self._draw_comparison(box,s)
   self._draw_failure(box,s.get('after',{}).get('failure_impact',{}))
   self._draw_base_ids(box,s.get('after',{}))
   ov=s.get('overlay',{});box.label(text=f"Overlay: 参照clip {ov.get('centerline_clip_count',0)} / 分離片bbox {ov.get('component_bbox_count',0)}")
   box.label(text=f"追加枝の高さclip表示: {ov.get('author_intent_clip_count',0)}（設計意図のみ）")
   self._draw_height_events(box,scene)
  legend=layout.box();legend.label(text='色凡例（確定状態だけ色分類。未確認は灰）')
  legend.label(text='紫 0   赤 1   黄 2   青 3+   灰 未確認')
  legend.label(text='青は安全を意味しません。現在のMIXED graph数は灰表示。')
  legend.label(text='青い全長線=編集用source参照。保持routeではありません。')
  legend.label(text='灰破線=witness模式図。実接触・表面経路の証明ではありません。')
  layout.label(text='追加枝: DESIGN_INTENT_PREDICTION / TOOLPATH_UNVERIFIED')
  layout.label(text='高さ面はモデルZ/plate Z。machine/G-code Zとは別。')
 def _draw_comparison(self,box,s):
  compare=box.box();compare.label(text='同じ高さ・modeで編集前 / 編集後（入力graph内）')
  for label,key in [('前','before'),('後','after')]:
   data=s.get(key,{})
   for t in data.get('targets',[]):
    count=t.get('graph_count');disp='未解決' if count is None else ('3+' if count>=3 else str(count))
    compare.label(text=f"{label} {t.get('target')}: graph_count={disp} (graph内のみ)")
    compare.label(text=f"  geometry witness lower={t.get('verified_model_geometry_route_lower_bound')} • bearing仮定あり")
    for x in t.get('common_branch_failures',[])[:4]:compare.label(text=f'  共通branch故障: {x}',icon='ERROR')
    for x in t.get('common_joint_failures',[])[:3]:compare.label(text=f'  共通joint故障: {x}',icon='ERROR')
 def _draw_failure(self,box,i):
  f=box.box();f.label(text=f"仮想故障: {i.get('failure_kind','未選択')} {i.get('failure_id','')}")
  if not i:return
  if i.get('failure_present_in_graph') is False:
   f.label(text='選択IDはこの高さのgraphに未出現。影響は未評価。',icon='INFO');return
  f.label(text=f"影響片={len(i.get('lost_fragment_ids',[]))} / 関連branch={i.get('lost_branch_count',0)} / 花={i.get('lost_flower_count',0)}")
  if i.get('lost_branch_ids'):f.label(text='影響branch IDs: '+', '.join(i['lost_branch_ids'][:8]))
  if i.get('lost_flower_ids'):f.label(text='影響flower IDs: '+', '.join(i['lost_flower_ids'][:8]))
  f.label(text=f"部分離断 branch={len(i.get('partially_disconnected_branch_ids',[]))}")
  if i.get('partially_disconnected_branch_ids'):f.label(text='部分離断 IDs: '+', '.join(i['partially_disconnected_branch_ids'][:8]))
  f.label(text='graph上の仮想影響。物理破断予測ではありません。')
  if i.get('bbox'):f.label(text='影響bbox (plate mm): '+str([[round(v,2) for v in row] for row in i['bbox']]))

 def _draw_base_ids(self,box,data):
  g=box.box();g.label(text='基部までgraph内で接続されたunique ID（実保持の断定ではない）')
  g.label(text=f"branch IDs: {data.get('base_connected_branch_count','未取得')} / flower IDs: {data.get('base_connected_flower_count','未取得')}")
  g.label(text='基部 IDs: '+str(data.get('base_ids') or ['MODEL_BASE']))
  g.label(text='完成品基部宣言: '+str(data.get('permanent_base_member_ids') or ['R0000','R0001']))
  g.label(text='scope: '+str(data.get('connected_count_scope') or 'Unique IDs in supplied graph; physical holding unverified'))
  g.label(text='not verified physical holding')

 def _draw_height_events(self,box,scene):
  q=box.box();q.label(text='高さ区間 / onset（明示走査が必要）')
  raw=scene.get('route_interval_comparison_json','')
  if not raw:q.label(text='未計算。編集・mode・高さ変更後は必ず再実行。',icon='INFO');return
  try:r=json.loads(raw)
  except Exception:q.label(text='STALE / invalid event cache',icon='ERROR');return
  for label,key in [('編集前','before'),('編集後','after')]:
   ev=r[key];events=ev.get('route_onset_estimates',{});interval=ev.get('single_route_interval_estimate_mm')
   q.label(text=f"{label} • branches added={ev.get('new_branch_count')}")
   for k in ('1','2'):
    e=events.get(k,{})
    if e.get('status')=='AT_OR_BEFORE_STABLE_TARGET':text=f"{k} route: ≤{e.get('upper_bound_model_z_mm')} mm"
    elif e.get('status')=='DECLARED_GRAPH_EVENT_ESTIMATE':text=f"{k} route event: {e.get('previous_grid_height_mm')}→{e.get('first_grid_height_mm')} mm"
    elif e.get('status')=='NOT_FOUND_THROUGH_RANGE':text=f"{k} route: not found through {e.get('through_model_z_mm')} mm"
    else:text=f"{k} route: UNKNOWN"
    q.label(text=text)
   q.label(text='1-route estimate: '+(f"{interval[0]}–{interval[1]} mm" if interval else 'UNKNOWN'))
  q.label(text='条件付きgraph estimate。物理接触・Toolpath timing・強度の証明ではありません。')

def _failure_kind_items(self,context):return [('branch','物理branch','physical member ID単位'),('joint','joint','接合ID単位')]

@persistent
def _load_post(_dummy):
 global CTX,ROOT,_LAST_GRAPH
 CTX=None;ROOT=None;_LAST_GRAPH=None
 scene=bpy.context.scene
 if scene and scene.get('route_output_root'):
  scene['route_state']='STALE';scene['route_stale']=True;scene['route_stale_reason']='File opened; explicitly reevaluate';route_overlay.hide_overlay(True)

@persistent
def _depsgraph_post(scene,depsgraph):
 if _BUSY:return
 for u in depsgraph.updates:
  id=u.id
  nm=getattr(id,'name','')
  if nm.startswith('AUTHOR_EDIT_') or getattr(id,'get',lambda *_:False)('source_reference',False):
   if bpy.context.mode=='EDIT_MESH':_set_stale(scene,'EDIT_MODE_ACTIVE');return
   try:audit=extract_current_edits(scene)
   except Exception as e:_set_stale(scene,'AUTHOR_AUDIT_FAILED');scene['route_state']='HOLD';scene['route_guard_issues_json']=json.dumps([repr(e)]);return
   if audit['issues'] or audit['edit_sha256']!=scene.get('route_edit_sha256'):
    _set_stale(scene,'AUTHOR_EDIT_OR_SOURCE_REFERENCE_CHANGED')
    if audit['issues']:scene['route_guard_issues_json']=json.dumps(audit['issues'],ensure_ascii=False)
    return

def register(runtime_path=None,initial_evaluate=True):
 global _REGISTERED,_BUSY
 if _REGISTERED:
  ctx=_ensure_context(runtime_path=runtime_path)
  if initial_evaluate:reevaluate(bpy.context.scene,runtime_path)
  return ctx
 _ensure_context(runtime_path=runtime_path)
 for cls in (MINI_A_OT_route_reevaluate,MINI_A_OT_route_height_events,MINI_A_PT_route_panel):bpy.utils.register_class(cls)
 bpy.types.Scene.route_height=FloatProperty(name='Model height',description='Model/plate geometry Z in mm, snapped to the backend 0.2 mm grid',default=43.2,min=0,max=156,step=1,precision=1,update=_on_height_update)
 bpy.types.Scene.route_mode=EnumProperty(name='Holding mode',items=[('PRINTING_WITH_SUPPORT','印刷途中・Support込み',''),('PERMANENT_ONLY_AFTER_REMOVAL','Support除去後・Permanentのみ','')],default='PRINTING_WITH_SUPPORT',update=_on_mode_update)
 bpy.types.Scene.route_failure_kind=EnumProperty(name='Failure unit',items=_failure_kind_items,default=0,update=_on_failure_kind_update)
 default_failure_number=int(hashlib.sha256(b'branch|A3457').hexdigest()[:8],16)&0x7fffffff
 bpy.types.Scene.route_failure_id=EnumProperty(name='Failure target',items=_failure_items,default=default_failure_number,update=_property_changed)
 if _load_post not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_load_post)
 if _depsgraph_post not in bpy.app.handlers.depsgraph_update_post:bpy.app.handlers.depsgraph_update_post.append(_depsgraph_post)
 if not bpy.app.timers.is_registered(poll_ui_state):bpy.app.timers.register(poll_ui_state,first_interval=0.75,persistent=True)
 _REGISTERED=True
 scene=bpy.context.scene
 if not scene.get('route_output_root'):scene['route_output_root']=str(Path(bpy.data.filepath).resolve().parent.parent)
 if initial_evaluate:
  if not scene.get('route_inputs_initialized'):
   _BUSY=True
   try:
    scene.route_height=43.2;scene.route_mode='PRINTING_WITH_SUPPORT';scene.route_failure_kind='branch';scene.route_failure_id='A3457';scene['route_inputs_initialized']=True
   finally:_BUSY=False
  reevaluate(scene,runtime_path)
 return CTX

def unregister():
 global _REGISTERED,CTX,ROOT,_LAST_GRAPH
 if not _REGISTERED:return
 for handler,coll in ((_load_post,bpy.app.handlers.load_post),(_depsgraph_post,bpy.app.handlers.depsgraph_update_post)):
  if handler in coll:coll.remove(handler)
 if bpy.app.timers.is_registered(poll_ui_state):bpy.app.timers.unregister(poll_ui_state)
 for cls in (MINI_A_PT_route_panel,MINI_A_OT_route_height_events,MINI_A_OT_route_reevaluate):
  try:bpy.utils.unregister_class(cls)
  except Exception:pass
 for name in ('route_height','route_mode','route_failure_kind','route_failure_id'):
  if hasattr(bpy.types.Scene,name):delattr(bpy.types.Scene,name)
 _REGISTERED=False;CTX=None;ROOT=None;_LAST_GRAPH=None
