import bpy,functools
print=functools.partial(print,flush=True)
from mathutils import Euler,Vector
area=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
print('QUADS',[(q.as_pointer(),q.use_clip_planes) for q in area.spaces.active.region_quadviews])
for r in area.regions:
 if r.type!='WINDOW':continue
 with bpy.context.temp_override(area=area,region=r):
  q=bpy.context.region_data
  print('REGION',r.width,r.height,q.as_pointer() if q else None)
  if q:
   q.use_clip_planes=False
   q.update()
   print('MATRIX',list(q.perspective_matrix[0]))
   area.spaces.active.shading.type='SOLID'
   print('CLIP',bpy.ops.view3d.clip_border('EXEC_DEFAULT',xmin=100,xmax=500,ymin=100,ymax=500))
   print('PLANES',[list(p) for p in q.clip_planes])
   print('CLEAR',bpy.ops.view3d.clip_border('INVOKE_DEFAULT'))

