import bpy
area=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D');qs=area.spaces.active.region_quadviews
for r in area.regions:
 if r.type!='WINDOW':continue
 with bpy.context.temp_override(window=bpy.context.window,area=area,region=r):
  print('CONTEXT',bpy.context.region_data.as_pointer(),flush=True)
  print(bpy.ops.view3d.clip_border('EXEC_DEFAULT',xmin=100,xmax=500,ymin=100,ymax=500),[q.use_clip_planes for q in qs],flush=True)
  print(bpy.ops.view3d.clip_border('INVOKE_REGION_WIN'),[q.use_clip_planes for q in qs],flush=True)
