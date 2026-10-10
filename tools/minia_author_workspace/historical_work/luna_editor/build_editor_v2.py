import bpy, json, hashlib, struct, zlib
from pathlib import Path
from mathutils import Vector

ROOT=Path(r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra')
SRC=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs')
D6BLEND=SRC/'R4_D6_SIZE_RHYTHM_V2/blend/R4_D6_SIZE_RHYTHM_V2.blend'
OUT=ROOT/'outputs';WORK=ROOT/'work/luna_editor';OUT.mkdir(exist_ok=True);WORK.mkdir(exist_ok=True)
BLEND=OUT/'MINIA_INTERNAL_REPAIR_EDITOR_V1.blend'
SCALE=0.733333333333333;TRANS=(89.58849309285478,91.38825149536129,1.295108767881461)
DEMO_IDS={'G0165','C0016','G0181','C0031','A3457','LR002','R5_F3457_P1','R5_F3457_P2','R5_F3457_P3','R5_F3457_P4','R5_F3457_P5','R5_F3457_P6'}
def read(rel):return json.loads((SRC/rel).read_text(encoding='utf-8-sig'))
def digest(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def plate(p):return [float(p[i])*SCALE+TRANS[i] for i in range(3)]

a=read('R4_A_F2_PRINT_PREPARATION/A/data/structure.json')['members'];lr=read('R4_A_MINI_LOCAL_LOBE_R1/data/ADDED.json');roots=read('R4_ROOT_LAUNCH_R5/data/FROZEN_ADDITIONS.json')
support=read('R4_A_F2_PRINT_PREPARATION/A/data/support_geometry.json')['objects'];surface=read('R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface'];assignment=read('R4_A_F2_PRINT_PREPARATION/A/data/FLOWER_PRINT_ASSIGNMENT.json')
source_groups=[('A_ORIGINAL',a),('LOCAL_LOBE',lr),('FROZEN_ROOT',roots)]
records=[]
for group,rows in source_groups:
 for r in rows:
  rec={'id':r['id'],'source_group':group,'source_record':r,'points_source_mm':r['points_mm'],'points_plate_mm':[plate(p) for p in r['points_mm']]}
  records.append(rec)
assert len(records)==9421
index={r['id']:i for i,r in enumerate(records)}
assert DEMO_IDS<=set(index)
demo_rows=[r for r in records if r['id'] in DEMO_IDS]
# Preserve exact source tables and all per-member metadata, including radius profiles, ancestry, parent/target, mesh source and lineage.
ledger={'schema':'MINIA_SOURCE_LEDGER_V1','units':'Blender unit = 1 mm; scene scale_length=0.001','baseline_editable_sha256':'2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736','baseline_native_lock_sha256':'04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded','source_to_plate':{'scale':SCALE,'translation_mm':list(TRANS)},'source_group_counts':{'A_ORIGINAL':len(a),'LOCAL_LOBE':len(lr),'FROZEN_ROOT':len(roots)},'records':records,'flower_records':surface,'flower_print_assignment':assignment,'support_records':support,'demo_region':{'label':'DEMO — F3457/G0181 selected geometry region, not identified physical damage','member_ids':sorted(DEMO_IDS),'evidence':'outputs/SELECTED_GEOMETRY_CONTACTS.json'},'weak_point_markers':[{'id':'REPAIR_001','status':'UNSET','position_plate_mm':None,'comment':'No damage location was identified in source. Author may add an Empty named REPAIR_001 and a comment custom property after locating a weak area.'}]}
ledger_path=WORK/'MINIA_SOURCE_LEDGER.json'
ledger_path.write_text(json.dumps(ledger,separators=(',',':'),ensure_ascii=False),encoding='utf-8')
# Start fresh; never open or modify a source blend/3MF as the output scene.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name=='Collection':bpy.data.collections.remove(c)
def coll(name):
 c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
col_global=coll('PERMANENT_EXISTING • all 9421 paths • toggle for overview')
col_local=coll('DEMO_F3457 • local source reference • not known damage')
col_anchor_global=coll('AUTHOR_EDIT • global endpoint anchors • hidden by default')
col_anchor_demo=coll('AUTHOR_EDIT • DEMO local endpoint anchors • select two then F')
col_flower_global=coll('REFERENCE_OUTER_LOCKED • global frozen flower template instances')
col_flower_demo=coll('REFERENCE_OUTER_LOCKED • DEMO flower template proxies')
col_support=coll('REMOVABLE_SUPPORT_REFERENCE • hidden by default')
col_weak=coll('WEAK_POINT_MARKERS • author supplied only')
col_stage=coll('DISPLAY_ONLY • camera and lights')
mat_a=material('Source permanent • gray',(0.43,0.49,0.55));mat_demo=material('DEMO source • muted blue',(0.22,0.55,0.69));mat_auth=material('New authored branch • orange',(1.0,0.26,0.035));mat_support=material('Support source • muted gray',(0.3,0.36,0.42))

def build_lines(name,rows,col,mat,group_ids=None):
 verts=[];edges=[];rid=[];radius=[];end=[]
 for r in rows:
  pts=r['points_plate_mm'];base=len(verts);verts.extend([tuple(p) for p in pts]);edges.extend((base+i,base+i+1) for i in range(len(pts)-1));ri=index[r['id']];rad=float(r['source_record'].get('radius_mm',r['source_record'].get('nominal_diameter_mm',0.5)/2) or 0.25);tip=float(r['source_record'].get('tip_diameter_mm',2*rad) or 2*rad)/2
  for i in range(len(pts)):
   t=i/max(1,len(pts)-1);rid.append(ri);radius.append((rad*(1-t)+tip*t)*SCALE);end.append(i/(max(1,len(pts)-1)))
 mesh=bpy.data.meshes.new(name+' • polyline centerlines');mesh.from_pydata(verts,edges,[]);mesh.update()
 for nm,typ,vals in [('source_record_index','INT',rid),('radius_mm_plate','FLOAT',radius),('point_t','FLOAT',end)]:
  at=mesh.attributes.new(nm,typ,'POINT')
  for x,v in zip(at.data,vals):x.value=v
 ob=bpy.data.objects.new(name,mesh);col.objects.link(ob);ob.data.materials.append(mat);ob.hide_select=True;ob['display_only']=True;ob['manufacturing_geometry']=False;ob['source_record_count']=len(rows);ob['purpose']='locked source-line locator; original centerline/ID/radius in embedded ledger'
 # Bevel is a viewport/render display effect over source line edges only.
 bevel=ob.modifiers.new('Display stroke • not export geometry','BEVEL');bevel.width=0.22;bevel.segments=1
 ob.hide_render=False
 return ob

# Global references are grouped to toggle and stay locked.
col_global.hide_viewport=True;col_global.hide_render=True
for group,rows in source_groups:
 build_lines(group+' • locked source centerlines', [r for r in records if r['source_group']==group], col_global,mat_a)
build_lines('DEMO F3457/G0181 • selected source centerlines',demo_rows,col_local,mat_demo)

# Full endpoint anchors and compact local subset; no edges exist in either baseline mesh.
def anchor_mesh(name,rows,col):
 v=[];reg=[]
 for r in rows:
  ri=index[r['id']]
  for ep,p in [('START',r['points_plate_mm'][0]),('END',r['points_plate_mm'][-1])]:
   ai=len(v);v.append(tuple(p));reg.append({'anchor_id':f"{r['id']}:{ep}",'anchor_index':ai,'record_index':ri,'record_id':r['id'],'endpoint':ep,'position_plate_mm':p})
 m=bpy.data.meshes.new(name+' • vertex only; no pre-existing edges');m.from_pydata(v,[],[]);m.update()
 for nm,typ,vals in [('anchor_index','INT',range(len(reg))),('record_index','INT',[x['record_index'] for x in reg]),('endpoint_index','INT',[0 if x['endpoint']=='START' else 1 for x in reg])]:
  at=m.attributes.new(nm,typ,'POINT')
  for x,value in zip(at.data,vals):x.value=int(value)
 o=bpy.data.objects.new(name,m);col.objects.link(o);o.show_wire=True;o.show_all_edges=True;o.display_type='WIRE';o.color=(1.0,0.25,0.03,1);o['baseline_edge_count']=0;o['anchor_count']=len(reg);o['editing']='Select exactly two existing vertices in Edit Mode and press F. Movement/deletion is detected by extract_edit_delta.py.'
 return o,reg
all_anchor,all_reg=anchor_mesh('AUTHOR_EDIT_ANCHORS_ALL • locked reference positions',records,col_anchor_global)
demo_anchor,demo_reg=anchor_mesh('AUTHOR_EDIT_ANCHORS_DEMO • 26 local points, no edges',demo_rows,col_anchor_demo)
all_anchor.hide_select=True;col_anchor_global.hide_viewport=True;col_anchor_global.hide_render=True

# Reuse the saved, frozen D6 template as an exact template instance, clearly a display proxy only.
with bpy.data.libraries.load(str(D6BLEND),link=False) as (src,dst):
 dst.objects=['D6_SIZE_RHYTHM_4283','D_BACKARC_63_D6_REFERENCE']
 dst.node_groups=['D6_SAVED_SIZE_ASSIGNMENT_PETAL_COUNT_SEPARATE']
objs={o.name:o for o in dst.objects if o}
d6=objs['D6_SIZE_RHYTHM_4283'];template=objs['D_BACKARC_63_D6_REFERENCE']
# Restrict display to point instances: source positions/orientations remain authority; per-flower geometry variant assignment is not rebuilt.
# Keep a global instance object hidden as a collection toggle.
for n in list(d6.users_collection):n.objects.unlink(d6)
col_flower_global.objects.link(d6);d6.scale=(SCALE,)*3;d6.location=TRANS;d6.hide_select=True;d6.hide_render=True;d6['display_only']=True;d6['manufacturing_geometry']=False;d6['shape_fidelity']='Frozen D6 template instance at source position/orientation; assigned per-flower variant is not reconstructed, so shape is a template proxy.'
for n in list(template.users_collection):n.objects.unlink(template)
col_flower_global.objects.link(template);template.hide_select=True;template.hide_render=True;template.hide_viewport=True;template['display_only']=True
# Subset the saved D6 points to F3457 with all named point attributes preserved.
sv=read('R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface'];f=next(x for x in sv if x['id']=='F3457')
source_mesh=d6.data;idx=next(i for i,v in enumerate(source_mesh.vertices) if int(source_mesh.attributes['flower_id'].data[i].value)==3457)
attrs={nm:source_mesh.attributes[nm].data[idx] for nm in ['physical_scale','orientation','flower_id','source_size_motif_id','petal_count','template_id']}
point_mesh=bpy.data.meshes.new('F3457 single exact source point with D6 saved instance attributes');point_mesh.from_pydata([tuple(f['position_mm'])],[],[]);point_mesh.update()
for nm,srcattr in attrs.items():
 old=source_mesh.attributes[nm];at=point_mesh.attributes.new(nm,old.data_type,'POINT')
 if old.data_type=='FLOAT_VECTOR':at.data[0].vector=tuple(srcattr.vector)
 elif old.data_type=='FLOAT':at.data[0].value=srcattr.value
 else:at.data[0].value=srcattr.value
local_flower=bpy.data.objects.new('DEMO FLOWER F3457 • D6 template instance proxy',point_mesh);col_flower_demo.objects.link(local_flower);local_flower.scale=(SCALE,)*3;local_flower.location=TRANS
ng=d6.modifiers[0].node_group
mod=local_flower.modifiers.new('Frozen D6 template display only','NODES');mod.node_group=ng
for node in ng.nodes:
 if node.bl_idname=='GeometryNodeObjectInfo':node.inputs['Object'].default_value=template
local_flower['flower_id']='F3457';local_flower['display_only']=True;local_flower['manufacturing_geometry']=False;local_flower['position_orientation']='source position and saved D6 orientation attributes';local_flower['shape_fidelity']='D6 template proxy; per-flower assigned variant is not reconstructed.';local_flower['orientation_euler_source']=list(attrs['orientation'].vector)

def make_support_mesh():
 rows=support;verts=[];edges=[]
 for r in rows:
  pts=[plate(p) for p in r.get('points_mm',[])]
  b=len(verts);verts.extend([tuple(p) for p in pts]);edges.extend((b+i,b+i+1) for i in range(len(pts)-1))
 m=bpy.data.meshes.new('Support source centerlines only');m.from_pydata(verts,edges,[]);m.update();o=bpy.data.objects.new('Authored Support locators • 22,373 objects, 49,819 points',m);col_support.objects.link(o);o.data.materials.append(mat_support);o.hide_select=True;o.hide_render=True;o['display_only']=True;o['manufacturing_geometry']=False;return o
sup=make_support_mesh();col_support.hide_viewport=True;col_support.hide_render=True

# Add marker authoring empty only when a real position is supplied; leave no default marker in the scene.
col_weak['author_instructions']='Add an Empty > Plain Axes at the identified location; name it REPAIR_001; add custom string property comment. Extractor stores its name, position, and comment. No damage location is asserted here.'

scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=0.001;scene.unit_settings.length_unit='MILLIMETERS'
scene['editor_version']='MINIA_INTERNAL_REPAIR_EDITOR_V1';scene['baseline_editable_sha256']='2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736';scene['baseline_source_lock_sha256']='04f2e6797957b3d6ac8096ba0468fae906d540cdaa9d71e7cac7a3cef34d8ded';scene['manufacturing_geometry_changed']=False;scene['slice_send_print_count']=0;scene['demo_region']='F3457/G0181 selected geometry region; not physical damage identification'
ledger['anchor_registry_all']=all_reg;ledger['anchor_registry_demo']=demo_reg;ledger['support_locator_point_count']=49819
text=bpy.data.texts.new('MINIA_SOURCE_LEDGER.json');text.write(json.dumps(ledger,separators=(',',':'),ensure_ascii=False))

# local DEMO preview scene
center=Vector((42.0,91.0,41.0));camd=bpy.data.cameras.new('DEMO overview camera');cam=bpy.data.objects.new('DEMO overview camera',camd);col_stage.objects.link(cam);cam.location=center+Vector((25,-50,25));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=55;scene.camera=cam
ld=bpy.data.lights.new('DEMO softbox','AREA');lo=bpy.data.objects.new('DEMO softbox',ld);col_stage.objects.link(lo);lo.location=center+Vector((-20,-35,45));ld.energy=1900;ld.size=70;lo.rotation_euler=(center-lo.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.world.color=(0.055,0.065,0.08)
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   r3d=area.spaces.active.region_3d;r3d.view_location=center;r3d.view_distance=65;r3d.view_rotation=cam.rotation_euler.to_quaternion();r3d.view_perspective='ORTHO'
# Open in Edit Mode on only local anchor points for direct 2-point F operation.
bpy.ops.object.select_all(action='DESELECT');demo_anchor.select_set(True);bpy.context.view_layer.objects.active=demo_anchor
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
# Keep local anchors active; guide enters Edit Mode, so start scene in Object Mode and avoid accidental geometry edits.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print(json.dumps({'blend':str(BLEND),'bytes':BLEND.stat().st_size,'sha256':digest(BLEND),'source_records':len(records),'demo_records':len(demo_rows),'global_anchors':len(all_reg),'demo_anchors':len(demo_reg),'support_objects':len(support),'support_points':sum(len(x.get('points_mm',[])) for x in support),'author_edges':len(demo_anchor.data.edges),'flower_instances_total':4283,'display_flower_proxy':'D6 template, per-flower variants not rebuilt'}))

