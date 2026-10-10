import bpy,json,hashlib
from pathlib import Path
B=Path('J:/My Drive/codex/2026-09-10/r4-astra-mocomoco-j-my-drive/outputs')
p=B/'R4_A1_INTERNAL_PATH_EDITOR/blend/R4_A1_INTERNAL_PATHS_EDIT_AS.blend'
bpy.ops.wm.open_mainfile(filepath=str(p))
rows=[]
for o in bpy.data.objects:
 if o.type=='MESH':
  if o.mode=='EDIT':bpy.context.view_layer.objects.active=o;bpy.ops.object.mode_set(mode='OBJECT')
  rows.append({'name':o.name,'vertices':len(o.data.vertices),'edges':len(o.data.edges),'faces':len(o.data.polygons),'matrix':list(map(list,o.matrix_world)),'attributes':[a.name for a in o.data.attributes]})
r={'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'units':bpy.context.scene.unit_settings.scale_length,'objects':rows,'source_binding':'A source records this exact Author-edited blend SHA as ancestor, not current print baseline'}
Path(__file__).resolve().parents[1].joinpath('outputs/OLD_EDITOR_INSPECTION.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
print(json.dumps(r))
