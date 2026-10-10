import bpy,sys,json,hashlib
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');sys.path.insert(0,str(root/'outputs'/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;obj=bpy.data.objects[mp.ANCHOR];scene=bpy.context.scene
r={'sha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'mesh':[len(obj.data.vertices),len(obj.data.edges),len(obj.data.polygons)],'mode':obj.mode}
try:
 st=mp.scan_state(scene,False);r.update({'guard':'PASS','midpoints':len(st['mid_records']),'author_edges':len(st['edge_rows']),'roots':len(st['roots']),'refs':mp._verify_references(scene)})
except Exception as e:r.update({'guard':'HOLD','error':repr(e)})
print('LATEST_QUAD='+json.dumps(r,ensure_ascii=False),flush=True)
print('REGION_CLIP_RNA='+json.dumps([{'id':p.identifier,'readonly':p.is_readonly,'type':p.type,'length':getattr(p,'array_length',0)} for p in bpy.types.RegionView3D.bl_rna.properties if 'clip' in p.identifier],ensure_ascii=False),flush=True)
