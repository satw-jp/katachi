import bpy,bmesh,runpy,json
from pathlib import Path
from mathutils import Vector
out=Path.cwd()/'outputs'
runpy.run_path(str(out/'MINIA_AUTO_POINTS_BOOTSTRAP.py'))
import auto_points_runtime as auto
mp=auto.mp;s=bpy.context.scene;st=mp.scan_state(s,False)
report=json.loads((out/'MINIA_AUTO_POINTS_QA.json').read_text())
assert len(st['id_to_pos'])==report['final_vertices'] and len(st['edge_rows'])==report['final_edges']
assert auto.subdivide()['source_added']==0
bm=st['bm'];bm.verts.ensure_lookup_table();base=[i for i,v in st['verts_by_index'].items() if v['anchor_index']>=0];ia=base[0];ib=max(base,key=lambda i:(bm.verts[i].co-bm.verts[ia].co).length)
a,b=bm.verts[ia],bm.verts[ib];length=(mp._world(st['obj'],a.co)-mp._world(st['obj'],b.co)).length
assert length>10 and not any(b in e.verts for e in a.link_edges)
for v in bm.verts:v.select_set(False)
a.select_set(True);b.select_set(True);bmesh.update_edit_mesh(st['obj'].data)
oldn=len(bm.verts);assert bpy.ops.mini_a.connect_auto_points()=={'FINISHED'}
new=mp.scan_state(s,False);added=len(new['id_to_pos'])-oldn
assert added==auto.divisions(length)-1
assert max((Vector(e['a_position'])-Vector(e['b_position'])).length for e in new['edge_rows'])<10.0001
assert auto.subdivide()['author_added']==0
report['fresh_reopen']='PASS';report['new_F_edge_test']={'length_mm':length,'auto_points':added,'guard':'PASS','repeat_no_extra_points':True};report['interactive_key_press']='NOT_TESTED: operator executed in background'
(out/'MINIA_AUTO_POINTS_QA.json').write_text(json.dumps(report,indent=2));print('NEW_F_BRANCH_PASS',length,added,flush=True)
# Deliberately do not save this disposable test edge.
