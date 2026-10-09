import bpy,json,pathlib
from mathutils import Matrix
import route_v2_panel as p
o=next(o for o in bpy.data.objects if o.get('source_reference') and o.type=='MESH')
original=o.matrix_world.copy()
o.matrix_world=Matrix.Translation((.01,0,0))@original
bpy.context.view_layer.update()
r=p.reevaluate()
assert r['status']=='HOLD',r
assert r.get('issues'),r
report={'pass':True,'fixture':'In-memory protected reference transform changed by 0.01 mm; no .blend saved','object':o.name,'observed':r,'author_blend_modified':False}
o.matrix_world=original
(pathlib.Path(bpy.data.filepath).parent/'V2_REFERENCE_GUARD_CHECK.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2),flush=True)
