import bpy
print([(a.type,[(r.type,r.width,r.height,r.x,r.y) for r in a.regions]) for a in bpy.context.screen.areas])
