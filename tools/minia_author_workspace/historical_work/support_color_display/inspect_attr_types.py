import bpy
for o in bpy.data.objects:
 if o.get('source_reference') and o.type=='MESH':print(o.name,[(a.name,a.domain,a.data_type) for a in o.data.attributes])
