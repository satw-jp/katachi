import bpy,json
from mathutils import Vector
scene=bpy.context.scene;center=Vector((42.93,95.76,36.495));cam=scene.camera;cam.location=center+Vector((0,-105,10));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=78
for o in bpy.data.objects:
 if o.type=='LIGHT' and 'softbox' in o.name.lower():o.location=center+Vector((-35,-35,55));o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
for s in bpy.data.screens:
 for a in s.areas:
  if a.type=='VIEW_3D':
   rv=a.spaces.active.region_3d;rv.view_location=center;rv.view_distance=83;rv.view_rotation=cam.rotation_euler.to_quaternion();rv.view_perspective='ORTHO'
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath);scene.render.filepath=r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\outputs\\MINIA_INTERNAL_REPAIR_EDITOR_PREVIEW.png';scene.render.image_settings.file_format='PNG';scene.render.resolution_percentage=80;bpy.ops.render.render(write_still=True)
print(json.dumps({'blend':bpy.data.filepath,'preview':scene.render.filepath}),flush=True)
