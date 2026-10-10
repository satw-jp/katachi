import bpy,sys,json,hashlib,time
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');sys.path.insert(0,str(root/'outputs'/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint
obj=bpy.data.objects.get(mp.ANCHOR)
res={'filepath':bpy.data.filepath,'anchor_object_exists':bool(obj),'mode':obj.mode if obj else None,'vertex_count':len(obj.data.vertices) if obj else None,'edge_count':len(obj.data.edges) if obj else None,'polygon_count':len(obj.data.polygons) if obj else None,'midpoint_count':None,'source_reference_count':len([o for o in bpy.data.objects if o.get('source_reference')]),'selected_vertex_count':None,'guard_status':None,'guard_error':None}
if obj:
 res['selected_vertex_count']=sum(v.select for v in obj.data.vertices)
 try:
  st=mp.scan_state(bpy.context.scene,False)
  res.update(midpoint_count=len(st['mid_records']),author_edge_count=len(st['edge_rows']),root_count=len(st['roots']),guard_status='PASS')
 except Exception as e:res['guard_status']='HOLD';res['guard_error']=repr(e)
print('SELECTED_POINT_BASELINE='+json.dumps(res,ensure_ascii=False),flush=True)
