import bpy
s=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D').spaces.active
q=s.region_quadviews
print('BEFORE',[(x.lock_rotation,x.use_box_clip) for x in q],flush=True)
q[0].lock_rotation=True
print('AFTER',[(x.lock_rotation,x.use_box_clip) for x in q],flush=True)
