import bpy,json
from pathlib import Path
mats={'Protected source • gray':(.48,.58,.67,1),'DEMO source path • blue':(.12,.43,.65,1),'AUTHOR_EDIT • orange':(1,.22,.015,1),'D6 flower template proxy':(.70,.43,.78,1),'Support centerline • gray':(.32,.4,.48,1)}
for n,col in mats.items():
 m=bpy.data.materials.get(n)
 if not m:continue
 m.diffuse_color=col;m.use_nodes=True
 bsdf=next((x for x in m.node_tree.nodes if x.type=='BSDF_PRINCIPLED'),None)
 if bsdf:
  bsdf.inputs['Base Color'].default_value=col;bsdf.inputs['Roughness'].default_value=.72
  for socket in bsdf.inputs:
   if socket.name=='Emission Color':socket.default_value=col
   elif socket.name=='Emission Strength':socket.default_value=.35 if 'orange' not in n.lower() else .8
scene=bpy.context.scene
if scene.world:
 scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background')
 if bg:bg.inputs['Color'].default_value=(.75,.79,.84,1);bg.inputs['Strength'].default_value=.8
for o in bpy.data.objects:
 if o.type=='LIGHT' and 'softbox' in o.name.lower():o.data.energy=8000
a=scene.view_settings
try:a.view_transform='Standard'
except:pass
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
scene.render.filepath=r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\outputs\\MINIA_INTERNAL_REPAIR_EDITOR_PREVIEW.png';scene.render.image_settings.file_format='PNG';scene.render.resolution_percentage=80
bpy.ops.render.render(write_still=True)
p=Path(scene.render.filepath);print(json.dumps({'saved_blend':bpy.data.filepath,'preview':str(p),'preview_bytes':p.stat().st_size}),flush=True)
