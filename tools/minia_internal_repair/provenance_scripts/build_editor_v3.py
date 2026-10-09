import bpy,json,hashlib,zlib,base64
from pathlib import Path
from mathutils import Vector,Matrix
import numpy as np
ROOT=Path(r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra');SRC=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs');OUT=ROOT/'outputs';WORK=ROOT/'work/luna_editor';OUT.mkdir(exist_ok=True);WORK.mkdir(exist_ok=True)
BLEND=OUT/'MINIA_INTERNAL_REPAIR_EDITOR_V1.blend';SCALE=.733333333333333;TRANS=np.array([89.58849309285478,91.38825149536129,1.295108767881461])
DEMO_IDS={'G0165','C0016','G0181','C0031','A3457','LR002','R5_F3457_P1','R5_F3457_P2','R5_F3457_P3','R5_F3457_P4','R5_F3457_P5','R5_F3457_P6'}
def read(rel):return json.loads((SRC/rel).read_text(encoding='utf-8-sig'))
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def plate(p):return np.asarray(p,dtype=np.float64)*SCALE+TRANS

a=read('R4_A_F2_PRINT_PREPARATION/A/data/structure.json')['members'];lr=read('R4_A_MINI_LOCAL_LOBE_R1/data/ADDED.json');roots=read('R4_ROOT_LAUNCH_R5/data/FROZEN_ADDITIONS.json');support=read('R4_A_F2_PRINT_PREPARATION/A/data/support_geometry.json')['objects'];surface=read('R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface'];assignment=read('R4_A_F2_PRINT_PREPARATION/A/data/FLOWER_PRINT_ASSIGNMENT.json')
groups=[('A_ORIGINAL',a),('LOCAL_LOBE',lr),('FROZEN_ROOT',roots)];records=[]
for g,rows in groups:
 for r in rows:records.append({'id':r['id'],'source_group':g,'source_record':r,'points_plate_mm':[plate(p).tolist() for p in r['points_mm']]})
assert len(records)==9421
byid={x['id']:x for x in records};assert DEMO_IDS<=set(byid)
demo=[byid[x] for x in sorted(DEMO_IDS)]
ledger={'schema':'MINIA_SOURCE_LEDGER_V1','baseline_editable_sha256':'2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736','native_source_lock_sha256':'04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded','coordinate_frame':'plate mm; one Blender unit = 1 mm','source_to_plate':{'scale':SCALE,'translation_mm':TRANS.tolist()},'group_counts':{'A_ORIGINAL':len(a),'LOCAL_LOBE':len(lr),'FROZEN_ROOT':len(roots)},'records':records,'flower_records':surface,'flower_assignment':assignment,'support_records':support,'demo':{'label':'DEMO F3457/G0181 region; not identified physical damage','member_ids':sorted(DEMO_IDS),'evidence':'SELECTED_GEOMETRY_CONTACTS.json'},'weak_markers':{'instruction':'Author may add Empty named REPAIR_001 at an identified location and string custom property comment. No initial marker; no damage location is asserted.'}}
ledger_path=WORK/'MINIA_SOURCE_LEDGER.json';ledger_path.write_text(json.dumps(ledger,separators=(',',':'),ensure_ascii=False),encoding='utf-8')
print('phase: source ledger prepared',flush=True)
# new scene
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name=='Collection':bpy.data.collections.remove(c)
def collection(n):c=bpy.data.collections.new(n);bpy.context.scene.collection.children.link(c);return c
def mat(n,c):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;b=next((x for x in m.node_tree.nodes if x.type=='BSDF_PRINCIPLED'),None)
 if b:
  rgba=(*c,1);b.inputs['Base Color'].default_value=rgba
  for socket in b.inputs:
   if socket.name=='Emission Color':socket.default_value=rgba
   elif socket.name=='Emission Strength':socket.default_value=.35
 return m
col_global=collection('PERMANENT_EXISTING • global source paths • hidden toggle');col_demo=collection('DEMO_F3457 • local source paths • not known damage');col_all_anchor=collection('AUTHOR_EDIT • all anchors • hidden');col_demo_anchor=collection('AUTHOR_EDIT • DEMO local anchors • select 2 then F');col_flowers=collection('REFERENCE_OUTER_LOCKED • source flower locators');col_support=collection('REMOVABLE_SUPPORT_REFERENCE • authored • hidden');col_marker=collection('WEAK_POINT_MARKERS • author adds only');col_preview=collection('DISPLAY_ONLY • preview markers, camera and lights')
matgray=mat('Protected source • gray',(.44,.50,.56));matdemo=mat('DEMO source path • blue',(.20,.58,.72));matorange=mat('AUTHOR_EDIT • orange',(1,.25,.03));matflower=mat('D6 flower template proxy',(.73,.48,.75));matsupport=mat('Support centerline • gray',(.35,.4,.45))
# Source path reference meshes: one batched polyline mesh per source group, radius/taper/parent etc retained verbatim in ledger.
def make_poly(name,rows,col,material):
 vv=[];ee=[];ri=[];rad=[];pid=[]
 recmap={r['id']:i for i,r in enumerate(records)}
 for r in rows:
  pts=r['points_plate_mm'];b=len(vv);vv.extend([tuple(p) for p in pts]);ee.extend((b+i,b+i+1) for i in range(len(pts)-1));src=r['source_record'];rr=float(src.get('radius_mm',float(src.get('diameter_mm',1))/2));tip=float(src.get('tip_diameter_mm',2*rr))/2
  for k in range(len(pts)):
   t=k/max(1,len(pts)-1);ri.append(recmap[r['id']]);rad.append((rr*(1-t)+tip*t)*SCALE);pid.append(k)
 me=bpy.data.meshes.new(name+' • centerline edges');me.from_pydata(vv,ee,[]);me.update()
 for nam,typ,values in [('source_record_index','INT',ri),('radius_mm_plate','FLOAT',rad),('centerline_point_index','INT',pid)]:
  at=me.attributes.new(nam,typ,'POINT')
  for x,v in zip(at.data,values):x.value=v
 o=bpy.data.objects.new(name,me);col.objects.link(o);o.data.materials.append(material);o.hide_select=True;o['display_only']=True;o['manufacturing_geometry']=False;o['source_reference']=True;o['source_record_count']=len(rows);return o
for g,rows in groups:make_poly(g+' • source centerlines',byid_rows:=[r for r in records if r['source_group']==g],col_global,matgray)
print('phase: global meshes done',flush=True)
col_global.hide_viewport=True;col_global.hide_render=True
# Local demo uses beveled Curve strokes so the preview is visible in rendered image.
def make_demo_curves(rows):
 cu=bpy.data.curves.new('DEMO paths • display strokes','CURVE');cu.dimensions='3D';cu.bevel_depth=.22;cu.bevel_resolution=1;cu.resolution_u=1
 for r in rows:
  pts=r['points_plate_mm'];sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
  src=r['source_record'];rr=float(src.get('radius_mm',float(src.get('diameter_mm',1))/2));tip=float(src.get('tip_diameter_mm',2*rr))/2
  for i,p in enumerate(pts):sp.points[i].co=(*p,1);t=i/max(1,len(pts)-1);sp.points[i].radius=max(.05,(rr*(1-t)+tip*t)*SCALE/.22)
 o=bpy.data.objects.new('DEMO • 12 selected existing source members',cu);col_demo.objects.link(o);o.data.materials.append(matdemo);o.hide_select=True;o['display_only']=True;o['manufacturing_geometry']=False;o['source_reference']=True;o['ids']=','.join(r['id'] for r in rows);return o
make_demo_curves(demo)
print('phase: demo curves done',flush=True)
# Vertex-only author anchors, with stable ID attributes. Global anchors stay hidden, local demo anchors visible.
def anchors(name,rows,col):
 vv=[];reg=[];ridx=[];eidx=[];recmap={r['id']:i for i,r in enumerate(records)}
 for r in rows:
  for e,p in [('START',r['points_plate_mm'][0]),('END',r['points_plate_mm'][-1])]:
   j=len(vv);vv.append(tuple(p));reg.append({'anchor_id':r['id']+':'+e,'anchor_index':j,'record_index':recmap[r['id']],'record_id':r['id'],'endpoint':e,'position_plate_mm':p});ridx.append(recmap[r['id']]);eidx.append(0 if e=='START' else 1)
 me=bpy.data.meshes.new(name+' • no baseline edges');me.from_pydata(vv,[],[]);me.update()
 for nam,typ,values in [('anchor_index','INT',range(len(vv))),('record_index','INT',ridx),('endpoint_index','INT',eidx)]:
  at=me.attributes.new(nam,typ,'POINT')
  for x,v in zip(at.data,values):x.value=int(v)
 ob=bpy.data.objects.new(name,me);col.objects.link(ob);ob.show_wire=True;ob.show_all_edges=True;ob.display_type='WIRE';ob.color=(1,.24,.02,1);ob['baseline_edge_count']=0;ob['anchors_are_audited']=True
 return ob,reg
allanchors,regall=anchors('AUTHOR_EDIT_ALL • protected point baseline',records,col_all_anchor);col_all_anchor.hide_viewport=True;col_all_anchor.hide_render=True
print('phase: global anchors done',flush=True)
demoanchors,regdemo=anchors('AUTHOR_EDIT_DEMO • 24 endpoints, select two then F',demo,col_demo_anchor);ledger['anchor_registry_all']=regall;ledger['anchor_registry_demo']=regdemo
# Exact D6 template mesh proxy for F3457 from the frozen source NPZ, oriented/scaled by the saved source surface record.
tmpl=np.load(SRC/'R4_D6_SIZE_RHYTHM_V2/data/D6_local.npz');tv=np.asarray(tmpl['vertices'],dtype=np.float64);tf=np.asarray(tmpl['faces'],dtype=np.int32);flower=next(f for f in surface if f['id']=='F3457');R=np.asarray(flower['orientation_matrix'],dtype=np.float64)*float(flower['physical_scale']);world=tv@R.T+np.asarray(flower['position_mm']);local_plate=world*SCALE+TRANS
mesh=bpy.data.meshes.new('F3457 D6 template proxy • display only');mesh.from_pydata(local_plate.tolist(),[],tf.tolist());mesh.update();fo=bpy.data.objects.new('F3457 • D6 template proxy at exact source position/orientation',mesh);col_flowers.objects.link(fo);fo.data.materials.append(matflower);fo.hide_select=True;fo['display_only']=True;fo['manufacturing_geometry']=False;fo['source_reference']=True;fo['flower_id']='F3457';fo['position_plate_mm']=plate(flower['position_mm']).tolist();fo['orientation_matrix_source']=flower['orientation_matrix'];fo['fidelity']='Frozen D6 template proxy; source position/orientation match; per-flower assigned representation variant not rebuilt.'
print('phase: demo flower mesh done',flush=True)
# Global flower positions/normals retained as compact locked point-only locators, hidden by default.
positions=[plate(f['position_mm']) for f in surface];fmesh=bpy.data.meshes.new('4283 source flower positions');fmesh.from_pydata([tuple(x) for x in positions],[],[]);fmesh.update();fa=fmesh.attributes.new('flower_record_index','INT','POINT')
for i,x in enumerate(fa.data):x.value=i
fobj=bpy.data.objects.new('FLOWER_POSITION_LOCATORS • source points • hidden global',fmesh);col_flowers.objects.link(fobj);fobj.hide_select=True;fobj.hide_render=True;fobj['display_only']=True;fobj['manufacturing_geometry']=False;fobj['source_reference']=True;fobj['count']=len(surface);fobj['source_table']='embedded ledger flower_records';fobj.hide_set(True)
# Support source centerline locators: 22,373 objects/49,819 points, hidden and non-selectable.
sverts=[];sedges=[]
for r in support:
 pts=[plate(p) for p in r.get('points_mm',[])];b=len(sverts);sverts.extend([tuple(x) for x in pts]);sedges.extend((b+i,b+i+1) for i in range(len(pts)-1))
smesh=bpy.data.meshes.new('Authored support source centerline locators');smesh.from_pydata(sverts,sedges,[]);smesh.update();sa=smesh.attributes.new('support_record_index','INT','POINT');support_indices=[i for i,r in enumerate(support) for _ in r.get('points_mm',[])]
for x,v in zip(sa.data,support_indices):x.value=v
so=bpy.data.objects.new('SUPPORT • 22,373 source locators • hidden',smesh);col_support.objects.link(so);so.data.materials.append(matsupport);so.hide_select=True;so.hide_render=True;so['display_only']=True;so['manufacturing_geometry']=False;so['source_reference']=True;so['source_object_count']=len(support);so['source_point_count']=len(sverts);col_support.hide_viewport=True;col_support.hide_render=True
print('phase: support locators done',flush=True)
# Visible pair of nonselectable locator markers in the preview only; the mesh anchors themselves are selected in Edit Mode.
def marker(name,coord):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.62,location=coord);o=bpy.context.object;o.name=name
 for c in list(o.users_collection):c.objects.unlink(o)
 col_preview.objects.link(o);o.data.materials.append(matorange);o.scale=(1.7,)*3;o.hide_select=True;o['display_only']=True;o['anchor_for_demo']=True
# two deterministic anchors from selected demo IDs
p1=byid['G0181']['points_plate_mm'][0];p2=byid['A3457']['points_plate_mm'][-1]
marker('P1 • G0181 START',p1);marker('P2 • A3457 END',p2)
# Weak point protocol: empty until Author adds REPAIR_001 at a chosen coordinate.
col_marker['instruction']='Author may add Empty > Plain Axes, name REPAIR_001, move it to the chosen point, and add string custom property comment. No location is asserted.'
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=.001;scene.unit_settings.length_unit='MILLIMETERS';scene['editor_version']='MINIA_INTERNAL_REPAIR_EDITOR_V1';scene['baseline_editable_sha256']='2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736';scene['source_lock_sha256']='04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded';scene['source_records']=9421;scene['geometry_changed']=False;scene['slice_send_print']=0;scene['demo']='F3457/G0181 selected geometry; not physical damage identification'
print('phase: before embedding ledger',flush=True)
ledger_bytes=json.dumps(ledger,separators=(',',':'),ensure_ascii=False).encode('utf-8');print('phase: ledger serialized',len(ledger_bytes),flush=True);compressed=zlib.compress(ledger_bytes,1);zpath=WORK/'MINIA_SOURCE_LEDGER.json.zlib';zpath.write_bytes(compressed);encoded=base64.b64encode(compressed).decode('ascii');wrapped='\n'.join(encoded[i:i+100] for i in range(0,len(encoded),100));epath=WORK/'MINIA_SOURCE_LEDGER.zlib.base64';epath.write_text(wrapped,encoding='ascii');assert zlib.decompress(base64.b64decode(''.join(wrapped.split())))==ledger_bytes;print('phase: loading ledger Text from file',len(encoded),flush=True);text=bpy.data.texts.load(str(epath));text.name='MINIA_SOURCE_LEDGER.zlib.base64';text.use_fake_user=True;text.filepath='';scene['source_ledger_sha256']=hashlib.sha256(ledger_bytes).hexdigest();scene['source_ledger_zlib_bytes']=len(compressed)
print('phase: ledger embedded by load',len(ledger_bytes),len(compressed),flush=True)
# Renderable DEMO-only overview camera/lights.
center=Vector((37,96,42));camd=bpy.data.cameras.new('DEMO camera');cam=bpy.data.objects.new('DEMO camera',camd);col_preview.objects.link(cam);cam.location=center+Vector((30,-58,32));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=72;scene.camera=cam
ld=bpy.data.lights.new('DEMO softbox','AREA');light=bpy.data.objects.new('DEMO softbox',ld);col_preview.objects.link(light);light.location=center+Vector((-20,-30,42));ld.energy=8000;ld.size=70;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler();scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.75,.79,.84,1);bg.inputs['Strength'].default_value=.8;scene.view_settings.view_transform='Standard'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   rv=area.spaces.active.region_3d;rv.view_location=center;rv.view_distance=62;rv.view_rotation=cam.rotation_euler.to_quaternion();rv.view_perspective='ORTHO'
# Put explicit P1/P2 text labels next to the two demo endpoint markers.
for label,coord in [('P1: G0181 START',p1),('P2: A3457 END',p2)]:
 td=bpy.data.curves.new(label,'FONT');td.body=label;td.size=1.6;td.extrude=0
 to=bpy.data.objects.new(label,td);col_preview.objects.link(to);to.location=Vector(coord)+Vector((0,0,2.5));to.rotation_euler=cam.rotation_euler;to.data.materials.append(matorange);to['display_only']=True;to['manufacturing_geometry']=False
# Store transform and geometry fingerprints for every immutable source-reference object.
def fingerprint(o):
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
scene['source_reference_fingerprints']=json.dumps({o.name:fingerprint(o) for o in bpy.data.objects if o.get('source_reference')},sort_keys=True,separators=(',',':'))
bpy.ops.object.select_all(action='DESELECT');demoanchors.select_set(True);bpy.context.view_layer.objects.active=demoanchors
print('phase: save starting',flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print('phase: save complete',flush=True)
print(json.dumps({'status':'SAVED','blend':str(BLEND),'bytes':BLEND.stat().st_size,'sha256':sha(BLEND),'records':len(records),'demo_records':len(demo),'demo_anchors':len(regdemo),'baseline_author_edges':len(demoanchors.data.edges),'support_points':len(sverts),'demo_flower_vertices':len(mesh.vertices),'display_shape':'D6 template mesh; assignment-specific variant not reconstructed'}),flush=True)
