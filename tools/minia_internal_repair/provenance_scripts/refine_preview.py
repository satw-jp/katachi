import bpy,json
from mathutils import Vector
scene=bpy.context.scene;center=Vector((37,96,42));cam=scene.camera;cam.location=center+Vector((30,-58,32));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=72
for l in bpy.data.objects:
 if l.type=='LIGHT' and 'softbox' in l.name.lower():l.location=center+Vector((-20,-35,50));l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler()
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   r=area.spaces.active.region_3d;r.view_location=center;r.view_distance=76;r.view_rotation=cam.rotation_euler.to_quaternion();r.view_perspective='ORTHO'
for name,col in [('Preview anchor A • G0181 START',(1,.10,.02,1)),('Preview anchor B • A3457 END',(1,.72,.04,1))]:
 o=bpy.data.objects.get(name)
 if o:
  o.scale=(1.7,)*3
  m=bpy.data.materials.new(name+' marker emission');m.diffuse_color=col;m.use_nodes=True;b=next(x for x in m.node_tree.nodes if x.type=='BSDF_PRINCIPLED');b.inputs['Base Color'].default_value=col
  for sock in b.inputs:
   if sock.name=='Emission Color':sock.default_value=col
   elif sock.name=='Emission Strength':sock.default_value=3.0
  o.data.materials.clear();o.data.materials.append(m)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
scene.render.filepath=r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\outputs\\MINIA_INTERNAL_REPAIR_EDITOR_PREVIEW.png';scene.render.image_settings.file_format='PNG';scene.render.resolution_percentage=80
bpy.ops.render.render(write_still=True);print(json.dumps({'blend':bpy.data.filepath,'preview':scene.render.filepath}),flush=True)
