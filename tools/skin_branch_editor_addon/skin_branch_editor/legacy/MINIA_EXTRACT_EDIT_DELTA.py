import bpy,json,hashlib,base64,zlib,sys,struct
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
out=Path(args[0]) if args else Path(r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\outputs\\DELTA.json')
issues=[];status='PASS';scene=bpy.context.scene
def file_sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
editor_sha=file_sha(bpy.data.filepath)
try:
 t=bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'];compressed=base64.b64decode(''.join(t.as_string().split()));raw=zlib.decompress(compressed);ledger_sha=hashlib.sha256(raw).hexdigest();assert ledger_sha==scene.get('source_ledger_sha256');ledger=json.loads(raw)
except Exception as e:
 ledger={};ledger_sha=None;status='HOLD';issues.append({'kind':'LEDGER_INVALID','error':repr(e)})
records=ledger.get('records',[]);byid={r['id']:r for r in records}
def f32(v):return struct.unpack('<f',struct.pack('<f',float(v)))[0]
def expected_rows(rows):
 result=[]
 for r in rows:
  pts=r['points_plate_mm']
  for ep,p in [('START',pts[0]),('END',pts[-1])]:result.append({'anchor_id':r['id']+':'+ep,'record_id':r['id'],'endpoint':ep,'coord':[f32(x) for x in p]})
 return result

def verify_anchor_object(name,rows,allow_edges):
 global status
 o=bpy.data.objects.get(name)
 if o is None:status='HOLD';issues.append({'kind':'ANCHOR_OBJECT_MISSING','object':name});return None
 m=o.data;attr=m.attributes.get('anchor_index');
 if attr is None:status='HOLD';issues.append({'kind':'ANCHOR_INDEX_MISSING','object':name});return None
 expected=expected_rows(rows);values=[int(x.value) for x in attr.data]
 if len(m.vertices)!=len(expected) or len(values)!=len(expected) or len(set(values))!=len(expected):status='HOLD';issues.append({'kind':'ANCHOR_COUNT_OR_ID_CHANGED','object':name,'expected':len(expected),'vertices':len(m.vertices),'attribute_values':len(values),'unique_ids':len(set(values))})
 moved=[];missing=sorted(set(range(len(expected)))-set(values));
 for vi,ai in enumerate(values):
  if ai<0 or ai>=len(expected):continue
  want=expected[ai]['coord'];actual=o.matrix_world@m.vertices[vi].co;delta=max(abs(float(actual[j])-want[j]) for j in range(3))
  if delta>1e-7:moved.append({'anchor_id':expected[ai]['anchor_id'],'max_delta_mm':delta})
 if missing:status='HOLD';issues.append({'kind':'ANCHOR_DELETED_OR_REINDEXED','object':name,'missing_anchor_indices':missing[:30]})
 if moved:status='HOLD';issues.append({'kind':'PROTECTED_ANCHOR_MOVED','object':name,'count':len(moved),'examples':moved[:20]})
 edges=[];bad=[]
 for e in m.edges:
  if not allow_edges:bad.append(list(e.vertices));continue
  v0,v1=map(int,e.vertices);ai,aj=values[v0],values[v1]
  if ai<0 or aj<0 or ai>=len(expected) or aj>=len(expected) or ai==aj:bad.append([v0,v1]);continue
  aa,bb=expected[ai],expected[aj];pair=sorted([aa,bb],key=lambda r:r['anchor_id']);ids=[x['anchor_id'] for x in pair];branch='AUT-'+hashlib.sha256('|'.join(ids).encode()).hexdigest()[:12].upper()
  edges.append({'branch_id':branch,'endpoint_anchor_ids':ids,'endpoint_source_record_ids':[x['record_id'] for x in pair],'points_plate_mm':[x['coord'] for x in pair],'status':'AUTHOR_CENTERLINE_ONLY_NOT_MATERIALIZED'})
 if bad:status='HOLD';issues.append({'kind':'UNSUPPORTED_EDGE_TOPOLOGY','object':name,'examples':bad[:20]})
 return {'object':name,'expected_anchors':len(expected),'actual_vertices':len(m.vertices),'edges':edges}

demo_ids=ledger.get('demo',{}).get('member_ids',[]);demo_rows=[byid[i] for i in demo_ids if i in byid]
all_result=verify_anchor_object('AUTHOR_EDIT_ALL • protected point baseline',records,True)
demo_result=verify_anchor_object('AUTHOR_EDIT_DEMO • 24 endpoints, select two then F',demo_rows,True)
# Immutable source-reference presence, transforms and geometry must match stored fingerprints.
def reference_fingerprint(o):
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
try: baseline_refs=json.loads(scene['source_reference_fingerprints'])
except Exception as e: baseline_refs={};status='HOLD';issues.append({'kind':'REFERENCE_FINGERPRINT_BASELINE_MISSING','error':repr(e)})
actual_refs={o.name:reference_fingerprint(o) for o in bpy.data.objects if o.get('source_reference')}
missing_refs=sorted(set(baseline_refs)-set(actual_refs));changed_refs=sorted(n for n,h in baseline_refs.items() if n in actual_refs and actual_refs[n]!=h);added_refs=sorted(set(actual_refs)-set(baseline_refs))
if missing_refs or changed_refs or added_refs:status='HOLD';issues.append({'kind':'SOURCE_REFERENCE_FINGERPRINT_CHANGED','missing':missing_refs,'changed':changed_refs,'added':added_refs})
markers=[]
for o in bpy.data.objects:
 if o.name.startswith('REPAIR_'):markers.append({'id':o.name,'position_plate_mm':list(o.matrix_world.translation),'comment':str(o.get('comment',''))})
edge_map={e['branch_id']:e for check in (all_result,demo_result) if check for e in check['edges']};edges=[edge_map[k] for k in sorted(edge_map)]
result={'status':'HOLD' if status=='HOLD' else ('PASS_NOOP' if not edges else 'PASS_EDIT_DELTA'),'editor_blend_path':bpy.data.filepath,'editor_blend_sha256':editor_sha,'baseline_editable_sha256':scene.get('baseline_editable_sha256'),'ledger_sha256':ledger_sha,'source_record_count':len(records),'anchor_checks':[all_result,demo_result],'source_reference_count':len(baseline_refs),'new_edge_count':len(edges),'new_branches':edges,'weak_point_markers':markers,'issues':issues,'slice_send_print_count':0}
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2),flush=True)

