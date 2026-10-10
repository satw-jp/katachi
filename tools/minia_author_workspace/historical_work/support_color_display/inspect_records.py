import bpy
for t in bpy.data.texts:print('TEXT',t.name,len(t.as_string()))
for o in bpy.data.objects:
 if o.name in ('A_ORIGINAL • source centerlines','LOCAL_LOBE • source centerlines','FROZEN_ROOT • source centerlines'):
  print('ATTR',o.name,[(a.name,a.domain,a.data_type) for a in o.data.attributes], 'props',list(o.keys()))
