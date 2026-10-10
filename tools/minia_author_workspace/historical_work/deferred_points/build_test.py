import bpy,bmesh,runpy,json,sys
from pathlib import Path
from mathutils import Vector
out=Path.cwd()/'outputs';sys.path.insert(0,str(out/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;obj=bpy.data.objects[mp.ANCHOR]
def snap():
 if obj.mode=='EDIT':obj.update_from_editmode()
 m=obj.data
 return ([tuple(v.co) for v in m.vertices],[tuple(e.vertices) for e in m.edges],len(m.polygons),{a.name:[d.value for d in a.data] for a in m.attributes if a.domain=='POINT' and a.data_type in ('FLOAT','INT')})
before=snap()
runpy.run_path(str(out/'MINIA_DEFERRED_POINTS_BOOTSTRAP.py'))
import deferred_points_runtime as auto
assert snap()==before,'Opening changed geometry'
s=bpy.context.scene;state=mp.scan_state(s,True);positions=dict(state['id_to_pos']);refs=mp._verify_references(s)
assert not any(k.idname=='mini_a.connect_auto_points' for km in bpy.context.window_manager.keyconfigs.addon.keymaps for k in km.keymap_items)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'MINIA_POINTS_ON_COLOR_UPDATE.blend'),compress=True)
# Disposable new connection: no vertices added by standard F operation.
bm=state['bm'];bm.verts.ensure_lookup_table();a=bm.verts[0]
candidates=[v for v in bm.verts if v!=a and not any(v in e.verts for e in a.link_edges)]
b=max(candidates,key=lambda v:(v.co-a.co).length)
length=(mp._world(obj,a.co)-mp._world(obj,b.co)).length
for v in bm.verts:v.select_set(False)
a.select_set(True);b.select_set(True);bmesh.update_edit_mesh(obj.data)
oldn=len(bm.verts);olde=len(bm.edges)
assert bpy.ops.mesh.edge_face_add()=={'FINISHED'}
assert len(bm.verts)==oldn and len(bm.edges)==olde+1
print('F_NO_ADDED_POINTS_PASS',length,flush=True)
r=mp.update_colors();assert r['status']=='CURRENT',r
st=mp.scan_state(s,False)
assert len(st['id_to_pos'])>=oldn+auto.divisions(length)-1
assert all((Vector(p)-Vector(st['id_to_pos'][sid])).length<1e-7 for sid,p in positions.items())
assert refs==mp._verify_references(s)
assert max((Vector(e['a_position'])-Vector(e['b_position'])).length for e in st['edge_rows'])<10.0001
qa={'status':'PASS','saved_original_geometry_unchanged':True,'saved_vertices':len(before[0]),'saved_edges':len(before[1]),'F_vertex_count_unchanged':True,'test_new_line_mm':length,'points_added_on_color_update':len(st['id_to_pos'])-oldn,'color_update':'CURRENT','existing_points_preserved':True,'source_refs':refs,'test_connection_saved':False,'interactive_keypress':'NOT_TESTED; standard F operator tested in background'}
(out/'MINIA_DEFERRED_POINTS_QA.json').write_text(json.dumps(qa,indent=2));print(json.dumps(qa),flush=True)
