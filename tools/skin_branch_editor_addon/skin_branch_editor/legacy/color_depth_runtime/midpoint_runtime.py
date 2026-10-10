"""Protected midpoint editing and distance-color update for MINI_A."""
import bpy, bmesh, sys, json, math, hashlib, time
from pathlib import Path
from mathutils import Vector
from bpy_extras import view3d_utils

RUNTIME=Path(__file__).resolve().parent; OUT=RUNTIME.parent
if str(OUT/'color_path_midpoint_runtime') not in sys.path: sys.path.insert(0,str(OUT/'color_path_midpoint_runtime'))
if str(OUT/'route_runtime') not in sys.path: sys.path.insert(0,str(OUT/'route_runtime'))
if str(OUT/'color_path_runtime') not in sys.path: sys.path.insert(0,str(OUT/'color_path_runtime'))
import route_v2_panel
import color_path_runtime as colorbase
nx=colorbase.nx

ANCHOR='AUTHOR_EDIT_ALL • protected point baseline'
DISPLAY='DISPLAY_ONLY • support-distance colors'
PREVIEW='AUTHOR_EDIT_PREVIEW • display only'
PANEL='MINI_A 色付き補強'
KIND_BASE=0; KIND_SOURCE=1; KIND_AUTHOR=2
ATTRS=(('midpoint_kind','INT',0),('midpoint_segment_index','INT',-1),('midpoint_author_root','INT',-1),('midpoint_t','FLOAT',0.0))
_REGISTERED=False

def _sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()

def _read_data(scene=None):
 cache,score,cache_sha,score_sha=colorbase._read_data(scene)
 if len(cache['segments'])!=35303 or len(cache['anchors'])!=18842:raise RuntimeError('locked cache shape mismatch')
 return cache,score,cache_sha,score_sha

def _interp(a,b,t):return [float(a[k])+(float(b[k])-float(a[k]))*float(t) for k in range(3)]
def _round_t(t):return float(f'{float(t):.6f}')
def _base_id(row):return row['anchor_id']
def _source_mid_id(i,t):return f'SMID:{int(i)}:{_round_t(t):.8f}'
def _root_id(a,b):
 pair=sorted((str(a),str(b)))
 return 'AUT-'+hashlib.sha256('|'.join(pair).encode()).hexdigest()[:12].upper()
def _author_mid_id(root_id,t):return f'AMID:{root_id}:{_round_t(t):.8f}'
def _world(obj,co):return obj.matrix_world@Vector(co)
def _near(a,b,tol=1e-4):return max(abs(float(a[k])-float(b[k])) for k in range(3))<=tol

def ensure_midpoint_attributes(obj=None):
 obj=obj or bpy.data.objects.get(ANCHOR)
 if obj is None or obj.type!='MESH':raise RuntimeError('AUTHOR_EDIT_ALL missing')
 if obj.mode=='EDIT':bpy.ops.object.mode_set(mode='OBJECT')
 n=len(obj.data.vertices)
 for name,kind,default in ATTRS:
  a=obj.data.attributes.get(name)
  if a is None:
   a=obj.data.attributes.new(name,kind,'POINT')
   for d in a.data:
    if kind=='INT':d.value=int(default)
    else:d.value=float(default)
  if len(a.data)!=n:raise RuntimeError(f'{name} domain length mismatch')
 # Baseline vertices have explicit base kind/default provenance values.
 ai=obj.data.attributes.get('anchor_index')
 if ai is None or len(ai.data)!=n:raise RuntimeError('locked anchor_index attribute missing')
 kind_attr=obj.data.attributes['midpoint_kind'];seg_attr=obj.data.attributes['midpoint_segment_index'];root_attr=obj.data.attributes['midpoint_author_root'];t_attr=obj.data.attributes['midpoint_t']
 for i in range(n):
  if int(ai.data[i].value)>=0:
   kind_attr.data[i].value=KIND_BASE;seg_attr.data[i].value=-1;root_attr.data[i].value=-1;t_attr.data[i].value=0.0
 return obj

def _registry(scene):
 raw=scene.get('midpoint_author_root_registry','[]')
 try:r=json.loads(raw)
 except Exception as e:raise RuntimeError('author root registry invalid: '+repr(e))
 if not isinstance(r,list):raise RuntimeError('author root registry must be a list')
 return r
def _store_registry(scene,roots):scene['midpoint_author_root_registry']=json.dumps(roots,separators=(',',':'),ensure_ascii=False)

def _mesh_data(obj):
 if bpy.context.mode=='EDIT_MESH' and bpy.context.view_layer.objects.active==obj:
  bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table();bm.verts.index_update();bm.edges.index_update()
  layers={name:bm.verts.layers.int.get(name) for name in ('anchor_index','midpoint_kind','midpoint_segment_index','midpoint_author_root')}
  layers['midpoint_t']=bm.verts.layers.float.get('midpoint_t')
  if any(v is None for v in layers.values()):raise RuntimeError('EditMode midpoint provenance layers missing')
  verts=list(bm.verts);edges=list(bm.edges);faces=list(bm.faces)
  return bm,layers,verts,edges,faces
 attrs={name:obj.data.attributes.get(name) for name in ('anchor_index','midpoint_kind','midpoint_segment_index','midpoint_author_root','midpoint_t')}
 if any(v is None for v in attrs.values()):raise RuntimeError('midpoint provenance attributes missing')
 verts=list(obj.data.vertices);edges=list(obj.data.edges);faces=list(obj.data.polygons)
 return None,attrs,verts,edges,faces

def _ival(layer_data,index,name,vert=None):
 q=layer_data[name]
 if hasattr(q,'value'):return int(q.value)
 if vert is not None and not hasattr(q,'data'):return int(vert[q])
 return int(q.data[index].value)
def _fval(layer_data,index,name,vert=None):
 q=layer_data[name]
 if hasattr(q,'value'):return float(q.value)
 if vert is not None and not hasattr(q,'data'):return float(vert[q])
 return float(q.data[index].value)

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
 mapped=set()
 for ri,r in enumerate(roots):
  chain=[(r['a_id'],0.0)]+[(c['id'],float(c['t'])) for c in r.get('cuts',[])]+[(r['b_id'],1.0)]
  for (a,t0),(b,t1) in zip(chain,chain[1:]):mapped.add(tuple(sorted((a,b))))
 actual=set(x['ids'] for x in edge_rows)
 for pair in mapped:
  if pair not in actual:raise RuntimeError('author root interval edge is missing from ALL mesh')
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

def _graph_state(state):
 cache=state['cache'];g=nx.Graph();g.add_nodes_from(cache['nodes']);g.add_edges_from((a,b,d.copy()) for a,b,d in cache['edges'])
 display=[];source_groups={}
 for vi,r in state['mid_records'].items():
  if r['kind']=='source_segment':source_groups.setdefault(r['segment_index'],[]).append((float(r['t']),r['stable_id'],r['position']))
 for i,seg in enumerate(cache['segments']):
  u,v=seg['nodes'];old=g.get_edge_data(u,v)
  if old is None:raise RuntimeError(f'cache segment edge missing at index {i}')
  cuts=sorted(source_groups.get(i,[]));chain=[(0.0,u,seg['a'])]+cuts+[(1.0,v,seg['b'])]
  if cuts:g.remove_edge(u,v)
  for t,sid,p in cuts:g.add_node(sid,position=p,kind='SOURCE_BRANCH_MIDPOINT',source_segment_index=i,source_t=t,branch_id=seg['branch_id'])
  for (ta,a,pa),(tb,b,pb) in zip(chain,chain[1:]):
   if a==b:raise RuntimeError('duplicate graph split node')
   length=math.dist(pa,pb)
   g.add_edge(a,b,length_mm=length,kind=old.get('kind','PERMANENT_CENTERLINE'),branch_id=seg['branch_id'])
   display.append({'branch_id':seg['branch_id'],'a':list(pa),'b':list(pb),'nodes':[a,b]})
 author_nodes={sid:p for sid,p in state['id_to_pos'].items() if sid.startswith('AMID:')}
 for sid,p in author_nodes.items():g.add_node(sid,position=p,kind='AUTHOR_EDGE_MIDPOINT')
 anchor_nodes=cache['anchors']
 def graph_node(sid):
  if sid.startswith('SMID:') or sid.startswith('AMID:'):return sid
  if sid not in anchor_nodes:raise RuntimeError('endpoint cannot be mapped to locked graph node: '+sid)
  return anchor_nodes[sid]
 # Author roots are separate logical lines; an optional cut only subdivides its root.
 for root in state['roots']:
  chain=[(root['a_id'],0.0)]+[(c['id'],float(c['t'])) for c in root.get('cuts',[])]+[(root['b_id'],1.0)]
  for (ida,ta),(idb,tb) in zip(chain,chain[1:]):
   na,nb=graph_node(ida),graph_node(idb)
   pa,pb=state['id_to_pos'][ida],state['id_to_pos'][idb]
   if na==nb:continue
   # Existing graph edges are retained; never overwrite their source lengths.
   if g.has_edge(na,nb):continue
   g.add_edge(na,nb,length_mm=math.dist(pa,pb),kind='AUTHOR_EDIT_DESIGN_INTENT',root_id=root['root_id'])
 return g,display

def _edge_interval_map(roots):
 out={}
 for ri,r in enumerate(roots):
  chain=[(r['a_id'],0.0)]+[(c['id'],float(c['t'])) for c in r.get('cuts',[])]+[(r['b_id'],1.0)]
  for (a,t0),(b,t1) in zip(chain,chain[1:]):out[tuple(sorted((a,b)))]=(ri,{a:t0,b:t1})
 return out

def _add_point_to_bmesh(state,candidate):
 obj=state['obj'];bm=state['bm']
 if bm is None:raise RuntimeError('Enter Edit Mode to add an anchor')
 layer_ai=bm.verts.layers.int.get('anchor_index');layer_kind=bm.verts.layers.int.get('midpoint_kind');layer_seg=bm.verts.layers.int.get('midpoint_segment_index');layer_root=bm.verts.layers.int.get('midpoint_author_root');layer_t=bm.verts.layers.float.get('midpoint_t')
 if any(x is None for x in (layer_ai,layer_kind,layer_seg,layer_root,layer_t)):raise RuntimeError('midpoint attribute layers missing')
 roots=state['roots'];kind=candidate['kind']
 if kind=='source_segment':
  si=int(candidate['segment_index']);t=_round_t(candidate['t']);sid=_source_mid_id(si,t)
  if not 0.000001<t<.999999:raise RuntimeError('線の端に近すぎます。端点を選んでください。')
  if sid in state['id_to_pos']:
   for v in bm.verts:v.select_set(False)
   for v in bm.verts:
    if state['id_by_index'].get(v.index)==sid:v.select_set(True);bm.select_history.clear();bm.select_history.add(v);return sid
  p=candidate['position'];v=bm.verts.new(obj.matrix_world.inverted()@Vector(p));v[layer_ai]=-1;v[layer_kind]=KIND_SOURCE;v[layer_seg]=si;v[layer_root]=-1;v[layer_t]=t
 else:
  ri=int(candidate['root_index']);root=roots[ri];t=_round_t(candidate['root_t']);sid=_author_mid_id(root['root_id'],t)
  if not 0.000001<t<.999999:raise RuntimeError('線の端に近すぎます。端点を選んでください。')
  if sid in state['id_to_pos']:
   for v in bm.verts:v.select_set(False)
   for v in bm.verts:
    if state['id_by_index'].get(v.index)==sid:v.select_set(True);bm.select_history.clear();bm.select_history.add(v);return sid
  edge=candidate['edge'];start=candidate['edge_start'];fac=float(candidate['edge_t'])
  if fac<=1e-6 or fac>=1-1e-6:raise RuntimeError('click inside the visible edge, away from endpoint')
  _,v=bmesh.utils.edge_split(edge,start,fac)
  v[layer_ai]=-1;v[layer_kind]=KIND_AUTHOR;v[layer_seg]=-1;v[layer_root]=ri;v[layer_t]=t
  root['cuts'].append({'id':sid,'t':t});root['cuts'].sort(key=lambda x:float(x['t']));_store_registry(bpy.context.scene,roots)
 # Rebuild index tables after the newly created BMesh vertex/edge split.
 bm.verts.ensure_lookup_table();bm.verts.index_update();bm.edges.ensure_lookup_table()
 for x in bm.verts:x.select_set(False)
 v.select_set(True);bm.select_history.clear();bm.select_history.add(v)
 bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=True)
 scene=bpy.context.scene;scene['midpoint_last_added_id']=sid;scene['color_map_state']='STALE';scene['color_map_stale_reason']='中点を追加しました。色を更新してください。'
 return sid

def _screen_pick(context,event,state):
 area=context.area;space=area.spaces.active;rv3d=space.region_3d
 region=next((r for r in area.regions if r.type=='WINDOW'),None)
 if region is None:return None
 xy=(event.mouse_x-region.x,event.mouse_y-region.y)
 if not (0<=xy[0]<region.width and 0<=xy[1]<region.height):return None
 ray_o=view3d_utils.region_2d_to_origin_3d(region,rv3d,xy);ray_d=view3d_utils.region_2d_to_vector_3d(region,rv3d,xy).normalized()
 candidates=[]
 def test_segment(kind,a,b,meta):
  av,bv=Vector(a),Vector(b);u=bv-av;w=ray_o-av
  aa=u.dot(u);bb=u.dot(ray_d);dd=u.dot(w);ee=ray_d.dot(w);den=aa-bb*bb
  if aa<1e-12:return
  t=(dd-bb*ee)/den if abs(den)>1e-12 else .5
  t=max(0.0,min(1.0,t));point=av+u*t;s=(point-ray_o).dot(ray_d)
  if s<=0:return
  p2=view3d_utils.location_3d_to_region_2d(region,rv3d,point)
  if p2 is None:return
  pix=math.hypot(float(p2.x)-xy[0],float(p2.y)-xy[1])
  if pix<=12.0:candidates.append({'kind':kind,'position':list(point),'pixel_distance':pix,'depth':s,'t':t,**meta})
 for i,seg in enumerate(state['cache']['segments']):
  test_segment('source_segment',seg['a'],seg['b'],{'segment_index':i})
 if state['bm'] is None:raise RuntimeError('Edit Mode is required for author-line midpoint picking')
 interval=_edge_interval_map(state['roots'])
 bm=state['bm'];bm.verts.ensure_lookup_table();bm.verts.index_update()
 for edge in bm.edges:
  va,vb=edge.verts[0],edge.verts[1];ida=state['id_by_index'].get(va.index);idb=state['id_by_index'].get(vb.index)
  if not ida or not idb:continue
  pair=tuple(sorted((ida,idb)));item=interval.get(pair)
  if item is None:continue
  ri,tmap=item;pa=list(_world(state['obj'],va.co));pb=list(_world(state['obj'],vb.co))
  before=len(candidates)
  test_segment('author_edge',pa,pb,{'root_index':ri,'root_t0':tmap[ida],'root_t1':tmap[idb],'edge':edge,'edge_start':va,'edge_pair_orientation':(ida,idb)})
  if len(candidates)>before:
   c=candidates[-1]
   # Candidate t is along edge. Convert to the stable root's a->b parameter.
   c['root_t']=tmap[ida]+(tmap[idb]-tmap[ida])*c['t']
   c['edge_t']=c['t'];c['edge_start']=va
 if not candidates:return None
 # At projected crossings, accept the frontmost candidate within the pick radius.
 return min(candidates,key=lambda c:(c['depth'],c['pixel_distance']))

def _verify_references(scene):
 actual={o.name:route_v2_panel._reference_fingerprint(o) for o in bpy.data.objects if o.get('source_reference')}
 try:expected=json.loads(scene['source_reference_fingerprints'])
 except Exception as e:raise RuntimeError('protected ref manifest missing: '+repr(e))
 if set(actual)!=set(expected) or any(actual.get(k)!=v for k,v in expected.items()):raise RuntimeError('protected source reference changed')
 return len(actual)

def _replace_author_preview(state):
 coll=bpy.data.collections.get(PREVIEW) or bpy.data.collections.new(PREVIEW)
 if coll.name not in bpy.context.scene.collection.children:bpy.context.scene.collection.children.link(coll)
 for o in list(coll.objects):bpy.data.objects.remove(o,do_unlink=True)
 if not state['edge_rows']:return 0
 data=bpy.data.curves.new('Author intent edges • midpoint-aware display','CURVE');data.dimensions='3D';data.bevel_depth=.14;data.bevel_resolution=2
 for e in state['edge_rows']:
  sp=data.splines.new('POLY');sp.points.add(1);sp.points[0].co=(*e['a_position'],1);sp.points[1].co=(*e['b_position'],1)
 o=bpy.data.objects.new('AUTHOR INTENT • cyan display only',data);o['display_only']=True;o['classification']='DESIGN_INTENT_PREDICTION • TOOLPATH_UNVERIFIED';o.hide_select=True
 m=bpy.data.materials.get('Author intent cyan') or bpy.data.materials.new('Author intent cyan');m.diffuse_color=(.02,.8,1,1);m.use_nodes=True
 n=m.node_tree.nodes;n.clear();em=n.new('ShaderNodeEmission');em.inputs['Color'].default_value=(.02,.8,1,1);em.inputs['Strength'].default_value=1;out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(em.outputs['Emission'],out.inputs['Surface']);data.materials.append(m);coll.objects.link(o)
 return len(state['edge_rows'])

def update_colors(scene=None):
 scene=scene or bpy.context.scene;started=time.perf_counter()
 try:
  state=scan_state(scene,allow_registry_init=True);g,display=_graph_state(state);scores=colorbase.score_graph(g,state['cache']['seeds'])
  bybin={i:[] for i in range(32)};bybin[None]=[]
  for seg in display:
   q=scores.get(frozenset(seg['nodes']));val=q['effective_distance_mm'] if q else None
   b=None if val is None else min(31,int(round(max(0.,val)/30*31)));bybin[b].append(seg)
  coll=bpy.data.collections.get(DISPLAY) or bpy.data.collections.new(DISPLAY)
  if coll.name not in scene.collection.children:scene.collection.children.link(coll)
  for o in list(coll.objects):
   if o.name.startswith('Support distance •') and o.type=='CURVE':bpy.data.objects.remove(o,do_unlink=True)
  palette=state['score']['palette'];unknown=state['score'].get('unknown_color',[.34,.38,.43]);total=0
  for b,segs in bybin.items():
   if not segs:continue
   data=bpy.data.curves.new(f'Support distance {b if b is not None else "gray"} paths','CURVE');data.dimensions='3D';data.resolution_u=1;data.bevel_depth=.12;data.bevel_resolution=1
   for seg in segs:
    sp=data.splines.new('POLY');sp.points.add(1);sp.points[0].co=(*seg['a'],1);sp.points[1].co=(*seg['b'],1)
   o=bpy.data.objects.new(f'Support distance • {b if b is not None else "gray"} • {len(segs)} subsegments',data);o['display_only']=True;o['color_bin']=-1 if b is None else b;o['segment_count']=len(segs);o.hide_select=True;data.materials.append(colorbase._color_material(b,unknown if b is None else palette[b]));coll.objects.link(o);total+=len(segs)
  preview_n=_replace_author_preview(state);refs=_verify_references(scene)
  sig=_signature(state)
  report={'status':'CURRENT','source_branches':9421,'source_segments':35303,'display_segments':total,'source_midpoint_count':sum(r['kind']=='source_segment' for r in state['mid_records'].values()),'author_midpoint_count':sum(r['kind']=='author_edge' for r in state['mid_records'].values()),'author_root_edge_count':len(state['roots']),'author_edge_count':len(state['edge_rows']),'author_preview_segments':preview_n,'source_reference_count':refs,'cache_sha256':_read_data(scene)[2],'score_sha256':_read_data(scene)[3],'manufacturing_geometry_changed':False,'elapsed_s':time.perf_counter()-started}
  scene['midpoint_score_report_json']=json.dumps(report,separators=(',',':'),ensure_ascii=False);scene['midpoint_editor_state']='CURRENT';scene['midpoint_editor_reason']='';scene['midpoint_anchor_signature']=sig
  return report
 except Exception as e:
  scene['midpoint_editor_state']='HOLD';scene['midpoint_editor_reason']=repr(e);return {'status':'HOLD','issues':[repr(e)]}

def _signature(state=None):
 obj=bpy.data.objects.get(ANCHOR)
 if obj is None:return 'MISSING'
 bm=None
 if bpy.context.mode=='EDIT_MESH' and bpy.context.view_layer.objects.active==obj:
  bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.verts.index_update();bm.edges.ensure_lookup_table()
 verts=[];edges=[]
 if bm:
  kind=bm.verts.layers.int.get('midpoint_kind');seg=bm.verts.layers.int.get('midpoint_segment_index');root=bm.verts.layers.int.get('midpoint_author_root');t=bm.verts.layers.float.get('midpoint_t')
  for v in bm.verts:verts.append((v.index,tuple(round(float(c),6) for c in v.co),v[kind] if kind else -1,v[seg] if seg else -1,v[root] if root else -1,round(float(v[t]),7) if t else 0.))
  edges=sorted(tuple(sorted(v.index for v in e.verts)) for e in bm.edges);faces=len(bm.faces)
 else:
  attrs={n:obj.data.attributes.get(n) for n,_,_ in ATTRS}
  for i,v in enumerate(obj.data.vertices):verts.append((i,tuple(round(float(c),6) for c in v.co),int(attrs['midpoint_kind'].data[i].value),int(attrs['midpoint_segment_index'].data[i].value),int(attrs['midpoint_author_root'].data[i].value),round(float(attrs['midpoint_t'].data[i].value),7)))
  edges=sorted(tuple(sorted(e.vertices)) for e in obj.data.edges);faces=len(obj.data.polygons)
 return hashlib.sha256(repr((verts,edges,faces,bpy.context.scene.get('midpoint_author_root_registry','[]'))).encode()).hexdigest()

def poll_state():
 if not _REGISTERED:return None
 s=bpy.context.scene
 try:
  if _signature()!=s.get('midpoint_anchor_signature') and s.get('midpoint_editor_state')!='STALE':
   s['midpoint_editor_state']='STALE';s['midpoint_editor_reason']='点/線が変わりました。色を更新してください。'
 except Exception as e:s['midpoint_editor_state']='HOLD';s['midpoint_editor_reason']=repr(e)
 return .5

class MINI_A_OT_add_midpoint(bpy.types.Operator):
 bl_idname='mini_a.add_midpoint';bl_label='枝の途中に点を追加';bl_description='画面上の元枝または水色補強線をクリックして中点を追加します。Escで取消'
 bl_options={'REGISTER','UNDO'}
 def invoke(self,context,event):
  if context.area is None or context.area.type!='VIEW_3D':self.report({'WARNING'},'3D Viewから実行してください');return {'CANCELLED'}
  if context.mode!='EDIT_MESH' or context.view_layer.objects.active!=bpy.data.objects.get(ANCHOR):self.report({'WARNING'},'AUTHOR_EDIT_ALLをEdit Modeにしてください');return {'CANCELLED'}
  self.report({'INFO'},'元枝または水色線の途中をクリック。Escで取消')
  context.window_manager.modal_handler_add(self);return {'RUNNING_MODAL'}
 def modal(self,context,event):
  if event.type in {'ESC','RIGHTMOUSE'}:return {'CANCELLED'}
  if event.type=='LEFTMOUSE' and event.value=='PRESS':
   try:
    state=scan_state(context.scene,allow_registry_init=True)
    cand=_screen_pick(context,event,state)
    if cand is None:self.report({'WARNING'},'見えている線の上12px以内をクリックしてください');return {'CANCELLED'}
    sid=_add_point_to_bmesh(state,cand);self.report({'INFO'},'中点を追加: '+sid);return {'FINISHED'}
   except Exception as e:context.scene['midpoint_editor_state']='HOLD';context.scene['midpoint_editor_reason']=repr(e);self.report({'ERROR'},'HOLD: '+repr(e));return {'CANCELLED'}
  return {'RUNNING_MODAL'}

class MINI_A_OT_update_midpoint_colors(bpy.types.Operator):
 bl_idname='mini_a.update_midpoint_colors';bl_label='色を更新';bl_description='保護点・元枝中点・水色線中点を検証し距離色を再計算します'
 def execute(self,context):
  r=update_colors(context.scene)
  if r.get('status')=='CURRENT':self.report({'INFO'},f"色を更新 • 元枝中点{r['source_midpoint_count']} • 補強線中点{r['author_midpoint_count']}");return {'FINISHED'}
  self.report({'WARNING'},'HOLD: '+str(r.get('issues')));return {'CANCELLED'}

class MINI_A_OT_save_midpoint(bpy.types.Operator):
 bl_idname='mini_a.save_midpoint';bl_label='保存';bl_description='現在のblendへ保存。別名保存はFile > Save As'
 def execute(self,context):
  try:bpy.ops.wm.save_mainfile();self.report({'INFO'},'保存しました');return {'FINISHED'}
  except Exception as e:self.report({'ERROR'},repr(e));return {'CANCELLED'}

class MINI_A_PT_midpoint(bpy.types.Panel):
 bl_label='色付き線・中点編集';bl_idname='MINIA_PT_midpoint_editor';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category=PANEL
 def draw(self,context):
  l=self.layout;s=context.scene;state=s.get('midpoint_editor_state','STALE')
  l.label(text='元枝・水色補強線の途中に点を追加')
  l.operator('mini_a.add_midpoint',icon='ADD')
  l.label(text='点を選んで既存点とFで接続')
  l.label(text='点を置くだけでも保存可。線の上に点を保存します')
  if state=='CURRENT':l.label(text='色 CURRENT',icon='CHECKMARK')
  elif state=='HOLD':l.label(text='HOLD • '+str(s.get('midpoint_editor_reason',''))[:80],icon='ERROR')
  else:l.label(text='STALE • 点/線変更後は色を更新',icon='ERROR')
  l.operator('mini_a.update_midpoint_colors',icon='FILE_REFRESH');l.operator('mini_a.save_midpoint',icon='FILE_TICK')
  l.separator();l.label(text='元meshは変更しません')
  l.label(text='色は仮定ベース、強度/安全保証ではありません')
  l.label(text='補強意図: TOOLPATH_UNVERIFIED')

def _prepare_scene(scene):
 obj=ensure_midpoint_attributes()
 if not scene.get('midpoint_author_root_registry'):
  scene['midpoint_author_root_registry']='[]'
  if len(obj.data.edges):scene['midpoint_editor_state']='STALE';scene['midpoint_editor_reason']='既存補強線を読込み。色を更新してregistryを固定してください。'
 return obj

def register(enter_edit_mode=True):
 global _REGISTERED
 if not _REGISTERED:
  for c in (MINI_A_OT_add_midpoint,MINI_A_OT_update_midpoint_colors,MINI_A_OT_save_midpoint,MINI_A_PT_midpoint):bpy.utils.register_class(c)
  if not bpy.app.timers.is_registered(poll_state):bpy.app.timers.register(poll_state,first_interval=.5,persistent=True)
  _REGISTERED=True
 scene=bpy.context.scene;obj=_prepare_scene(scene)
 if bpy.context.mode=='EDIT_MESH':bpy.ops.object.mode_set(mode='OBJECT')
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 for o in bpy.data.objects:
  o.hide_select=(o!=obj)
  if o.get('source_reference'):o.hide_viewport=True;o.hide_render=True
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':area.spaces.active.show_region_ui=True;area.spaces.active.shading.type='SOLID';area.spaces.active.shading.color_type='MATERIAL';area.spaces.active.shading.light='FLAT';area.spaces.active.shading.background_type='VIEWPORT';area.spaces.active.shading.background_color=(.025,.035,.05)
 if enter_edit_mode:bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_mode(type='VERT');bpy.ops.mesh.select_all(action='DESELECT')
 scene['midpoint_anchor_signature']=_signature()
 if not scene.get('midpoint_editor_state'):
  old_state=scene.get('color_map_state','CURRENT')
  scene['midpoint_editor_state']='CURRENT' if old_state=='CURRENT' else 'STALE'
  if scene['midpoint_editor_state']=='STALE':scene['midpoint_editor_reason']='前バージョンの色表示が未更新です。「色を更新」を押してください。'
 return True

def unregister():
 global _REGISTERED
 if not _REGISTERED:return
 if bpy.app.timers.is_registered(poll_state):bpy.app.timers.unregister(poll_state)
 for c in (MINI_A_PT_midpoint,MINI_A_OT_save_midpoint,MINI_A_OT_update_midpoint_colors,MINI_A_OT_add_midpoint):
  try:bpy.utils.unregister_class(c)
  except RuntimeError:pass
 _REGISTERED=False
