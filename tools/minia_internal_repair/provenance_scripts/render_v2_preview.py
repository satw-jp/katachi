import bpy,math
from mathutils import Vector
from pathlib import Path
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1120;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(Path(bpy.data.filepath).parent/'MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_PREVIEW.png')
cam=scene.camera
if not cam:raise RuntimeError('V2 preview camera is missing')
frame=cam.data.view_frame(scene=scene);x0=min(v.x for v in frame);y1=max(v.y for v in frame);z=sum(v.z for v in frame)/len(frame)
# Temporary camera-facing labels for a readable review render; these objects are never saved to the blend.
mat=bpy.data.materials.new('TEMP preview text');mat.diffuse_color=(0.03,0.08,0.12,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.03,0.08,0.12,1);mat.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(0.03,0.08,0.12,1);mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=1.0
texts=['MINI_A  •  LAYERWISE HOLDING ROUTES  •  V2','F3457 DEMO  |  MODEL Z 43.2 mm  |  PRINT + SUPPORT','MIXED / physical contact and toolpath remain unverified','Blue lines: full source editing refs, not held routes  •  gray dashed: graph schematic']
for i,line in enumerate(texts):
 cu=bpy.data.curves.new('TEMP HUD','FONT');cu.body=line;cu.size=(max(x0*-2,8))*0.018;cu.align_x='LEFT';cu.extrude=0
 ob=bpy.data.objects.new('TEMP HUD '+str(i),cu);scene.collection.objects.link(ob);ob.location=cam.matrix_world@Vector((x0+0.18,y1-0.85-i*cu.size*1.6,z));ob.rotation_euler=cam.rotation_euler;ob.data.materials.append(mat)
bpy.ops.render.render(write_still=True)
print('PREVIEW',scene.render.filepath,flush=True)
