import bpy
for c in bpy.data.collections: print('COL',c.name,'objects',len(c.objects),[o.name for o in c.objects[:3]])
