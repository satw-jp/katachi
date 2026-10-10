"""Build a display-only support-distance color view from parent-produced score JSON."""
import bpy,sys,json,hashlib,base64,zlib,struct,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra')
OUT=ROOT/'outputs';INPUT=OUT/'SUPPORT_DISTANCE_COLORS.json';BASE=OUT/'MINIA_ALL_BRANCHES_VIEW.blend';BASE_META=OUT/'MINIA_ALL_BRANCHES_VIEW.json'
DEST=OUT/'MINIA_SUPPORT_DISTANCE_COLORS.blend';PREVIEW=OUT/'MINIA_SUPPORT_DISTANCE_COLORS_PREVIEW.png';QA=OUT/'SUPPORT_DISTANCE_COLORS_BUILD_QA.json'
EXPECTED_BASE_SHA='d482699c81ae4dd08f0a26edf8e718e1f3882ccbcec669bb9b0fbb55064b3ce0';SOURCE_TEXT='MINIA_SOURCE_LEDGER.zlib.base64';COL_NAME='DISPLAY_ONLY • support-distance colors';UNKNOWN_COLOR=(0.34,0.38,0.43)

def file_sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()

def source_fingerprint():
 h=hashlib.sha256();objects=sorted((o for o in bpy.data.objects if o.get('source_reference')),key=lambda o:o.name)
 for o in objects:
  h.update(o.name.encode()+b'\0'+o.type.encode()+b'\0')
  h.update(struct.pack('<16d',*(float(v) for row in o.matrix_world for v in row)))
  if o.type=='MESH':
   m=o.data;h.update(struct.pack('<QQQ',len(m.vertices),len(m.edges),len(m.polygons)))
   a=[0.0]*(len(m.vertices)*3);m.vertices.foreach_get('co',a);h.update(struct.pack('<%sf'%len(a),*a))
   e=[0]*(len(m.edges)*2);m.edges.foreach_get('vertices',e);h.update(struct.pack('<%si'%len(e),*e))
   for p in m.polygons:
    h.update(struct.pack('<I',len(p.vertices)));h.update(struct.pack('<%si'%len(p.vertices),*p.vertices))
   for attr in sorted(m.attributes,key=lambda x:x.name):
    h.update((attr.name+'|'+attr.domain+'|'+attr.data_type+'\0').encode())
    if attr.data_type=='FLOAT':vals=[0.0]*len(attr.data);attr.data.foreach_get('value',vals);h.update(struct.pack('<%sf'%len(vals),*vals))
    elif attr.data_type in ('INT','BOOLEAN'):
     vals=[0]*len(attr.data);attr.data.foreach_get('value',vals);h.update(struct.pack('<%si'%len(vals),*vals))
    elif attr.data_type=='INT32_2D':
     vals=[0]*(len(attr.data)*2);attr.data.foreach_get('value',vals);h.update(struct.pack('<%si'%len(vals),*vals))
    elif attr.data_type=='FLOAT_VECTOR':
     vals=[0.0]*(len(attr.data)*3);attr.data.foreach_get('vector',vals);h.update(struct.pack('<%sf'%len(vals),*vals))
    elif attr.data_type=='FLOAT_COLOR':
     vals=[0.0]*(len(attr.data)*4);attr.data.foreach_get('color',vals);h.update(struct.pack('<%sf'%len(vals),*vals))
    else:
     for item in attr.data:h.update(repr(tuple(item.keys())).encode() if hasattr(item,'keys') else repr(item).encode())
  elif o.type=='CURVE':
   for s in o.data.splines:
    h.update(s.type.encode()+struct.pack('<I',len(s.points) if s.type=='POLY' else len(s.bezier_points)))
    points=s.points if s.type=='POLY' else s.bezier_points
    for p in points:h.update(struct.pack('<4d',*(float(v) for v in p.co)))
  for k in sorted(o.keys()):
   if k!='_RNA_UI':h.update(str(k).encode()+b'='+repr(o[k]).encode()+b'\0')
 return h.hexdigest(),len(objects)

def load_source_ledger():
 t=bpy.data.texts.get(SOURCE_TEXT)
 if t is None:raise RuntimeError('Embedded source ledger not found in all-branches source blend')
 raw=zlib.decompress(base64.b64decode(''.join(t.as_string().split())))
 return json.loads(raw),hashlib.sha256(raw).hexdigest()

def point_on_polyline(q,points,tol=1e-4):
 q=Vector(tuple(float(x) for x in q))
 for a,b in zip(points,points[1:]):
  a=Vector(tuple(float(x) for x in a));b=Vector(tuple(float(x) for x in b));d=b-a
  t=0.0 if d.length_squared==0 else max(0.0,min(1.0,(q-a).dot(d)/d.length_squared))
  if (q-(a+d*t)).length<=tol:return True
 return False

def mat_for(name,rgb):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
 m.diffuse_color=(*rgb,1.0);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF')
 if p:
  p.inputs['Base Color'].default_value=(*rgb,1.0)
  if 'Emission Color' in p.inputs:p.inputs['Emission Color'].default_value=(*rgb,1.0)
  if 'Emission Strength' in p.inputs:p.inputs['Emission Strength'].default_value=.22
  p.inputs['Roughness'].default_value=.42
 return m

def aim_camera(scene,center,span):
 cam=scene.camera
 if cam is None:raise RuntimeError('Base view camera missing')
 direction=Vector((1.45,-1.85,1.28)).normalized();cam.location=center+direction*(span*2.25);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
 cam.data.type='ORTHO';cam.data.ortho_scale=span*2.0;cam.data.lens=50
 return cam

if not INPUT.exists():raise FileNotFoundError('Wait for parent score output: '+str(INPUT))
meta=json.loads(BASE_META.read_text(encoding='utf-8-sig'))
if file_sha(BASE).lower()!=EXPECTED_BASE_SHA or meta.get('sha256')!=EXPECTED_BASE_SHA:raise RuntimeError('MINIA_ALL_BRANCHES_VIEW input is not the locked source blend')
if bpy.data.filepath and Path(bpy.data.filepath).resolve()!=BASE.resolve():raise RuntimeError('Builder must be invoked with MINIA_ALL_BRANCHES_VIEW.blend open')
score=json.loads(INPUT.read_text(encoding='utf-8-sig'));segments=score.get('segments');palette=score.get('palette')
UNKNOWN_COLOR=tuple(float(x) for x in score.get('unknown_color',UNKNOWN_COLOR))
if not isinstance(segments,list) or len(segments)!=int(score.get('segment_count',-1)):raise ValueError(f"Expected {score.get('segment_count')} scored subsegments, got {len(segments) if isinstance(segments,list) else None}")
if not isinstance(palette,list) or len(palette)!=32:raise ValueError('Expected a 32-color RGB palette')
if len(UNKNOWN_COLOR)!=3 or any(x<0 or x>1 for x in UNKNOWN_COLOR):raise ValueError('Expected normalized gray unknown_color')
for i,c in enumerate(palette):
 if len(c)!=3 or any(not math.isfinite(float(x)) or float(x)<0 or float(x)>1 for x in c):raise ValueError(f'Bad normalized RGB palette entry {i}')
ledger,ledger_sha=load_source_ledger();records=ledger.get('records',[]);byid={r['id']:r for r in records}
expected=set(byid);got=[s.get('branch_id') for s in segments]
if len(records)!=9421 or len(expected)!=9421:raise ValueError(f'Embedded ledger does not contain 9,421 unique branch IDs: {len(expected)}')
if int(score.get('branch_count',-1))!=9421 or len(set(got))!=9421 or set(got)!=expected:raise ValueError(f'Score coverage mismatch: score unique={len(set(got))}; missing={len(expected-set(got))}; extra={len(set(got)-expected)}')
score_sha=file_sha(INPUT);before,source_object_count=source_fingerprint()
segments_by_branch={}
for s in segments:
 bid=s['branch_id'];row=byid[bid];points=row.get('points_plate_mm')
 if not points or len(points)<2:raise ValueError(f'Source polyline missing for {bid}')
 for key in ('a','b'):
  q=s[key]
  if len(q)!=3 or not point_on_polyline(q,points):raise ValueError(f'Score subsegment endpoint does not bind to source polyline for {bid}/{key}')
 d=float(s['distance_mm']);ed=float(s['effective_distance_mm'])
 if not math.isfinite(d) or not math.isfinite(ed) or d<0 or ed<0:raise ValueError(f'Invalid support distance for {bid}')
 if not isinstance(s.get('merge_bonus'),bool):raise ValueError(f'Missing merge_bonus bool for {bid}')
 b=s.get('color_bin')
 if b is not None and (not isinstance(b,int) or b<0 or b>31):raise ValueError(f'Invalid color bin for {bid}')
 segments_by_branch.setdefault(bid,[]).append(s)
for bid,parts in segments_by_branch.items():
 for a,b in zip(parts,parts[1:]):
  if max(abs(float(a['b'][k])-float(b['a'][k])) for k in range(3))>1e-4:raise ValueError(f'Segment gap/order mismatch for {bid}')
 pts=byid[bid]['points_plate_mm'];first,last=parts[0]['a'],parts[-1]['b']
 direct=sum(abs(float(first[k])-float(pts[0][k]))+abs(float(last[k])-float(pts[-1][k])) for k in range(3))
 reverse=sum(abs(float(first[k])-float(pts[-1][k]))+abs(float(last[k])-float(pts[0][k])) for k in range(3))
 if min(direct,reverse)>2e-4:raise ValueError(f'Subsegments do not span complete source branch {bid}')

root=bpy.data.collections.new(COL_NAME);bpy.context.scene.collection.children.link(root);root['display_only']=True;root['manufacturing_geometry']=False;root['score_json_sha256']=score_sha
bybin={i:[] for i in range(32)};bybin[None]=[];bin_ids={i:[] for i in range(32)};bin_ids[None]=[];points_flat=[]
for s in segments:
 bid=s['branch_id'];path=[s['a'],s['b']];key=s['color_bin'];bybin[key].append(path);bin_ids[key].append(bid)
 points_flat.extend(path)
materials={i:mat_for(f'Support distance bin {i:02d}',tuple(float(x) for x in palette[i])) for i in range(32)};materials[None]=mat_for('Support distance • unverified gray',UNKNOWN_COLOR)
for key,paths in bybin.items():
 if not paths:continue
 cu=bpy.data.curves.new(f'SUPPORT_DISTANCE_BIN_{key if key is not None else "UNKNOWN"}','CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=.07;cu.bevel_resolution=2;cu.use_fill_caps=True
 for coords in paths:
  sp=cu.splines.new('POLY');sp.points.add(1)
  for p,co in zip(sp.points,coords):p.co=(float(co[0]),float(co[1]),float(co[2]),1.0)
 ob=bpy.data.objects.new(f'Support distance • {key if key is not None else "unverified"} • {len(paths)} subsegments',cu);root.objects.link(ob);ob.data.materials.append(materials[key]);ob['display_only']=True;ob['manufacturing_geometry']=False;ob['user_heuristic']='USER_HEURISTIC / DECLARED_GRAPH_ASSUMPTIONS';ob['color_bin']=int(key) if key is not None else -1;ob['segment_count']=len(paths);ob['branch_ids_json']=json.dumps(sorted(set(bin_ids[key])),separators=(',',':'))

# Hide original/reference geometry without changing its mesh data; only display-only colored copies stay visible.
scene=bpy.context.scene
for c in bpy.data.collections:
 if c==root:continue
 if c.name==COL_NAME:continue
 if c.name.startswith('DISPLAY_ONLY'):
  c.hide_viewport=False;c.hide_render=False
  for o in c.objects:
   is_cam=o.type=='CAMERA';is_light=o.type=='LIGHT'
   o.hide_viewport=not (is_cam or is_light);o.hide_render=not (is_cam or is_light)
 else:c.hide_viewport=True;c.hide_render=True
# Keep all source-reference objects present and fingerprintable while collections remain hidden.
for o in bpy.data.objects:
 if o.get('source_reference'):o.hide_viewport=False;o.hide_render=True
# Parent collections are hidden; object-level viewport flags remain as they came from the source file.
root.hide_viewport=False;root.hide_render=False
# Ensure the visible set contains only display curves, camera and lights.
for o in bpy.data.objects:
 if o.get('source_reference'):o.hide_viewport=True;o.hide_render=True
scene.world.color=(.78,.8,.83);scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW);scene.render.film_transparent=False
# Background and material contrast are deliberately set for red/green/gray readability.
if scene.world and scene.world.use_nodes:
 bg=scene.world.node_tree.nodes.get('Background')
 if bg:bg.inputs['Color'].default_value=(.76,.78,.81,1);bg.inputs['Strength'].default_value=.8
# Source-wide framing based on every assigned point, not local DEMO crop.
mins=[min(float(p[k]) for p in points_flat) for k in range(3)];maxs=[max(float(p[k]) for p in points_flat) for k in range(3)];center=Vector([(mins[k]+maxs[k])*.5 for k in range(3)]);span=max(maxs[k]-mins[k] for k in range(3));cam=aim_camera(scene,center,span)
# Camera-facing legend stays in the display-only collection, outside source geometry.
bpy.context.view_layer.update();frame=cam.data.view_frame(scene=scene);x0=min(v.x for v in frame);y1=max(v.y for v in frame)
legend_data=bpy.data.curves.new('SUPPORT_DISTANCE_LEGEND_TEXT','FONT');legend_data.body='FINISHED GEOMETRY - SUPPORT INCLUDED\nGREEN = NEAR SUPPORT    RED = FAR    GRAY = NO MAPPED ROUTE\nASSUMPTION-BASED COLOR MAP - NOT SAFETY OR STRENGTH'
legend_data.size=2.4;legend_data.align_x='LEFT';legend_data.extrude=0
legend_obj=bpy.data.objects.new('DISPLAY_ONLY • support distance legend',legend_data);root.objects.link(legend_obj);legend_obj.location=cam.matrix_world@Vector((x0+16.0,y1-18.0,-30.0));legend_obj.rotation_euler=cam.rotation_euler;legend_obj['display_only']=True;legend_obj['manufacturing_geometry']=False
legend_mat=mat_for('Support distance legend • dark text',(.035,.045,.06));legend_data.materials.append(legend_mat)
# Save non-provenance display notes as an embedded text block and scene metadata.
rule=('USER_HEURISTIC / DECLARED_GRAPH_ASSUMPTIONS. Finished geometry is colored under the assumption that external supports remain present. Green means nearer a declared support region; red means farther along a branch. Gray marks only a scoring-ledger route that has no mapping; it does not establish physical danger or prove absence of all real contacts. The supplied 35% merge bonus applies only to backbone paths connecting distinct declared support-contact regions; shared tails do not receive a bonus. This is not live printer status, a safety certification, strength prediction, complete contact graph, or toolpath analysis.')
t=bpy.data.texts.new('SUPPORT_DISTANCE_COLOR_RULE • display-only');t.write(rule)
scene['support_distance_state']='USER_HEURISTIC / DECLARED_GRAPH_ASSUMPTIONS';scene['support_distance_gray_semantics']='NO_MAPPED_ROUTE_IN_SCORING_LEDGER; NOT PROVEN PHYSICALLY UNSUPPORTED OR DANGEROUS';scene['support_score_json_sha256']=score_sha;scene['support_source_support_sha256']=score.get('source_support_sha256','');scene['support_source_flower_sha256']=score.get('source_flower_sha256','');scene['protected_source_fingerprint_sha256']=before;scene['source_ledger_sha256']=ledger_sha;scene['support_color_branch_count']=len(set(got));scene['support_color_segment_count']=len(segments);scene['support_color_bin_count']=sum(1 for k,v in bybin.items() if v);scene['unknown_segment_count']=len(bybin[None]);scene['support_finished_geometry_with_support_assumed']=True;scene['display_only_geometry']=True;scene['manufacturing_geometry_changed']=False
# Solid viewport uses material colors; material nodes/emission support final preview.
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.shading.type='SOLID';area.spaces.active.shading.color_type='MATERIAL';area.spaces.active.overlay.show_floor=False;area.spaces.active.overlay.show_axis_x=False;area.spaces.active.overlay.show_axis_y=False
# Save only this new color-visualization blend.
before_save=source_fingerprint()[0]
if before_save!=before:raise RuntimeError('Protected source-reference geometry changed during display build')
bpy.ops.wm.save_as_mainfile(filepath=str(DEST))
# Render an image from the saved scene; no save back to the blend after rendering.
bpy.ops.render.render(write_still=True)
after,source_object_count_after=source_fingerprint()
if after!=before:raise RuntimeError('Protected source fingerprint changed after rendering')
counts={str(k) if k is not None else 'unknown':len(v) for k,v in bybin.items()}
qa={'status':'DISPLAY_ONLY_BUILD_PASS','input_blend':str(BASE),'input_blend_sha256':EXPECTED_BASE_SHA,'score_json':str(INPUT),'score_json_sha256':score_sha,'embedded_ledger_sha256':ledger_sha,'branch_coverage':{'expected_unique_branches':9421,'scored_unique_branches':len(set(got)),'displayed_subsegments':len(segments),'unknown_gray_subsegments':len(bybin[None]),'duplicate_scored_branch_ids_are_expected_subsegments':len(got)-len(set(got))},'color_bin_counts_subsegments':counts,'source_reference_objects':source_object_count,'source_fingerprint_before_sha256':before,'source_fingerprint_before_save_sha256':before_save,'source_fingerprint_after_render_sha256':after,'source_unchanged':before==before_save==after,'display_objects':len(root.objects),'all_display_objects_marked_display_only':all(bool(o.get('display_only')) and o.get('manufacturing_geometry') is False for o in root.objects),'source_paths_hidden':True,'flowers_support_hidden':True,'manufacturing_geometry_changed':False,'heuristic':'USER_HEURISTIC / DECLARED_GRAPH_ASSUMPTIONS','blend_sha256':file_sha(DEST),'preview':str(PREVIEW)}
QA.write_text(json.dumps(qa,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(qa,indent=2,ensure_ascii=False),flush=True)
