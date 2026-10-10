import bpy,functools
print=functools.partial(print,flush=True)
a=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
for name in ('view_matrix','window_matrix','perspective_matrix'):
 print(name,bpy.types.RegionView3D.bl_rna.properties[name].is_readonly)
for r in a.regions:
 if r.type!='WINDOW':continue
 with bpy.context.temp_override(area=a,region=r):
  q=bpy.context.region_data
  q.use_clip_planes=False
  a.spaces.active.shading.type='SOLID'
  print('BEFORE',r.width,r.height)
  print('CLIP',bpy.ops.view3d.clip_border('EXEC_DEFAULT',xmin=100,xmax=500,ymin=100,ymax=500))
  print('PLANES',[list(p) for p in q.clip_planes])
  print('CLEAR',bpy.ops.view3d.clip_border('INVOKE_DEFAULT'))
