import bpy,sys,json,hashlib
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');sys.path.insert(0,str(root/'outputs'/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;obj=bpy.data.objects.get(mp.ANCHOR);scene=bpy.context.scene
r={'filepath':bpy.data.filepath,'blend_sha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'mesh':{'mode':obj.mode,'vertices':len(obj.data.vertices),'edges':len(obj.data.edges),'faces':len(obj.data.polygons),'point_attributes':sorted(a.name for a in obj.data.attributes if a.domain=='POINT')},'view3d_areas':sum(1 for sc in bpy.data.screens for a in sc.areas if a.type=='VIEW_3D'),'refs':len([o for o in bpy.data.objects if o.get('source_reference')])}
try:
 st=mp.scan_state(scene,False);r.update({'guard':'PASS','midpoints':len(st['mid_records']),'author_edges':len(st['edge_rows']),'author_roots':len(st['roots'])})
except Exception as e:r.update({'guard':'HOLD','error':repr(e)})
print('QUAD_BASELINE='+json.dumps(r,ensure_ascii=False),flush=True)
