import bpy,sys
from pathlib import Path
import bmesh
out=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs')
sys.path.insert(0,str(out/'color_path_runtime'))
import color_path_runtime as rt
import route_v2_panel
o=bpy.data.objects[rt.ANCHOR]
ledger,_=route_v2_panel._load_ledger(bpy.context.scene)
expected=route_v2_panel._expected_rows(ledger['records'])
if bpy.context.mode=='EDIT_MESH':bpy.ops.object.mode_set(mode='OBJECT')
attr=o.data.attributes['anchor_index'];idx={expected[int(attr.data[i].value)]['anchor_id']:i for i in range(len(o.data.vertices))}
bpy.ops.object.mode_set(mode='EDIT')
def edges():
 bm=bmesh.from_edit_mesh(o.data);bm.verts.ensure_lookup_table();bm.verts.index_update();return len(bm.edges)
print('start',bpy.context.scene.get('color_map_state'),edges(),rt._anchor_signature(),bpy.context.scene.get('color_anchor_signature'))
bm=bmesh.from_edit_mesh(o.data);bm.verts.ensure_lookup_table();
for v in bm.verts:v.select_set(False)
for n in ('A1472:END','A3369:END'):bm.verts[idx[n]].select_set(True)
bmesh.update_edit_mesh(o.data,destructive=False)
bpy.ops.ed.undo_push(message='before F')
bpy.ops.mesh.edge_face_add();bmesh.update_edit_mesh(o.data,destructive=True)
print('afterF',edges(),rt._anchor_signature())
rt.poll_state();print('stalebyPoll',bpy.context.scene.get('color_map_state'),bpy.context.scene.get('color_anchor_signature'))
bpy.ops.ed.undo();bmesh.update_edit_mesh(o.data,destructive=True)
print('afterUndo',edges(),rt._anchor_signature(),bpy.context.scene.get('color_anchor_signature'))
rt.poll_state();print('afterUndoPoll',bpy.context.scene.get('color_map_state'),bpy.context.scene.get('color_map_stale_reason'))
