import bpy
for o in bpy.data.objects:
 if o.name.startswith('Support distance •'):
  print(o.name,o.type,o.get('color_bin'),len(o.data.splines),o.data.bevel_depth,o.data.resolution_u,[len(s.points) for s in o.data.splines[:2]],o.hide_viewport,o.hide_render,o.hide_select)
