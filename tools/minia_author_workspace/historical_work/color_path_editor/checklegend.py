import bpy
for o in bpy.data.objects:
 if 'legend' in o.name.lower(): print(o.name,repr(getattr(o.data,'body',None)),getattr(o.data,'size',None),o.location[:])
