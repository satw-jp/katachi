import bpy, json, math, hashlib, os
from pathlib import Path
from mathutils import Vector

ROOT=Path(r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra')
SRC=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs')
OUT=ROOT/'outputs'
OUT.mkdir(parents=True,exist_ok=True)
BLEND=OUT/'MINIA_INTERNAL_REPAIR_EDITOR_V1.blend'
SCALE=0.733333333333333
TRANS=(89.58849309285478,91.38825149536129,1.295108767881461)

def read(rel): return json.loads((SRC/rel).read_text(encoding='utf-8-sig'))
def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(4*1024*1024),b''): h.update(chunk)
 return h.hexdigest()
def plate(p): return [float(p[i])*SCALE+TRANS[i] for i in range(3)]

a=read('R4_A_F2_PRINT_PREPARATION/A/data/structure.json')['members']
lr=read('R4_A_MINI_LOCAL_LOBE_R1/data/ADDED.json')
roots=read('R4_ROOT_LAUNCH_R5/data/FROZEN_ADDITIONS.json')
support=read('R4_A_F2_PRINT_PREPARATION/A/data/support_geometry.json')['objects']
flowers=read('R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface']
assignment=read('R4_A_F2_PRINT_PREPARATION/A/data/FLOWER_PRINT_ASSIGNMENT.json')
records=[]
for group,rows in [('A_ORIGINAL',a),('LOCAL_LOBE',lr),('FROZEN_ROOT',roots)]:
 for row in rows:
  rr={k:row.get(k) for k in ['id','kind','parent_id','target_id','flower_id','radius_mm','diameter_mm','tip_diameter_mm','local_taper_length_mm','ancestry','petal_index'] if k in row}
  rr.update({'source_group':group,'points_source_mm':row['points_mm'],'points_plate_mm':[plate(p) for p in row['points_mm']]})
  records.append(rr)
assert len(records)==9421 and len(a)==4240 and len(lr)==3 and len(roots)==5178

# Clean default scene only; no source/manufacturing file is opened or modified.
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection': bpy.data.collections.remove(c)
rootcol=bpy.data.collections.get('Collection') or bpy.data.collections.new('MINIA_INTERNAL_REPAIR_EDITOR')
if rootcol.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(rootcol)
rootcol.name='MINIA_INTERNAL_REPAIR_EDITOR'

def collection(name):
 c=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
def move_to(obj,col):
 for c in list(obj.users_collection): c.objects.unlink(obj)
 col.objects.link(obj)
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1); return m
mat_a=material('Reference gray • A originals',(0.48,0.53,0.58))
mat_lr=material('Reference cyan • Local Lobe',(0.17,0.58,0.66))
mat_root=material('Reference pale gold • frozen roots',(0.84,0.67,0.33))
mat_flower=material('Flower locator • approximate bounds',(0.57,0.49,0.70))
mat_support=material('Support reference • hidden',(0.35,0.42,0.48))
mat_author=material('AUTHOR_EDIT • new branches',(1.0,0.28,0.045))
col_a=collection('PERMANENT_EXISTING • A source')
col_lr=collection('PERMANENT_EXISTING • LR001–LR003')
col_roots=collection('PERMANENT_EXISTING • 5178 frozen roots')
col_outer=collection('REFERENCE_OUTER_LOCKED • flower locators approximate')
col_auth=collection('AUTHOR_EDIT • endpoints and new edges')
col_support=collection('REMOVABLE_SUPPORT_REFERENCE • hidden locked')
col_weak=collection('WEAK_POINT_MARKERS • unset until Author locates')
col_stage=collection('DISPLAY_ONLY • camera lights')

ledger={'schema':'MINIA_SOURCE_LEDGER_V1','units':'Blender 1 unit = 1 mm; scene scale_length=0.001','source_to_plate':{'scale':SCALE,'translation_mm':list(TRANS)},'source_record_count':len(records),'groups':{'A_ORIGINAL':len(a),'LOCAL_LOBE':len(lr),'FROZEN_ROOT':len(roots)},'records':records,'flowers':[],'support':[],'anchor_registry':[],'weak_point_markers':[{'id':'REPAIR_001','status':'UNSET','position_plate_mm':None,'comment':'No specific damage location has been asserted in this editor baseline. Add location/comment only after Author identifies it.'}]}

def make_curve_object(name,rows,col,mat,kind='permanent',bevel=0.8):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=bevel;cu.bevel_resolution=1
 for row in rows:
  pts=row.get('points_plate_mm') or [plate(p) for p in row['points_mm']]
  s=cu.splines.new('POLY');s.points.add(len(pts)-1)
  d0=float(row.get('radius_mm',row.get('nominal_diameter_mm',0.35)/2) or 0.35)
  d1=float(row.get('tip_diameter_mm',d0*2) or d0*2)/2
  for i,p in enumerate(pts):
   s.points[i].co=(p[0],p[1],p[2],1)
   t=i/max(1,len(pts)-1)
   radius=(d0*(1-t)+d1*t)*SCALE if kind=='permanent' else d0
   s.points[i].radius=max(0.025,radius/max(1e-9,bevel))
 obj=bpy.data.objects.new(name,cu);col.objects.link(obj);obj.data.materials.append(mat);obj.hide_select=True;obj['display_only']=True;obj['manufacturing_geometry']=False
 return obj

make_curve_object('A_SOURCE_CENTERLINES • 4240 IDs',records[:len(a)],col_a,mat_a)
make_curve_object('LOCAL_LOBE_CENTERLINES • 3 IDs',records[len(a):len(a)+len(lr)],col_lr,mat_lr)
make_curve_object('FROZEN_ROOT_CENTERLINES • 5178 IDs',records[len(a)+len(lr):],col_roots,mat_root)

# A compact, coordinate-faithful endpoint vertex set: two anchors per source record.
verts=[];anchor=[]
for ri,row in enumerate(records):
 for ei,p in ((0,row['points_plate_mm'][0]),(1,row['points_plate_mm'][-1])):
  ai=len(verts);verts.append(tuple(p));anchor.append({'anchor_index':ai,'record_index':ri,'record_id':row['id'],'source_group':row['source_group'],'endpoint':'START' if ei==0 else 'END','position_plate_mm':p})
mesh=bpy.data.meshes.new('AUTHOR_EDIT anchors only • initial edge count 0');mesh.from_pydata(verts,[],[]);mesh.update()
obj=bpy.data.objects.new('AUTHOR_EDIT • select two endpoint vertices then F',mesh);col_auth.objects.link(obj);obj.show_wire=True;obj.show_all_edges=True;obj.display_type='WIRE';obj.color=(1.0,0.25,0.03,1);obj['source_edge_count_at_baseline']=0;obj['anchors_are_editable_and_changes_are_audited']=True
attr=mesh.attributes.new('anchor_index','INT','POINT')
for i,x in enumerate(attr.data):x.value=i
attr=mesh.attributes.new('record_index','INT','POINT')
for i,x in enumerate(attr.data):x.value=anchor[i]['record_index']
attr=mesh.attributes.new('endpoint_index','INT','POINT')
for i,x in enumerate(attr.data):x.value=0 if anchor[i]['endpoint']=='START' else 1
ledger['anchor_registry']=anchor

# Flower position/orientation locator plus axis-aligned source bounds. Not flower mesh.
lookup={r['id']:r for r in flowers}
flower_assignment={x['flower_id']:x for x in assignment}
allv=[];alledges=[]
for fid,f in lookup.items():
 pos=plate(f['position_mm']);normal=f.get('normal',[0,0,1]);b=f.get('bbox_mm')
 if not b: continue
 lo=[b[0][i]*SCALE+TRANS[i] for i in range(3)];hi=[b[1][i]*SCALE+TRANS[i] for i in range(3)]
 start=len(allv);allv += [(x,y,z) for z in [lo[2],hi[2]] for y in [lo[1],hi[1]] for x in [lo[0],hi[0]]]
 # vertex order: bottom 0..3 and top 4..7
 alledges += [(start+i,start+((i+1)%4)) for i in range(4)]
 alledges += [(start+4+i,start+4+((i+1)%4)) for i in range(4)]
 alledges += [(start+i,start+4+i) for i in range(4)]
 ledger['flowers'].append({'id':fid,'position_plate_mm':pos,'normal_source':normal,'orientation_matrix_source':f.get('orientation_matrix'),'petal_count':f.get('petal_count'),'source_bbox_plate_mm':[lo,hi],'assignment':flower_assignment.get(fid,{}).get('representation'),'locator_is_approximate':True})
fm=bpy.data.meshes.new('Flower source position and bbox locator mesh • display only');fm.from_pydata(allv,alledges,[]);fm.update();fo=bpy.data.objects.new('FLOWER_POSITION_AND_BOUNDS_LOCATORS • approximate',fm);col_outer.objects.link(fo);fo.data.materials.append(mat_flower);fo.hide_select=True;fo['display_only']=True;fo['manufacturing_geometry']=False;fo['shape_note']='Source positions, normals/orientation and axis-aligned source bounds; not actual flower surface mesh.'

# Authored Support centerline locator: hidden by default, locked.
support_rows=[]
for s in support:
 support_rows.append({'id':s['id'],'kind':s.get('kind'),'points_mm':s.get('points_mm',[]),'nominal_diameter_mm':s.get('nominal_diameter_mm',0.6),'target':s.get('target'),'removal_direction':s.get('removal_direction')})
ledger['support']=support_rows
suobj=make_curve_object('SUPPORT_CENTERLINE_LOCATORS • authored support source',support_rows,col_support,mat_support,kind='support',bevel=0.25)
col_support.hide_viewport=True;col_support.hide_render=True

# No point is marked damaged. REPAIR_001 is an unset record in the embedded ledger.
col_weak['state']='No known damage location; do not infer a failure marker.'

# Scene metadata and embedded baseline ledger.
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=0.001;scene.unit_settings.length_unit='MILLIMETERS'
scene['editor_version']='MINIA_INTERNAL_REPAIR_EDITOR_V1';scene['baseline_editable_sha256']='2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736';scene['baseline_source_lock_sha256']='04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded';scene['manufacturing_geometry_changed']=False;scene['slice_send_print_count']=0
text=bpy.data.texts.new('MINIA_SOURCE_LEDGER.json');text.write(json.dumps(ledger,separators=(',',':')))
# Keep data summary in scene; ID metadata retained in text ledger.
scene['protected_source_record_count']=9421;scene['flower_locator_count']=len(ledger['flowers']);scene['support_locator_count']=len(support_rows)

# User-friendly overview camera and lights for a display-only preview.
center=Vector((125,125,90))
camd=bpy.data.cameras.new('Overview camera');cam=bpy.data.objects.new('Overview camera',camd);col_stage.objects.link(cam);cam.location=center+Vector((0,-560,235));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=400;scene.camera=cam
ld=bpy.data.lights.new('Softbox','AREA');lo=bpy.data.objects.new('Softbox',ld);col_stage.objects.link(lo);lo.location=center+Vector((-100,-200,300));ld.energy=2200;ld.size=340;lo.rotation_euler=(center-lo.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1600;scene.render.resolution_y=1600;scene.render.resolution_percentage=100
scene.world.color=(0.055,0.065,0.08)
# Save with the overview framed in any available 3D viewport.
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   r3d=area.spaces.active.region_3d;r3d.view_location=center;r3d.view_distance=470;r3d.view_rotation=cam.rotation_euler.to_quaternion();r3d.view_perspective='ORTHO'
# Select only the empty branch-edit layer on open.
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print(json.dumps({'blend':str(BLEND),'source_records':len(records),'flower_locators':len(ledger['flowers']),'support_locators':len(support_rows),'anchors':len(anchor),'author_edges':len(mesh.edges),'bytes':BLEND.stat().st_size,'sha256':sha(BLEND)}))
