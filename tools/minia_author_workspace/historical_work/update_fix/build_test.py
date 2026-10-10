import bpy,bmesh,runpy,json
from pathlib import Path
from mathutils import Vector
out=Path.cwd()/'outputs'
runpy.run_path(str(out/'MINIA_COLOR_UPDATE_FIXED_BOOTSTRAP.py'))
import guarded_points_runtime as auto
mp=auto.mp;s=bpy.context.scene;obj=bpy.data.objects[mp.ANCHOR];bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table()
faces=len(bm.faces);assert faces>0
coords=[tuple(v.co) for v in bm.verts];edges=sorted(tuple(sorted(v.index for v in e.verts)) for e in bm.edges)
refs=mp._verify_references(s)
assert bpy.ops.mini_a.update_midpoint_colors()=={'CANCELLED'}
assert s['midpoint_editor_state']=='HOLD';mp.poll_state();assert s['midpoint_editor_state']=='HOLD'
print('ROOT_CAUSE_FACES',faces,'HOLD_VISIBLE_PASS',flush=True)
bmesh.ops.delete(bm,geom=list(bm.faces),context='FACES_ONLY');bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=True)
bm.verts.ensure_lookup_table();bm.verts.index_update()
assert coords==[tuple(v.co) for v in bm.verts]
assert edges==sorted(tuple(sorted(v.index for v in e.verts)) for e in bm.edges)
st=mp.scan_state(s,True);positions=dict(st['id_to_pos'])
a=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D');region=next(r for r in a.regions if r.type=='WINDOW')
with bpy.context.temp_override(area=a,region=region):assert bpy.ops.mini_a.quick_color()=={'FINISHED'}
assert s['midpoint_editor_state']=='CURRENT';mp.poll_state();assert s['midpoint_editor_state']=='CURRENT'
new=mp.scan_state(s,False)
assert all((Vector(p)-Vector(new['id_to_pos'][sid])).length<1e-7 for sid,p in positions.items())
assert mp._verify_references(s)==refs
bpy.ops.wm.save_as_mainfile(filepath=str(out/'MINIA_COLOR_UPDATE_FIXED.blend'),compress=True)
# Disposable F checks after saving: reject 3 vertices, preserve standard 2-vertex provisional line.
bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table()
for v in bm.verts:v.select_set(False)
for v in list(bm.verts)[:3]:v.select_set(True)
bmesh.update_edit_mesh(obj.data);n=len(bm.verts);e=len(bm.edges)
assert bpy.ops.mini_a.connect_two_points()=={'CANCELLED'}
assert len(bm.faces)==0 and len(bm.edges)==e and len(bm.verts)==n
va=bm.verts[0];vb=max((v for v in bm.verts if v!=va and not any(v in edge.verts for edge in va.link_edges)),key=lambda v:(v.co-va.co).length)
for v in bm.verts:v.select_set(False)
va.select_set(True);vb.select_set(True);bmesh.update_edit_mesh(obj.data)
assert bpy.ops.mini_a.connect_two_points()=={'FINISHED'}
assert len(bm.verts)==n and len(bm.edges)==e+1 and not bm.faces
r={'status':'PASS','removed_faces_only':faces,'existing_vertices_unchanged':len(coords),'existing_edges_preserved_before_subdivision':len(edges),'final_vertices':len(new['id_to_pos']),'final_edges':len(new['edge_rows']),'source_refs':refs,'color_update_shortcut_operator':'CURRENT','button_hold_reason_persists':'PASS','three_point_F_rejected':'PASS','two_point_F_no_added_vertices':'PASS','test_connection_saved':False}
(out/'MINIA_COLOR_UPDATE_FIX_QA.json').write_text(json.dumps(r,indent=2));print(json.dumps(r),flush=True)
