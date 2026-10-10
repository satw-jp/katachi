import bpy,json
from pathlib import Path
obj=bpy.data.objects.get('AUTHOR_EDIT_ALL • protected point baseline')
r={'filepath':bpy.data.filepath,'exists':bool(obj),'mode':obj.mode if obj else None,'verts':len(obj.data.vertices) if obj else None,'edges':len(obj.data.edges) if obj else None,'faces':len(obj.data.polygons) if obj else None,'attrs':sorted(a.name for a in obj.data.attributes) if obj else []}
print('LATEST_AUTHOR_MESH='+json.dumps(r,ensure_ascii=False),flush=True)
